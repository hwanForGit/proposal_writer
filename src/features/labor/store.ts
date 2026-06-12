import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { genId } from '@/lib/id';

// 투입률 모드: 고정값 / [최소~최대] 범위
export type RateMode = 'fixed' | 'range';

// 단가 기준: 연봉(연간) / 월 단가
export type SalaryBasis = 'annual' | 'monthly';

// 지출 출처: 자부담 현물 / 정부출연금 / 자부담 현금 (인력별로 직접 선택)
export type FundingSource = 'inKind' | 'gov' | 'cash';

export interface Member {
  id: string;
  name: string; // 성명 / 역할
  salary: number; // 단가 금액(4대보험·퇴직금 포함) — basis에 따라 연봉 또는 월 단가, 원
  months: number; // 참여 개월
  mode: RateMode;
  rate: number; // 적용 투입률(%) — 산출에 실제 사용. range 모드면 [min,max] 내 값(자연수)
  minRate: number; // range 모드 최소(%)
  maxRate: number; // range 모드 최대(%)
  costAdjust: number; // 자동계산 정수율/개월 반올림 보정(원, 보통 ≤0). 입력 변경 시 0
  source: FundingSource; // 이 인력 인건비의 지출 출처
  salaryLocked: boolean; // 연봉총액 고정 — 자동계산이 안 바꿈
  monthsLocked: boolean; // 참여개월 고정 — 자동계산이 안 바꿈
  locked: boolean; // 인력 행 전체 고정(연봉·개월·투입률 모두 불변, 자동계산 제외)
  auto?: boolean; // 자동계산이 잔여 예산 채우려 생성한 인력. 재계산 때 (잠금 안 한) 것만 재생성.
}

interface LaborState {
  targetTotal: number | null; // 목표 총 인건비(원) = 세 출처 합(파생)
  salaryBasis: SalaryBasis;
  projectMonths: number; // 사업 기간(개월) — 참여개월 자동 조정 상한
  minMonths: number; // 자동 계산 시 전 인력 공통 참여개월 하한(0=하한 없음)
  members: Member[];
  // 지출 출처 예산(원) — 총사업비에서 가져오되 편집 가능
  sourceInKind: number; // 자부담 현물 (1순위)
  sourceGov: number; // 정부출연금 (2순위)
  sourceCash: number; // 자부담 현금 (3순위)
  // 정부출연금 인건비 한도 = 총사업비의 N%. 0이면 미사용(정부출연금 수동/전액).
  // 사용 시 정부출연금 예산 = max(0, 총사업비×N% − 자부담 현물)
  govLaborPct: number;

  setSalaryBasis: (b: SalaryBasis) => void;
  setProjectMonths: (v: number) => void;
  setMinMonths: (v: number) => void;
  setSourceInKind: (v: number) => void;
  setSourceGov: (v: number) => void;
  setSourceCash: (v: number) => void;
  setGovLaborPct: (v: number) => void;
  fillSourcesFromProject: (inKind: number, gov: number, cash: number) => void;
  addMember: () => void;
  removeMember: (id: string) => void;
  updateMember: (id: string, patch: Partial<Member>) => void;
  autoCalculate: () => void;
  resetAll: () => void;
}

const newMember = (): Member => ({
  id: genId('m'),
  name: '',
  salary: 0,
  months: 12,
  mode: 'range', // 기본: 투입률 변동(범위)
  rate: 100,
  minRate: 0,
  maxRate: 100,
  costAdjust: 0,
  source: 'gov',
  salaryLocked: false, // 기본: 연봉 변동
  monthsLocked: false, // 기본: 개월 변동
  locked: false,
});

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

// 산출 인건비는 천원 단위 내림(floor) 처리.
const ROUND_UNIT = 1000;
const floorTo = (x: number): number => Math.floor(x / ROUND_UNIT) * ROUND_UNIT;

// 잔여 예산을 채우려고 자동 생성하는 임의 인력의 현실적 연봉대(원). 큰 단가부터 채움.
const ANNUAL_BAND = [72_000_000, 64_000_000, 56_000_000, 50_000_000, 44_000_000];
const MONTHLY_BAND = [6_000_000, 5_300_000, 4_700_000, 4_200_000, 3_700_000];
const MAX_AUTO_MEMBERS = 30; // 자동 생성 인력 수 안전 상한

// 입력이 바뀌면 자동 배분으로 넣어둔 잔액 조정은 무효 → 모두 0으로 초기화
const cleared = (ms: Member[]): Member[] =>
  ms.map((m) => (m.costAdjust ? { ...m, costAdjust: 0 } : m));

