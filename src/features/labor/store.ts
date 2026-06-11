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
  costAdjust: number; // 자동 배분 잔액 조정(원) — 연봉 최고자에게만 부여, 입력 변경 시 0
  source: FundingSource; // 이 인력 인건비의 지출 출처
}

interface LaborState {
  targetTotal: number | null; // 목표 총 인건비(원) = 세 출처 합(파생)
  salaryBasis: SalaryBasis;
  projectMonths: number; // 사업 기간(개월) — 참여개월 자동 조정 상한
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
  mode: 'fixed',
  rate: 100,
  minRate: 0,
  maxRate: 100,
  costAdjust: 0,
  source: 'gov',
});

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

// 산출 인건비는 천원 단위 내림(floor) 처리.
const ROUND_UNIT = 1000;
const floorTo = (x: number): number => Math.floor(x / ROUND_UNIT) * ROUND_UNIT;

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
      members: [newMember()],
      sourceInKind: 0,
      sourceGov: 0,
      sourceCash: 0,
      govLaborPct: 0,

      setSalaryBasis: (b) =>
        set((s) => ({ salaryBasis: b, members: cleared(s.members) })),

      setProjectMonths: (v) =>
        set({ projectMonths: Math.max(0, Math.round(v || 0)) }),

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

      // 자동 계산하기:
      // - 투입률: 고정 인력은 그대로, 변동 인력은 '최대 상한선' 적용.
      // - 참여개월: 사업기간 M(개월)을 상한으로, 출처 예산에 아귀가 맞도록 자동 조정.
      // - 출처: 현물 → 정부출연금 → 현금 순으로, 비용 큰 사람부터 통째로 채움(best-fit).
      //   각 출처의 남는 예산은 가장 큰 미배정자의 '참여개월'을 줄여 맞춘다.
      //   예산이 소진되어 배정 못 받은 인력은 참여개월 0(산출 0).
      autoCalculate: () => {
        const { members, salaryBasis, sourceInKind, sourceGov, sourceCash } = get();
        const M = Math.max(1, Math.round(get().projectMonths || 12));

        const costAt = (salary: number, rate: number, months: number): number => {
          const unit =
            salaryBasis === 'monthly' ? salary * months : salary * (months / 12);
          return floorTo(unit * (rate / 100));
        };

        // 인력별 적용 투입률(고정=현재, 변동=최대) + 만월(M) 비용
        const info = members.map((m) => {
          const rate = m.mode === 'fixed' ? effectiveRate(m) : Number(m.maxRate) || 0;
          return {
            id: m.id,
            salary: Number(m.salary) || 0,
            rate,
            full: costAt(Number(m.salary) || 0, rate, M),
          };
        });

        const buckets: { key: FundingSource; remaining: number }[] = [
          { key: 'inKind', remaining: sourceInKind || 0 },
          { key: 'gov', remaining: sourceGov || 0 },
          { key: 'cash', remaining: sourceCash || 0 },
        ];

        const done = new Set<string>();
        const assign = new Map<string, { source: FundingSource; months: number }>();

        for (const bk of buckets) {
          // 1) 남은 예산에 통째로 들어가는 인력 중 큰 사람부터 (FFD)
          for (;;) {
            const c = info
              .filter((x) => !done.has(x.id) && x.full > 0 && x.full <= bk.remaining)
              .sort((a, b) => b.full - a.full)[0];
            if (!c) break;
            bk.remaining -= c.full;
            done.add(c.id);
            assign.set(c.id, { source: bk.key, months: M });
          }
          // 2) 남는 예산을 가장 큰 미배정자의 참여개월을 줄여 맞춤
          if (bk.remaining > 0) {
            const c = info
              .filter((x) => !done.has(x.id) && x.full > 0)
              .sort((a, b) => b.full - a.full)[0];
            if (c) {
              const perMonth = c.full / M;
              const mm = clamp(
                perMonth > 0 ? Math.floor(bk.remaining / perMonth) : 0,
                0,
                M,
              );
              if (mm >= 1) {
                const realCost = costAt(c.salary, c.rate, mm);
                if (realCost > 0 && realCost <= bk.remaining) {
                  bk.remaining -= realCost;
                  done.add(c.id);
                  assign.set(c.id, { source: bk.key, months: mm });
                }
              }
            }
          }
        }

        set((s) => ({
          members: s.members.map((m) => {
            const rate =
              m.mode === 'range' ? Number(m.maxRate) || 0 : m.rate; // 변동=최대 적용
            const a = assign.get(m.id);
            return {
              ...m,
              rate,
              months: a ? a.months : 0, // 미배정 → 0개월(산출 0)
              source: a ? a.source : m.source,
              costAdjust: 0,
            };
          }),
        }));
      },

      resetAll: () =>
        set({
          targetTotal: null,
          salaryBasis: 'annual',
          projectMonths: 12,
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
      version: 5,
      // v1: annualSalary → v2: salary+salaryBasis → v3: costAdjust → v4: 출처 예산 → v5: Member.source
      migrate: (persisted) => {
        const s = (persisted ?? {}) as {
          targetTotal?: number | null;
          members?: Array<Record<string, unknown>>;
          salaryBasis?: SalaryBasis;
          sourceInKind?: number;
          sourceGov?: number;
          sourceCash?: number;
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
            }))
          : [newMember()];
        // 구버전 단일 목표는 정부출연금 출처로 이관
        const sourceInKind = Number(s.sourceInKind ?? 0);
        const sourceGov = Number(s.sourceGov ?? s.targetTotal ?? 0);
        const sourceCash = Number(s.sourceCash ?? 0);
        return {
          targetTotal: sumTarget(sourceInKind, sourceGov, sourceCash),
          salaryBasis: s.salaryBasis ?? 'annual',
          members,
          sourceInKind,
          sourceGov,
          sourceCash,
        };
      },
    },
  ),
);