const sumTarget = (a: number, b: number, c: number): number | null => {
  const s = (a || 0) + (b || 0) + (c || 0);
  return s > 0 ? s : null;
};

// 100% 투입 시 인건비. 연봉 기준이면 연봉×개월/12, 월 단가 기준이면 월단가×개월.
export const unitCost = (m: Member, basis: SalaryBasis): number => {
  const sal = Number(m.salary) || 0;
  const mo = Number(m.months) || 0;
  return basis === 'monthly' ? sal * mo : sal * (mo / 12);
};

// 실제 적용 투입률(%) — 고정/범위 공통으로 rate 사용하되 범위면 [min,max]로 클램프.
export const effectiveRate = (m: Member): number =>
  m.mode === 'range'
    ? clamp(Number(m.rate) || 0, Number(m.minRate) || 0, Number(m.maxRate) || 0)
    : Number(m.rate) || 0;

// 산출 인건비 = 투입률 기반 금액(천원 내림) + 잔액 조정(연봉 최고자에게만 부여됨)
export const memberCost = (m: Member, basis: SalaryBasis): number =>
  floorTo(unitCost(m, basis) * (effectiveRate(m) / 100)) +
  (Number(m.costAdjust) || 0);

export const totalCost = (members: Member[], basis: SalaryBasis): number =>
  members.reduce((sum, m) => sum + memberCost(m, basis), 0);

export interface SourceBudgets {
  inKind: number;
  gov: number;
  cash: number;
}

// 인력별로 선택한 출처(member.source)에 따라 출처별 배정 합계 산출.
export function sourceSums(
  members: Member[],
  basis: SalaryBasis,
): SourceBudgets {
  const sums: SourceBudgets = { inKind: 0, gov: 0, cash: 0 };
  for (const m of members) sums[m.source] += memberCost(m, basis);
  return sums;
}

export const useLaborStore = create<LaborState>()(
  persist(
    (set, get) => ({
      targetTotal: null,
      salaryBasis: 'annual',
      projectMonths: 12,
      minMonths: 0,
      members: [newMember()],
      sourceInKind: 0,
      sourceGov: 0,
      sourceCash: 0,
      govLaborPct: 0,

      setSalaryBasis: (b) =>
        set((s) => ({ salaryBasis: b, members: cleared(s.members) })),

      setProjectMonths: (v) =>
        set({ projectMonths: Math.max(0, Math.round(v || 0)) }),

      setMinMonths: (v) => set({ minMonths: Math.max(0, Math.round(v || 0)) }),

      setSourceInKind: (v) =>
        set((s) => {
          const val = Math.max(0, v || 0);
          return {
            sourceInKind: val,
            targetTotal: sumTarget(val, s.sourceGov, s.sourceCash),
            members: cleared(s.members),
          };
        }),
      setSourceGov: (v) =>
        set((s) => {
          const val = Math.max(0, v || 0);
          return {
            sourceGov: val,
            targetTotal: sumTarget(s.sourceInKind, val, s.sourceCash),
            members: cleared(s.members),
          };
        }),
      setSourceCash: (v) =>
        set((s) => {
          const val = Math.max(0, v || 0);
          return {
            sourceCash: val,
            targetTotal: sumTarget(s.sourceInKind, s.sourceGov, val),
            members: cleared(s.members),
          };
        }),
      setGovLaborPct: (v) => set({ govLaborPct: clamp(v || 0, 0, 100) }),

      fillSourcesFromProject: (inKind, gov, cash) =>
        set((s) => ({
          sourceInKind: Math.max(0, inKind || 0),
          sourceGov: Math.max(0, gov || 0),
          sourceCash: Math.max(0, cash || 0),
          targetTotal: sumTarget(inKind, gov, cash),
          members: cleared(s.members),
        })),

      addMember: () =>
        set((s) => ({ members: [...cleared(s.members), newMember()] })),

      removeMember: (id) =>
        set((s) => ({
          members:
            s.members.length > 1
              ? cleared(s.members.filter((m) => m.id !== id))
              : cleared(s.members), // 최소 1행 유지
        })),

      updateMember: (id, patch) =>
        set((s) => {
          // 금액에 영향 주는 변경만 잔액 조정 초기화(이름/출처 변경은 유지)
          const affectsCost = (
            ['salary', 'months', 'rate', 'minRate', 'maxRate', 'mode'] as const
          ).some((k) => k in patch);
          return {
            members: s.members.map((m) => {
              const base = m.id === id ? { ...m, ...patch } : m;
              return affectsCost && base.costAdjust
                ? { ...base, costAdjust: 0 }
                : base;
            }),
          };
        }),

      // 자동 계산하기 (잠금 인지 맞춤 + 잔여 자동 채움):
      // - 고정(잠금)된 값은 절대 안 바꾸고, 고정 안 된 값만 줄여 출처 예산에 맞춘다.
      //   조정 우선순위(한 차원만): 투입률(범위) → 참여개월 → 연봉총액.
      // - 투입률·연봉·개월의 '입력값'이 각 차원의 상한. 자동계산은 그 이하로만 줄인다.
      // - 출처: 현물 → 정부출연금 → 현금 순. ① 상한값·입력개월로 통째 들어가는 사람을 비용
      //   큰 순서로 채우고(FFD), ② 남는 예산은 '자유 차원이 있는 가장 작은 1명'을 경계로 삼아
      //   최우선 자유 차원만 줄여 정확 소진(투입률은 정수%, 초과분은 음수 costAdjust).
      // - 그래도 출처에 잔여가 남으면 임의 인력(auto)을 자동 추가해 채운다.
      //   재계산 때 (행 잠금 안 한) auto 인력은 빠지고 다시 생성됨. 🔒 잠근 건 유지.
      // - 자리 못 잡은 인력: 자유 차원 있으면 산출 0(제외), 전부 고정/행잠금이면 입력값 그대로(초과).
      autoCalculate: () => {
        const { salaryBasis, sourceInKind, sourceGov, sourceCash } = get();
        const Mproj = Math.max(1, Math.round(get().projectMonths || 12));
        const minM = clamp(Math.round(get().minMonths || 0), 0, Mproj);
        // 직전 auto 인력 중 (행 잠금 안 한) 것은 버리고 새로 채운다. 잠근 건 유지.
        const members = get().members.filter((m) => !m.auto || m.locked);

        const costAt = (salary: number, rate: number, months: number): number => {
          const unit =
            salaryBasis === 'monthly' ? salary * months : salary * (months / 12);
          return floorTo(unit * (rate / 100));
        };
        // 산출 전(내림 적용 전) 100%·입력개월 단가 — 투입률 역산용
        const baseAt = (salary: number, months: number): number =>
          salaryBasis === 'monthly' ? salary * months : salary * (months / 12);

        type Dim = 'rate' | 'months' | 'salary';
        // 인력별 캡(=입력값) + 자유 차원(우선순위) + 만월(상한값) 비용
        const info = members.map((m) => {
          const salary = Number(m.salary) || 0;
          const months = clamp(Math.round(Number(m.months) || 0), 0, Mproj);
          const rateCap = m.mode === 'range' ? Number(m.maxRate) || 0 : effectiveRate(m);
          const free: Dim[] = [];
          if (m.mode === 'range' && !m.locked) free.push('rate');
          if (!m.monthsLocked && !m.locked) free.push('months');
          if (!m.salaryLocked && !m.locked) free.push('salary');
          return {
            id: m.id,
            salary,
            months,
            rateCap,
            free,
            source: m.source,
            full: costAt(salary, rateCap, months),
          };
        });
        type Info = (typeof info)[number];

        // 경계 1명을 잔여 B에 맞춰 '최우선 자유 차원' 하나만 줄여 정확 소진.
        // 항상 산출 ≥ B(초과)로 만들고 초과분을 음수 costAdjust로 흡수.
        const fitBoundary = (
          x: Info,
          B: number,
        ): { salary: number; months: number; rate: number; costAdjust: number } => {
          const dim = x.free[0];
          if (dim === 'rate') {
            const base = baseAt(x.salary, x.months);
            let rate = base > 0 ? clamp(Math.ceil((B / base) * 100), 1, x.rateCap) : 0;
            while (rate < x.rateCap && costAt(x.salary, rate, x.months) < B) rate += 1;
            const cost = costAt(x.salary, rate, x.months);
            return { salary: x.salary, months: x.months, rate, costAdjust: B - cost };
          }
          if (dim === 'months') {
            const lo = Math.max(1, minM);
            let mo = x.months;
            let cost = costAt(x.salary, x.rateCap, x.months);
            for (let k = lo; k <= x.months; k++) {
              const c = costAt(x.salary, x.rateCap, k);
              if (c >= B) {
                mo = k;
                cost = c;
                break;
              }
            }
            return { salary: x.salary, months: mo, rate: x.rateCap, costAdjust: B - cost };
          }
          // salary: 투입률·개월 고정, 연봉만 줄여 맞춤
          const factor =
            (salaryBasis === 'monthly' ? x.months : x.months / 12) * (x.rateCap / 100);
          let sal = factor > 0 ? Math.ceil(B / factor) : 0;
          if (factor > 0 && floorTo(sal * factor) < B) {
            sal += Math.ceil((B - floorTo(sal * factor)) / factor);
          }
          sal = Math.min(sal, x.salary); // 입력값(상한) 초과 금지
          const cost = costAt(sal, x.rateCap, x.months);
          return { salary: sal, months: x.months, rate: x.rateCap, costAdjust: B - cost };
        };

        const buckets: { key: FundingSource; remaining: number }[] = [
          { key: 'inKind', remaining: sourceInKind || 0 },
          { key: 'gov', remaining: sourceGov || 0 },
          { key: 'cash', remaining: sourceCash || 0 },
        ];

        const bucketOf = (k: FundingSource) =>
          buckets.find((b) => b.key === k) as (typeof buckets)[number];

        const done = new Set<string>();
        const assign = new Map<
          string,
          { source: FundingSource; salary: number; months: number; rate: number; costAdjust: number }
        >();

        // 행 잠금(locked) 인력은 자동계산이 전혀 안 건드림. 현재 산출액만큼 자기 출처 예산에서
        // 미리 차감하고 done 처리(아래 FFD/경계/생성 제외, updated에서 원본 그대로 유지).
        for (const m of members) {
          if (!m.locked) continue;
          done.add(m.id);
          bucketOf(m.source).remaining -= memberCost(m, salaryBasis);
        }

        for (const bk of buckets) {
          // 1) 상한값으로 통째 들어가는 인력을 비용 큰 사람부터 채움(FFD).
          for (;;) {
            const whole = info
              .filter((x) => !done.has(x.id) && x.full > 0 && x.full <= bk.remaining)
              .sort((a, b) => b.full - a.full)[0];
            if (!whole) break;
            bk.remaining -= whole.full;
            done.add(whole.id);
            assign.set(whole.id, {
              source: bk.key,
              salary: whole.salary,
              months: whole.months,
              rate: whole.rateCap,
              costAdjust: 0,
            });
          }
          // 2) 자유 차원이 있는 '가장 작은' 미배정 1명을 경계로 정확 소진.
          if (bk.remaining > 0) {
            const boundary = info
              .filter((y) => !done.has(y.id) && y.full > 0 && y.free.length > 0)
              .sort((a, b) => a.full - b.full)[0];
            if (boundary) {
              const r = fitBoundary(boundary, bk.remaining);
              done.add(boundary.id);
              assign.set(boundary.id, { source: bk.key, ...r });
              bk.remaining = 0;
            }
          }
        }

        const updated = members.map((m) => {
          const a = assign.get(m.id);
          if (a) {
            return {
              ...m,
              salary: a.salary,
              months: a.months,
              rate: a.rate,
              source: a.source,
              costAdjust: a.costAdjust,
            };
          }
          // 행 잠금: 자동계산이 전혀 안 건드림(원본 그대로, costAdjust 포함 유지).
          if (m.locked) return m;
          // 미배정: 자유 차원 있으면 산출 0(제외), 전부 고정이면 입력값 그대로(초과 표시).
          if (!m.monthsLocked) return { ...m, months: 0, costAdjust: 0 };
          if (m.mode === 'range') return { ...m, rate: 0, costAdjust: 0 };
          if (!m.salaryLocked) return { ...m, salary: 0, costAdjust: 0 };
          return { ...m, costAdjust: 0 }; // 전부 고정 → 그대로
        });

        // 출처에 잔여가 남으면 임의 인력(auto)을 자동 추가해 정확히 채움.
        const band = (salaryBasis === 'monthly' ? MONTHLY_BAND : ANNUAL_BAND)
          .slice()
          .sort((a, b) => b - a); // 큰 단가부터
        const minFull = costAt(band[band.length - 1], 100, Mproj); // 가장 작은 단가의 만월 비용
        const generated: Member[] = [];
        let seq = members.filter((m) => m.auto).length; // 잠금 유지된 auto 번호 이어쓰기
        const newAuto = (
          source: FundingSource,
          salary: number,
          rate: number,
          costAdjust: number,
        ): Member => {
          seq += 1;
          return {
            // 기본 newMember()는 범위(mode:'range', maxRate:100) — 자동 인력도 범위로 둠.
            // 적용 투입률(rate)만 계산값으로 세팅(effectiveRate = clamp(rate,0,100) = rate).
            ...newMember(),
            name: `추가인력 ${seq} / 연구원`,
            salary,
            months: Mproj,
            rate,
            source,
            costAdjust,
            auto: true,
          };
        };

        for (const bk of buckets) {
          let R = bk.remaining;
          // 만월·100% 인력을 큰 단가부터 채움(최소 단가 만월 비용 이상 남아있는 동안).
          while (R >= minFull && generated.length < MAX_AUTO_MEMBERS) {
            const salary =
              band.find((v) => costAt(v, 100, Mproj) <= R) ?? band[band.length - 1];
            generated.push(newAuto(bk.key, salary, 100, 0));
            R -= costAt(salary, 100, Mproj);
          }
          // 마지막 1명: 가장 작은 단가로 '정수% 투입률'이 잔여 이상 되게 하고 초과분은 음수 costAdjust.
          if (R >= ROUND_UNIT && generated.length < MAX_AUTO_MEMBERS) {
            const salary = band[band.length - 1];
            const base = baseAt(salary, Mproj);
            let rate = base > 0 ? clamp(Math.ceil((R / base) * 100), 1, 100) : 0;
            while (rate < 100 && costAt(salary, rate, Mproj) < R) rate += 1;
            generated.push(newAuto(bk.key, salary, rate, R - costAt(salary, rate, Mproj)));
          }
        }

        set({ members: [...updated, ...generated] });
      },

      resetAll: () =>
        set({
          targetTotal: null,
          salaryBasis: 'annual',
          projectMonths: 12,
          minMonths: 0,
          members: [newMember()],
          sourceInKind: 0,
          sourceGov: 0,
          sourceCash: 0,
          govLaborPct: 0,
        }),
    }),
    {
      name: 'proposal_writer.labor.v1',
      storage: createJSONStorage(() => localStorage),
      version: 9,
      // v1: annualSalary → v2: salary+salaryBasis → v3: costAdjust → v4: 출처 예산
      //   → v5: Member.source → v6: Member.minMonths(폐기) → v7: 전역 minMonths
      //   → v8: salary/months/행 잠금(고정 체크박스) → v9: auto(자동추가) 복구
      migrate: (persisted) => {
        const s = (persisted ?? {}) as {
          targetTotal?: number | null;
          members?: Array<Record<string, unknown>>;
          salaryBasis?: SalaryBasis;
          projectMonths?: number;
          minMonths?: number;
          sourceInKind?: number;
          sourceGov?: number;
          sourceCash?: number;
          govLaborPct?: number;
        };
        const members: Member[] = Array.isArray(s.members)
          ? s.members.map((m) => ({
              id: typeof m.id === 'string' ? m.id : genId('m'),
              name: typeof m.name === 'string' ? m.name : '',
              salary: Number(m.salary ?? m.annualSalary ?? 0),
              months: Number(m.months ?? 12),
              mode: m.mode === 'range' ? 'range' : 'fixed',
              rate: Number(m.rate ?? 100),
              minRate: Number(m.minRate ?? 0),
              maxRate: Number(m.maxRate ?? 100),
              costAdjust: Number(m.costAdjust ?? 0),
              source:
                m.source === 'inKind' || m.source === 'cash'
                  ? m.source
                  : 'gov',
              salaryLocked: Boolean(m.salaryLocked),
              monthsLocked: Boolean(m.monthsLocked),
              locked: Boolean(m.locked),
              auto: Boolean(m.auto),
            }))
          : [newMember()];
        // 구버전 단일 목표는 정부출연금 출처로 이관
        const sourceInKind = Number(s.sourceInKind ?? 0);
        const sourceGov = Number(s.sourceGov ?? s.targetTotal ?? 0);
        const sourceCash = Number(s.sourceCash ?? 0);
        return {
          targetTotal: sumTarget(sourceInKind, sourceGov, sourceCash),
          salaryBasis: s.salaryBasis ?? 'annual',
          projectMonths: Number(s.projectMonths ?? 12),
          minMonths: Number(s.minMonths ?? 0),
          members,
          sourceInKind,
          sourceGov,
          sourceCash,
          govLaborPct: Number(s.govLaborPct ?? 0),
        };
      },
    },
  ),
);
