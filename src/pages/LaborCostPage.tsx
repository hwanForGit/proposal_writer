import { useEffect, useMemo, useState } from 'react';
import {
  useLaborStore,
  memberCost,
  totalCost,
  effectiveRate,
  effectiveSalary,
  sourceSums,
  UNIT_META,
  type Member,
  type SalaryBasis,
  type SalaryMode,
  type FundingSource,
  type AmountUnit,
} from '@/features/labor/store';
import {
  useProjectCostStore,
  computeProjectCost,
} from '@/features/projectCost/store';
import { calculateGrossSalary } from '@/features/labor/grossSalary';
import {
  useBudgetStore,
  catSums,
  midSub,
  midTotal,
  type BudgetCategory,
  type BudgetMid,
} from '@/features/budget/store';
import { copyToClipboard } from '@/lib/clipboard';

// 작성 연봉(사용자 입력) / 사업계획서 연봉(4대보험·퇴직금 포함, 자동) 라벨
const salaryLabel = (basis: SalaryBasis): string =>
  basis === 'monthly' ? '작성 월단가' : '작성 연봉';
const planSalaryLabel = (basis: SalaryBasis): string =>
  basis === 'monthly' ? '사업계획서 월단가' : '사업계획서 연봉';

// 탭 전체 금액 표시 단위(원/천원/만원/백만원). 표시·입력 모두 이 단위로 환산.
const useUnit = () => UNIT_META[useLaborStore((s) => s.amountUnit)];
// 단위 환산 표시 포맷터. 각 컴포넌트 상단에서 `const fmtWon = useFmtWon();`로 사용.
const useFmtWon = () => {
  const { factor, suffix } = useUnit();
  return (n: number): string =>
    `${Math.round(n / factor).toLocaleString('ko-KR')}${suffix}`;
};

export default function LaborCostPage() {
  const targetTotal = useLaborStore((s) => s.targetTotal);
  const salaryBasis = useLaborStore((s) => s.salaryBasis);
  const projectMonths = useLaborStore((s) => s.projectMonths);
  const setProjectMonths = useLaborStore((s) => s.setProjectMonths);
  const minMonths = useLaborStore((s) => s.minMonths);
  const setMinMonths = useLaborStore((s) => s.setMinMonths);
  const members = useLaborStore((s) => s.members);
  const sourceInKind = useLaborStore((s) => s.sourceInKind);
  const sourceGov = useLaborStore((s) => s.sourceGov);
  const sourceCash = useLaborStore((s) => s.sourceCash);
  const govLaborPct = useLaborStore((s) => s.govLaborPct);
  const setSalaryBasis = useLaborStore((s) => s.setSalaryBasis);
  const setSourceInKind = useLaborStore((s) => s.setSourceInKind);
  const setSourceGov = useLaborStore((s) => s.setSourceGov);
  const setSourceCash = useLaborStore((s) => s.setSourceCash);
  const setGovLaborPct = useLaborStore((s) => s.setGovLaborPct);
  const fillSourcesFromProject = useLaborStore((s) => s.fillSourcesFromProject);
  const addMember = useLaborStore((s) => s.addMember);
  const removeMember = useLaborStore((s) => s.removeMember);
  const updateMember = useLaborStore((s) => s.updateMember);
  const autoCalculate = useLaborStore((s) => s.autoCalculate);
  const resetAll = useLaborStore((s) => s.resetAll);
  const resetProjectCost = useProjectCostStore((s) => s.reset);
  const resetBudget = useBudgetStore((s) => s.resetAll);
  const amountUnit = useLaborStore((s) => s.amountUnit);
  const setAmountUnit = useLaborStore((s) => s.setAmountUnit);
  const salaryMode = useLaborStore((s) => s.salaryMode);
  const setSalaryMode = useLaborStore((s) => s.setSalaryMode);
  const fmtWon = useFmtWon();

  // 총 사업비 섹션 값 → '가져오기' 버튼으로 출처 예산에 채움
  const pcGovGrant = useProjectCostStore((s) => s.govGrant);
  const pcSelfRatio = useProjectCostStore((s) => s.selfRatioPct);
  const pcCashRatio = useProjectCostStore((s) => s.cashRatioPct);
  const pc = useMemo(
    () => computeProjectCost(pcGovGrant, pcSelfRatio, pcCashRatio),
    [pcGovGrant, pcSelfRatio, pcCashRatio],
  );

  // 정부출연금 인건비 한도(총사업비의 N%) 사용 시 정부출연금 예산 자동 산정.
  //   정부출연금 인건비 = max(0, 총사업비×N% − 총사업비의 자부담금 전체(현물+현금))
  const govLaborAuto = govLaborPct > 0;
  useEffect(() => {
    if (!govLaborAuto) return;
    const desired = Math.max(
      0,
      Math.round((pc.total * govLaborPct) / 100) - pc.selfFund,
    );
    if (desired !== sourceGov) setSourceGov(desired);
  }, [govLaborAuto, govLaborPct, pc.total, pc.selfFund, sourceGov, setSourceGov]);

  const computed = useMemo(
    () => totalCost(members, salaryBasis, salaryMode),
    [members, salaryBasis, salaryMode],
  );
  const diff = targetTotal != null ? computed - targetTotal : 0;
  // 허용오차는 원 단위 반올림 잔차만 흡수(인력 수 ×1원). 그 이상은 정직하게 불일치로 표시.
  const tol = targetTotal != null ? Math.max(1, members.length) : 0;

  // 인력별 선택 출처에 따른 출처별 배정 합계
  const assigned = useMemo(
    () => sourceSums(members, salaryBasis, salaryMode),
    [members, salaryBasis, salaryMode],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            🧮 사업비 계산
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            정부출연금·자부담으로 총 사업비를 구성하고, 용역비(인건비)를
            산출합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('입력한 내용을 모두 지웁니다. 계속할까요?')) {
              resetAll();
              resetProjectCost();
              resetBudget();
            }
          }}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          초기화
        </button>
      </header>

      {/* 금액 표시 단위 + 입력 안내 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-xs font-semibold text-slate-700">금액 단위</span>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
          {(['won', 'thousand', 'tenK', 'million'] as AmountUnit[]).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setAmountUnit(u)}
              className={`rounded-md px-3 py-1 transition ${
                amountUnit === u
                  ? 'bg-white font-semibold text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {UNIT_META[u].label}
            </button>
          ))}
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">
          <span aria-hidden>⏎</span> 숫자·금액은 입력 후 <b className="font-semibold">
            Enter
          </b>{' '}
          (또는 칸 밖 클릭) 시 적용
        </span>
      </div>

      {/* 총 사업비 */}
      <ProjectCostSection />

      {/* 용역비(인건비) 계산 */}
      <div className="flex items-start gap-2.5 pt-2">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm">
          🧾
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            용역비(인건비) 계산
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {salaryBasis === 'monthly'
              ? '인건비 = (작성 또는 사업계획서) 월단가 × 투입률 × 참여개월.'
              : '인건비 = (작성 또는 사업계획서) 연봉 × 투입률 × (참여개월 ÷ 12).'}{' '}
            <b>사업계획서 연봉</b> = 작성 연봉 + 4대보험(9.5%) + 퇴직급여충당금(8.33%),
            자동 산출. 아래 <b>인건비 기준</b>에서 어느 연봉을 쓸지 선택. 산출은 천원 내림.
          </p>
        </div>
      </div>

      {/* 지출 출처 예산 + 단가 기준 */}
      <section className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-slate-800">지출 출처 예산</span>
            <button
              type="button"
              onClick={() =>
                fillSourcesFromProject(
                  pc.inKind,
                  govLaborAuto
                    ? Math.max(
                        0,
                        Math.round((pc.total * govLaborPct) / 100) - pc.selfFund,
                      )
                    : (pcGovGrant ?? 0),
                  0, // 자부담 현금은 기본 0원 — 필요하면 옆 버튼으로 따로 가져오기
                )
              }
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
              title="위 '총 사업비'의 자부담 현물·정부출연금을 가져옵니다(자부담 현금은 0원)."
            >
              💰 총 사업비에서 가져오기
            </button>
            <button
              type="button"
              onClick={() => setSourceCash(pc.cash)}
              className="rounded-lg border border-teal-300 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700 transition hover:bg-teal-100"
              title="위 '총 사업비'의 자부담 현금 값만 가져옵니다."
            >
              💵 자부담 현금 가져오기
            </button>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <span className="text-slate-600">사업 기간</span>
              <NumInput
                min={1}
                max={120}
                value={projectMonths}
                onCommit={setProjectMonths}
                placeholder="12"
                className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-indigo-500 focus:outline-none"
              />
              <span className="text-slate-500">개월</span>
            </label>
            <label
              className="flex items-center gap-1.5"
              title="자동 계산 시 전 인력 공통 참여개월 하한. 0이면 하한 없음."
            >
              <span className="text-slate-600">최소 개월</span>
              <NumInput
                min={0}
                max={projectMonths || 120}
                value={minMonths}
                onCommit={setMinMonths}
                placeholder="0"
                className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-indigo-500 focus:outline-none"
              />
              <span className="text-slate-500">개월</span>
            </label>
            <span className="text-slate-500">단가 기준</span>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setSalaryBasis('annual')}
                className={`rounded-md px-3 py-1 transition ${salaryBasis === 'annual' ? 'bg-white font-semibold text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                연봉
              </button>
              <button
                type="button"
                onClick={() => setSalaryBasis('monthly')}
                className={`rounded-md px-3 py-1 transition ${salaryBasis === 'monthly' ? 'bg-white font-semibold text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                월 단가
              </button>
            </div>
            <span
              className="text-slate-500"
              title="인건비 산출에 어느 연봉을 쓸지 선택. 사업계획서 연봉 = 4대보험·퇴직금 포함."
            >
              인건비 기준
            </span>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setSalaryMode('written')}
                className={`rounded-md px-3 py-1 transition ${salaryMode === 'written' ? 'bg-white font-semibold text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                작성 연봉
              </button>
              <button
                type="button"
                onClick={() => setSalaryMode('plan')}
                className={`rounded-md px-3 py-1 transition ${salaryMode === 'plan' ? 'bg-white font-semibold text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                사업계획서 연봉
              </button>
            </div>
          </div>
        </div>

        {/* 정부출연금 인건비 한도 (총사업비의 N%) */}
        <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>정부출연금 인건비 한도</span>
          <span>= 총사업비의</span>
          <NumInput
            min={0}
            max={100}
            value={govLaborPct}
            onCommit={setGovLaborPct}
            placeholder="0"
            className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-indigo-500 focus:outline-none"
          />
          <span>%</span>
          {govLaborAuto ? (
            <span className="text-[11px] text-emerald-700">
              → 정부출연금 인건비 = 총사업비×{govLaborPct}% − 자부담 전체 (자동)
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">
              (0 = 미사용, 정부출연금 인건비 직접 입력)
            </span>
          )}
        </label>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SourceBudgetInput
            label="① 자부담 현물"
            value={sourceInKind}
            onChange={setSourceInKind}
            assigned={assigned.inKind}
          />
          <SourceBudgetInput
            label="② 정부출연금 인건비"
            value={sourceGov}
            onChange={setSourceGov}
            assigned={assigned.gov}
            readOnly={govLaborAuto}
          />
          <SourceBudgetInput
            label="③ 자부담 현금"
            value={sourceCash}
            onChange={setSourceCash}
            assigned={assigned.cash}
          />
        </div>

        <div className="mt-2 text-right text-xs text-slate-500">
          목표 총 인건비(세 출처 합):{' '}
          <span className="whitespace-nowrap font-semibold text-slate-800">
            {fmtWon(targetTotal ?? 0)}
          </span>
        </div>
      </section>

      {/* 투입 인력 표 */}
      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2.5 text-left">성명 / 역할</th>
              <th className="px-3 py-2.5 text-right">{salaryLabel(salaryBasis)}</th>
              <th className="px-3 py-2.5 text-right">
                {planSalaryLabel(salaryBasis)}
                <span className="block font-normal normal-case text-slate-400">
                  4대보험·퇴직금 포함
                </span>
              </th>
              <th className="px-3 py-2.5 text-right">참여개월</th>
              <th className="px-3 py-2.5 text-left">투입률</th>
              <th className="px-3 py-2.5 text-right">산출 인건비</th>
              <th className="px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <MemberRow
                key={m.id}
                m={m}
                basis={salaryBasis}
                onChange={(patch) => updateMember(m.id, patch)}
                onRemove={() => removeMember(m.id)}
                removable={members.length > 1}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
              <td className="px-3 py-2.5 text-slate-700" colSpan={5}>
                합계 ({members.length}명)
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-base font-bold text-indigo-700">
                {fmtWon(computed)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <div className="border-t border-slate-100 px-3 py-2">
          <button
            type="button"
            onClick={addMember}
            className="rounded-lg border border-dashed border-indigo-300 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
          >
            + 인력 추가
          </button>
        </div>
      </section>

      {/* 목표 대비 검증 + 자동 투입률 */}
      <section className="space-y-3">
        <ComparisonNotice
          target={targetTotal}
          computed={computed}
          diff={diff}
          tol={tol}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={autoCalculate}
            disabled={targetTotal == null}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            title="고정(🔒) 체크한 값은 안 바꾸고, 고정 안 한 값만(투입률→참여개월→연봉 순) 줄여 목표(출처 예산 합)에 맞춥니다. 모자라면 임의 인력을 자동 추가하고 재계산 때 다시 생성(🔒 고정한 건 유지)."
          >
            ⚙️ 자동 계산하기
          </button>
          <span className="text-[11px] text-slate-500">
            <b>고정(🔒) 체크한 값은 그대로</b> 두고, 고정 안 한 값만 줄여 목표(출처 예산
            합)에 맞춥니다. 한 인력에서 조정 우선순위는 <b>투입률 → 참여개월 → 연봉</b>.
            인력으로 다 못 채우면 <b>임의 인력(“자동”)을 추가</b>하고, 재계산 때 다시
            생성합니다(유지하려면 <b>🔒 전체 고정</b>).
          </span>
        </div>
      </section>

      <CopyBar members={members} computed={computed} basis={salaryBasis} />

      {/* 사업비 총괄표 */}
      <BudgetTable />
    </div>
  );
}

// ─── 금액 입력 (천 단위 콤마 자동, Enter/blur 시 적용) ───────────────
// type=number는 콤마를 못 넣으므로 text로 받아 숫자만 저장하고 콤마로 표시.
// 실시간 반영이 아니라 Enter(또는 칸 밖 클릭) 시 적용 — 입력 중엔 노란 테두리로 표시.
function MoneyInput({
  value,
  onChange,
  className,
  placeholder,
  readOnly,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const { factor } = useUnit();
  // 저장은 원 단위. 표시·입력은 선택 단위(원/천원/만원/백만원)로 환산(정수).
  const committed = value ? Math.round(value / factor).toLocaleString('ko-KR') : '';
  const [draft, setDraft] = useState<string | null>(null); // null = 미편집(committed 표시)
  const display = draft != null ? draft : committed;
  const dirty = draft != null && draft !== committed;

  const commit = () => {
    if (draft == null) return;
    const digits = draft.replace(/[^\d]/g, '');
    const next = digits === '' ? 0 : Number(digits) * factor;
    if (next !== value) onChange(next); // 값이 실제 바뀐 경우에만 반영
    setDraft(null);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      readOnly={readOnly}
      value={display}
      onFocus={() => !readOnly && setDraft(committed)}
      onChange={(e) => {
        if (readOnly) return;
        const digits = e.target.value.replace(/[^\d]/g, '');
        setDraft(digits === '' ? '' : Number(digits).toLocaleString('ko-KR'));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
      onBlur={commit}
      placeholder={placeholder}
      title={dirty ? 'Enter 또는 칸 밖 클릭 시 적용' : undefined}
      className={`${className ?? ''} ${dirty ? 'ring-2 ring-amber-400' : ''}`}
    />
  );
}

// 숫자 입력 (Enter/blur 시 적용, 입력 중 노란 테두리). 음수/소수 방지는 parse에서.
function NumInput({
  value,
  onCommit,
  parse,
  className,
  placeholder,
  min,
  max,
  title,
}: {
  value: number;
  onCommit: (n: number) => void;
  parse?: (n: number) => number; // 커밋 전 변환(반올림·클램프 등). 기본 = 그대로
  className?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  title?: string;
}) {
  const committed = value || value === 0 ? (value ? String(value) : '') : '';
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft != null ? draft : committed;
  const dirty = draft != null && draft !== committed;

  const commit = () => {
    if (draft == null) return;
    const raw = draft === '' ? 0 : Number(draft) || 0;
    const next = parse ? parse(raw) : raw;
    if (next !== value) onCommit(next);
    setDraft(null);
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      value={display}
      onFocus={() => setDraft(committed)}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
      onBlur={commit}
      placeholder={placeholder}
      title={dirty ? 'Enter 또는 칸 밖 클릭 시 적용' : title}
      className={`${className ?? ''} ${dirty ? 'ring-2 ring-amber-400' : ''}`}
    />
  );
}

// ─── 지출 출처 ───────────────────────────────────────────────────────

const SOURCE_META: Record<FundingSource, { label: string; cls: string }> = {
  inKind: { label: '자부담 현물', cls: 'bg-amber-100 text-amber-800' },
  gov: { label: '정부출연금 인건비', cls: 'bg-indigo-100 text-blue-800' },
  cash: { label: '자부담 현금', cls: 'bg-teal-100 text-teal-800' },
};

// 출처별 예산(편집) + 인력에서 배정된 합계 + 잔여/초과 요약
function SourceBudgetInput({
  label,
  value,
  onChange,
  assigned,
  readOnly,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  assigned: number;
  readOnly?: boolean;
}) {
  const fmtWon = useFmtWon();
  const remain = value - assigned;
  const over = remain < 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <span className="text-[10px] text-slate-400">
          {readOnly ? '예산(자동)' : '예산'}
        </span>
      </div>
      <MoneyInput
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        placeholder="0"
        className={`mt-1 w-full rounded border px-2 py-1 text-right text-sm focus:outline-none ${
          readOnly
            ? 'border-slate-200 bg-slate-100 text-slate-500'
            : 'border-slate-300 focus:border-indigo-500'
        }`}
      />
      <div className="mt-1 flex justify-between gap-1 text-[10px]">
        <span className="whitespace-nowrap text-slate-600">배정 {fmtWon(assigned)}</span>
        <span
          className={`whitespace-nowrap ${over ? 'font-semibold text-red-600' : 'text-slate-500'}`}
        >
          {over ? `초과 ${fmtWon(-remain)}` : `잔여 ${fmtWon(remain)}`}
        </span>
      </div>
    </div>
  );
}

// ─── 총 사업비 (정부출연금 + 자부담금) ──────────────────────────────

function ProjectCostSection() {
  const govGrant = useProjectCostStore((s) => s.govGrant);
  const selfRatioPct = useProjectCostStore((s) => s.selfRatioPct);
  const cashRatioPct = useProjectCostStore((s) => s.cashRatioPct);
  const setGovGrant = useProjectCostStore((s) => s.setGovGrant);
  const setSelfRatioPct = useProjectCostStore((s) => s.setSelfRatioPct);
  const setCashRatioPct = useProjectCostStore((s) => s.setCashRatioPct);

  const { suffix } = useUnit();
  const { total, selfFund, cash, inKind } = computeProjectCost(
    govGrant,
    selfRatioPct,
    cashRatioPct,
  );

  const numCls =
    'w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-indigo-500 focus:outline-none';

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-sm">
          💰
        </span>
        <h2 className="text-base font-semibold text-slate-900">총 사업비</h2>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-slate-700">정부출연금</span>
          <MoneyInput
            value={govGrant ?? 0}
            onChange={(n) => setGovGrant(n > 0 ? n : null)}
            placeholder="예: 70,000,000"
            className="w-44 rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-indigo-500 focus:outline-none"
          />
          <span className="text-slate-500">{suffix}</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-slate-700">자부담 비율</span>
          <NumInput
            min={0}
            max={99.9}
            value={selfRatioPct}
            onCommit={setSelfRatioPct}
            placeholder="예: 30"
            className={numCls}
          />
          <span className="text-slate-500">% (총사업비 대비)</span>
        </label>
      </div>

      {/* 자부담금 / 총 사업비 요약 */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <SummaryBox label="정부출연금" value={govGrant ?? 0} />
        <SummaryBox label="자부담금" value={selfFund} />
        <SummaryBox label="총 사업비" value={total} highlight />
      </div>

      {/* 자부담금 내 현금/현물 */}
      <div className="mt-3 border-t border-emerald-200 pt-3">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-700">자부담금 중 현금 비율</span>
          <NumInput
            min={0}
            max={100}
            value={cashRatioPct}
            onCommit={setCashRatioPct}
            placeholder="예: 40"
            className={numCls}
          />
          <span className="text-slate-500">%</span>
          <span className="ml-1 text-xs text-slate-400">
            (나머지는 현물로 자동 계산)
          </span>
        </label>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <SummaryBox label="자부담 현금" value={cash} />
          <SummaryBox label="자부담 현물" value={inKind} />
        </div>
      </div>
    </section>
  );
}

function SummaryBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  const fmtWon = useFmtWon();
  return (
    <div
      className={`rounded border px-3 py-2 ${
        highlight
          ? 'border-emerald-300 bg-white'
          : 'border-slate-200 bg-white/70'
      }`}
    >
      <div className="text-[11px] text-slate-500">{label}</div>
      <div
        className={`whitespace-nowrap tabular-nums ${highlight ? 'text-base font-bold text-emerald-700' : 'text-sm font-semibold text-slate-800'}`}
      >
        {fmtWon(value)}
      </div>
    </div>
  );
}

// ─── 고정 체크박스 ───────────────────────────────────────────────────

function LockCheck({
  checked,
  onChange,
  disabled,
  label,
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  title?: string;
}) {
  return (
    <label
      title={title}
      className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
        disabled ? 'cursor-not-allowed text-gray-300' : 'cursor-pointer text-slate-500'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3 accent-blue-600"
      />
      {label ?? '고정'}
    </label>
  );
}

// ─── 인력 행 ─────────────────────────────────────────────────────────

function MemberRow({
  m,
  basis,
  onChange,
  onRemove,
  removable,
}: {
  m: Member;
  basis: SalaryBasis;
  onChange: (patch: Partial<Member>) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const fmtWon = useFmtWon();
  const { factor, suffix } = useUnit();
  const salaryMode = useLaborStore((s) => s.salaryMode);
  const gross = calculateGrossSalary(Number(m.salary) || 0).grossSalary;
  const numCls =
    'w-full rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-indigo-500 focus:outline-none';
  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          {m.auto && (
            <span
              className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700"
              title="잔여 예산을 채우려 자동 생성된 인력. 재계산 때 다시 생성됩니다. 유지하려면 🔒 전체 고정."
            >
              자동
            </span>
          )}
          <input
            type="text"
            value={m.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="예: 홍길동 / 책임연구원"
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <LockCheck
          checked={m.locked}
          onChange={(v) => onChange({ locked: v })}
          label="🔒 전체 고정"
          title="이 인력의 연봉·개월·투입률을 모두 고정(자동계산이 안 건드리고, 자동 인력이면 재계산 때도 안 빠짐)"
        />
      </td>
      <td className="px-3 py-2">
        <MoneyInput
          value={m.salary}
          onChange={(n) => onChange({ salary: n })}
          placeholder={basis === 'monthly' ? '예: 5,000,000' : '예: 60,000,000'}
          className={`${numCls} ${salaryMode === 'written' ? 'ring-1 ring-indigo-300' : ''}`}
        />
        <LockCheck
          checked={m.salaryLocked || m.locked}
          disabled={m.locked}
          onChange={(v) => onChange({ salaryLocked: v })}
          title="작성 연봉 고정(자동계산이 안 바꿈)"
        />
      </td>
      <td className="px-3 py-2">
        <div
          className={`whitespace-nowrap rounded px-2 py-1 text-right text-sm tabular-nums ${
            salaryMode === 'plan'
              ? 'bg-indigo-50 font-semibold text-indigo-700 ring-1 ring-indigo-300'
              : 'text-slate-500'
          }`}
          title="작성 연봉 + 사업주부담 4대보험(9.5%) + 퇴직급여충당금(8.33%)"
        >
          {fmtWon(gross)}
        </div>
        <div className="mt-1 text-right text-[10px] text-slate-400">자동</div>
      </td>
      <td className="px-3 py-2">
        <NumInput
          min={0}
          max={120}
          value={m.months}
          parse={(n) => Math.max(0, Math.round(n))}
          onCommit={(n) => onChange({ months: n })}
          className={`${numCls} w-20`}
        />
        <LockCheck
          checked={m.monthsLocked || m.locked}
          disabled={m.locked}
          onChange={(v) => onChange({ monthsLocked: v })}
          title="참여개월 고정(자동계산이 안 바꿈)"
        />
      </td>
      <td className="px-3 py-2">
        <div className="space-y-1.5">
          <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => onChange({ mode: 'fixed' })}
              className={`rounded px-2 py-0.5 transition ${m.mode === 'fixed' ? 'bg-white font-semibold text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              고정
            </button>
            <button
              type="button"
              onClick={() => onChange({ mode: 'range' })}
              className={`rounded px-2 py-0.5 transition ${m.mode === 'range' ? 'bg-white font-semibold text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              범위
            </button>
          </div>
          {m.mode === 'fixed' ? (
            <div className="flex items-center gap-1">
              <NumInput
                min={0}
                max={100}
                value={m.rate}
                parse={(n) => Math.min(100, Math.max(0, Math.round(n)))}
                onCommit={(n) => onChange({ rate: n })}
                className={`${numCls} w-16`}
              />
              <span className="text-xs text-slate-500">%</span>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span className="text-[10px] text-slate-400">최대</span>
                <NumInput
                  min={0}
                  max={100}
                  value={m.maxRate}
                  parse={(n) => Math.min(100, Math.max(0, Math.round(n)))}
                  onCommit={(n) => onChange({ maxRate: n })}
                  className={`${numCls} w-14`}
                  title="최대 투입률(상한선, 정수 %)"
                />
                <span>%</span>
              </div>
              <div className="text-[10px] text-slate-500">
                적용{' '}
                <span className="font-semibold text-indigo-600">
                  {effectiveRate(m)}%
                </span>{' '}
                <span className="text-slate-400">(자동 계산)</span>
              </div>
            </div>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-900">
        {fmtWon(memberCost(m, basis, salaryMode))}
        {m.costAdjust !== 0 && (
          <div className="text-[10px] font-normal text-indigo-600">
            (잔액 조정 {m.costAdjust > 0 ? '+' : ''}
            {Math.round(m.costAdjust / factor).toLocaleString('ko-KR')}
            {suffix})
          </div>
        )}
        <div className="mt-1 flex justify-end">
          <select
            value={m.source}
            onChange={(e) =>
              onChange({ source: e.target.value as FundingSource })
            }
            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_META[m.source].cls}`}
            title="이 인력 인건비의 지출 출처"
          >
            <option value="inKind">자부담 현물</option>
            <option value="gov">정부출연금 인건비</option>
            <option value="cash">자부담 현금</option>
          </select>
        </div>
      </td>
      <td className="px-2 py-2 text-center">
        <button
          type="button"
          onClick={onRemove}
          disabled={!removable}
          className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
          title="인력 삭제"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

// ─── 목표 대비 검증 메시지 ──────────────────────────────────────────

function ComparisonNotice({
  target,
  computed,
  diff,
  tol,
}: {
  target: number | null;
  computed: number;
  diff: number;
  tol: number;
}) {
  const fmtWon = useFmtWon();
  if (target == null) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        목표 총 인건비를 입력하면 산출 합계와 비교해 드립니다.
      </div>
    );
  }
  if (diff < -tol) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        ⬇️ 산출 합계({fmtWon(computed)})가 목표보다{' '}
        <b>{fmtWon(Math.abs(diff))} 낮습니다</b> — 투입률/참여개월을{' '}
        <b>더 높게</b> 입력하세요.
      </div>
    );
  }
  if (diff > tol) {
    return (
      <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
        ⬆️ 산출 합계({fmtWon(computed)})가 목표보다{' '}
        <b>{fmtWon(Math.abs(diff))} 높습니다</b> — 투입률/참여개월을{' '}
        <b>더 낮게</b> 입력하세요.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
      ✓ 목표 총 인건비와 일치합니다 ({fmtWon(computed)}).
    </div>
  );
}

// ─── 결과 복사 ───────────────────────────────────────────────────────

function buildRows(members: Member[], basis: SalaryBasis, mode: SalaryMode) {
  return members.map((m) => ({
    name: m.name || '-',
    salary: Math.round(effectiveSalary(m, mode)).toLocaleString('ko-KR'),
    months: String(m.months),
    rate: `${effectiveRate(m)}%`,
    cost: Math.round(memberCost(m, basis, mode)).toLocaleString('ko-KR'),
  }));
}

function CopyBar({
  members,
  computed,
  basis,
}: {
  members: Member[];
  computed: number;
  basis: SalaryBasis;
}) {
  const [msg, setMsg] = useState('');
  const salaryMode = useLaborStore((s) => s.salaryMode);
  const rows = buildRows(members, basis, salaryMode);
  const salCol =
    salaryMode === 'plan' ? planSalaryLabel(basis) : salaryLabel(basis);

  const asMarkdown = () => {
    const head = `| 성명/역할 | ${salCol} | 참여개월 | 투입률 | 산출 인건비 |\n|---|---|---|---|---|`;
    const body = rows
      .map(
        (r) => `| ${r.name} | ${r.salary} | ${r.months} | ${r.rate} | ${r.cost} |`,
      )
      .join('\n');
    const total = `| **합계** |  |  |  | **${Math.round(computed).toLocaleString('ko-KR')}** |`;
    return [head, body, total].join('\n');
  };

  const asTsv = () => {
    const head = ['성명/역할', salCol, '참여개월', '투입률', '산출 인건비'].join(
      '\t',
    );
    const body = rows
      .map((r) => [r.name, r.salary, r.months, r.rate, r.cost].join('\t'))
      .join('\n');
    const total = ['합계', '', '', '', Math.round(computed).toLocaleString('ko-KR')].join(
      '\t',
    );
    return [head, body, total].join('\n');
  };

  const copy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    setMsg(ok ? `${label} 복사됨 ✓` : '복사 실패 — 직접 선택해 복사하세요');
    window.setTimeout(() => setMsg(''), 2500);
  };

  return (
    <section className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
      <span className="text-xs font-medium text-slate-600">결과 복사:</span>
      <button
        type="button"
        onClick={() => copy(asMarkdown(), 'Markdown 표')}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
      >
        📋 Markdown 표
      </button>
      <button
        type="button"
        onClick={() => copy(asTsv(), '엑셀(탭 구분)')}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
      >
        📋 엑셀 붙여넣기용
      </button>
      {msg && <span className="text-xs text-green-600">{msg}</span>}
    </section>
  );
}

// ─── 사업비 총괄표 ────────────────────────────────────────────────────

const fmtPct = (v: number): string => `${v.toFixed(1)}%`;

function BudgetTable() {
  const members = useLaborStore((s) => s.members);
  const basis = useLaborStore((s) => s.salaryBasis);
  const pcGov = useProjectCostStore((s) => s.govGrant);
  const pcSelf = useProjectCostStore((s) => s.selfRatioPct);
  const pcCash = useProjectCostStore((s) => s.cashRatioPct);

  const categories = useBudgetStore((s) => s.categories);
  const addCategory = useBudgetStore((s) => s.addCategory);
  const removeCategory = useBudgetStore((s) => s.removeCategory);
  const renameCategory = useBudgetStore((s) => s.renameCategory);
  const addMid = useBudgetStore((s) => s.addMid);
  const removeMid = useBudgetStore((s) => s.removeMid);
  const updateMid = useBudgetStore((s) => s.updateMid);
  const salaryMode = useLaborStore((s) => s.salaryMode);
  const { factor, label: unitLabel } = useUnit();
  const u = (n: number): number => Math.round(n / factor); // 단위 환산(내보내기용)

  // 인건비(대분류 1) = 용역비 계산의 출처 합계에서 자동 산입
  const labor = useMemo(
    () => sourceSums(members, basis, salaryMode),
    [members, basis, salaryMode],
  );
  const pc = useMemo(
    () => computeProjectCost(pcGov, pcSelf, pcCash),
    [pcGov, pcSelf, pcCash],
  );

  // 출처별 예산
  const budget = {
    gov: pcGov ?? 0,
    cash: pc.cash,
    inKind: pc.inKind,
    total: pc.total,
  };

  // 사용액(인건비 + 모든 대분류 중분류)
  const used = useMemo(() => {
    let gov = labor.gov;
    let cash = labor.cash;
    let inKind = labor.inKind;
    for (const c of categories)
      for (const m of c.mids) {
        gov += m.gov || 0;
        cash += m.cash || 0;
        inKind += m.inKind || 0;
      }
    return { gov, cash, inKind, total: gov + cash + inKind };
  }, [labor, categories]);

  // 구성비 분모 = 총 사업비(입력 시) 우선, 없으면 총괄표 합계(항상 자동 계산되도록).
  const denom = budget.total > 0 ? budget.total : used.total;
  const pct = (v: number): number => (denom > 0 ? (v / denom) * 100 : 0);
  const laborTotal = labor.gov + labor.cash + labor.inKind;

  const [msg, setMsg] = useState('');

  // 내보내기용 행: [비목, 정부출연금, 민간현금, 민간현물, 민간소계, 합계, 구성비]
  //   금액은 화면과 같은 단위(unitLabel)로 환산해서 내보냄.
  const exportRows = (): (string | number)[][] => {
    const r: (string | number)[][] = [];
    r.push(['비목', '정부출연금', '민간 현금', '민간 현물', '민간 소계', '합계', '구성비']);
    r.push([
      '1. 인건비(자동)',
      u(labor.gov),
      u(labor.cash),
      u(labor.inKind),
      u(labor.cash + labor.inKind),
      u(laborTotal),
      fmtPct(pct(laborTotal)),
    ]);
    categories.forEach((c, i) => {
      const s = catSums(c);
      const ct = s.gov + s.cash + s.inKind;
      r.push([
        `${i + 2}. ${c.name || ''}`,
        u(s.gov),
        u(s.cash),
        u(s.inKind),
        u(s.cash + s.inKind),
        u(ct),
        fmtPct(pct(ct)),
      ]);
      c.mids.forEach((m) => {
        r.push([
          `  └ ${m.name || ''}`,
          u(m.gov || 0),
          u(m.cash || 0),
          u(m.inKind || 0),
          u(midSub(m)),
          u(midTotal(m)),
          fmtPct(pct(midTotal(m))),
        ]);
      });
    });
    r.push([
      '합계',
      u(used.gov),
      u(used.cash),
      u(used.inKind),
      u(used.cash + used.inKind),
      u(used.total),
      fmtPct(pct(used.total)),
    ]);
    return r;
  };

  const downloadCsv = () => {
    const esc = (v: string | number): string => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [`(단위: ${unitLabel})`, ...exportRows().map((row) => row.map(esc).join(','))].join(
      '\r\n',
    );
    // 선두 BOM(\uFEFF) — Excel에서 한글 깨짐 방지
    const blob = new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '사업비_총괄표.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg('CSV 다운로드됨 ✓');
    window.setTimeout(() => setMsg(''), 2500);
  };

  const copyTable = async (kind: 'md' | 'tsv') => {
    const rows = exportRows();
    const fmtCell = (v: string | number, i: number): string =>
      i === 0 || typeof v === 'string' ? String(v) : Number(v).toLocaleString('ko-KR');
    let text: string;
    if (kind === 'md') {
      const head = rows[0];
      const body = rows.slice(1);
      const sep = head.map(() => '---').join(' | ');
      text = [
        `(단위: ${unitLabel})`,
        '',
        `| ${head.join(' | ')} |`,
        `| ${sep} |`,
        ...body.map(
          (row) => `| ${row.map((v, i) => fmtCell(v, i)).join(' | ')} |`,
        ),
      ].join('\n');
    } else {
      text = [
        `(단위: ${unitLabel})`,
        ...rows.map((row) => row.map((v, i) => fmtCell(v, i)).join('\t')),
      ].join('\n');
    }
    const ok = await copyToClipboard(text);
    setMsg(ok ? `${kind === 'md' ? 'Markdown' : '엑셀'} 복사됨 ✓` : '복사 실패');
    window.setTimeout(() => setMsg(''), 2500);
  };

  return (
    <section className="space-y-4 border-t border-slate-200 pt-6">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm">
          📊
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">사업비 총괄표</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            총 사업비를 비목(대분류)·중분류로 배분합니다. <b>인건비</b>는 위 용역비
            계산에서 자동 산입(읽기 전용)되고, 나머지 비목은 직접 추가·수정·삭제할 수
            있습니다.
          </p>
        </div>
      </div>

      {/* 상단: 출처별 예산/사용/잔여 */}
      <BudgetSummary budget={budget} used={used} />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2.5 text-left">비목</th>
              <th className="px-2 py-2.5 text-right">정부출연금</th>
              <th className="px-2 py-2.5 text-right">민간 현금</th>
              <th className="px-2 py-2.5 text-right">민간 현물</th>
              <th className="px-2 py-2.5 text-right">민간 소계</th>
              <th className="px-2 py-2.5 text-right">합계</th>
              <th className="px-2 py-2.5 text-right">구성비</th>
              <th className="px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {/* 1. 인건비 (자동) */}
            <tr className="border-b border-slate-100 bg-indigo-50/40">
              <td className="px-3 py-2 font-medium text-slate-800">
                1. 인건비{' '}
                <span className="text-[10px] font-normal text-indigo-600">
                  (자동 산입)
                </span>
              </td>
              <NumCell v={labor.gov} />
              <NumCell v={labor.cash} />
              <NumCell v={labor.inKind} />
              <NumCell v={labor.cash + labor.inKind} />
              <NumCell v={laborTotal} bold />
              <td className="px-2 py-2 text-right text-slate-600 tabular-nums">
                {fmtPct(pct(laborTotal))}
              </td>
              <td className="px-2 py-2 text-center text-[10px] text-slate-400">
                조회
              </td>
            </tr>

            {/* 2~ 대분류 */}
            {categories.map((cat, i) => (
              <CategoryBlock
                key={cat.id}
                index={i + 2}
                cat={cat}
                budgetTotal={denom}
                onRename={(name) => renameCategory(cat.id, name)}
                onRemove={() => removeCategory(cat.id)}
                onAddMid={() => addMid(cat.id)}
                onRemoveMid={(midId) => removeMid(cat.id, midId)}
                onUpdateMid={(midId, patch) => updateMid(cat.id, midId, patch)}
              />
            ))}
          </tbody>
          <tfoot>
            {/* 합계부 컬럼명 반복(표가 길어도 보기 편하게) */}
            <tr className="border-t-2 border-slate-300 bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-1.5 text-left">구분</th>
              <th className="px-2 py-1.5 text-right">정부출연금</th>
              <th className="px-2 py-1.5 text-right">민간 현금</th>
              <th className="px-2 py-1.5 text-right">민간 현물</th>
              <th className="px-2 py-1.5 text-right">민간 소계</th>
              <th className="px-2 py-1.5 text-right">합계</th>
              <th className="px-2 py-1.5 text-right">구성비</th>
              <th className="px-2 py-1.5"></th>
            </tr>
            {/* 사용 합계 */}
            <tr className="bg-slate-50 font-semibold">
              <td className="px-3 py-2 text-slate-800">합계 (사용)</td>
              <NumCell v={used.gov} bold />
              <NumCell v={used.cash} bold />
              <NumCell v={used.inKind} bold />
              <NumCell v={used.cash + used.inKind} bold />
              <NumCell v={used.total} bold />
              <td className="px-2 py-2 text-right text-slate-800 tabular-nums">
                {fmtPct(pct(used.total))}
              </td>
              <td></td>
            </tr>
            {/* 총 사업비(예산) */}
            <tr className="bg-slate-50 text-slate-600">
              <td className="px-3 py-1.5">총 사업비 (예산)</td>
              <NumCell v={budget.gov} />
              <NumCell v={budget.cash} />
              <NumCell v={budget.inKind} />
              <NumCell v={budget.cash + budget.inKind} />
              <NumCell v={budget.total} />
              <td className="px-2 py-1.5 text-right text-slate-400 tabular-nums">
                {budget.total > 0 ? fmtPct(100) : '—'}
              </td>
              <td></td>
            </tr>
            {/* 잔여 = 예산 − 사용 (앞으로 더 쓸 수 있는 금액) */}
            <tr className="border-t border-emerald-200 bg-emerald-50/60 font-semibold">
              <td className="px-3 py-2 text-slate-800">잔여 (더 쓸 수 있음)</td>
              <RemainCell b={budget.gov} u={used.gov} />
              <RemainCell b={budget.cash} u={used.cash} />
              <RemainCell b={budget.inKind} u={used.inKind} />
              <RemainCell b={budget.cash + budget.inKind} u={used.cash + used.inKind} />
              <RemainCell b={budget.total} u={used.total} />
              <td className="px-2 py-2"></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <div className="border-t border-slate-100 px-3 py-2">
          <button
            type="button"
            onClick={addCategory}
            className="rounded-lg border border-dashed border-indigo-300 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
          >
            + 대분류 추가
          </button>
        </div>
      </div>

      {/* 총괄표 내보내기 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600">총괄표 내보내기:</span>
        <button
          type="button"
          onClick={downloadCsv}
          className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          📥 CSV 다운로드
        </button>
        <button
          type="button"
          onClick={() => copyTable('tsv')}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          📋 엑셀 붙여넣기용
        </button>
        <button
          type="button"
          onClick={() => copyTable('md')}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          📋 Markdown 표
        </button>
        {msg && <span className="text-xs text-green-600">{msg}</span>}
      </div>
    </section>
  );
}

function NumCell({ v, bold }: { v: number; bold?: boolean }) {
  const fmtWon = useFmtWon();
  return (
    <td
      className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${
        bold ? 'font-semibold text-slate-900' : 'text-slate-700'
      }`}
    >
      {fmtWon(v)}
    </td>
  );
}

// 잔여(예산−사용) 셀 — 양수는 녹색, 초과(음수)는 빨강으로 직관 표시
function RemainCell({ b, u }: { b: number; u: number }) {
  const fmtWon = useFmtWon();
  const r = b - u;
  const over = r < 0;
  return (
    <td
      className={`whitespace-nowrap px-2 py-2 text-right tabular-nums font-semibold ${
        over ? 'text-red-600' : 'text-emerald-700'
      }`}
    >
      {over ? `초과 ${fmtWon(-r)}` : fmtWon(r)}
    </td>
  );
}

// 출처별 예산 / 사용 / 잔여 요약
function BudgetSummary({
  budget,
  used,
}: {
  budget: { gov: number; cash: number; inKind: number; total: number };
  used: { gov: number; cash: number; inKind: number; total: number };
}) {
  const fmtWon = useFmtWon();
  const rows: { label: string; b: number; u: number }[] = [
    { label: '정부출연금', b: budget.gov, u: used.gov },
    { label: '민간 현금', b: budget.cash, u: used.cash },
    { label: '민간 현물', b: budget.inKind, u: used.inKind },
    { label: '총 사업비', b: budget.total, u: used.total },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-800">
        💵 출처별 예산 현황
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left">출처</th>
              <th className="px-3 py-2 text-right">예산</th>
              <th className="px-3 py-2 text-right">구성비</th>
              <th className="px-3 py-2 text-right">사용</th>
              <th className="px-3 py-2 text-right">잔여</th>
            </tr>
          </thead>
        <tbody>
          {rows.map((r, i) => {
            const remain = r.b - r.u;
            const over = remain < 0;
            const isTotal = i === rows.length - 1;
            const share = budget.total > 0 ? (r.b / budget.total) * 100 : 0;
            return (
              <tr
                key={r.label}
                className={isTotal ? 'border-t border-emerald-200 font-semibold' : ''}
              >
                <td className="whitespace-nowrap px-3 py-1.5 text-slate-700">{r.label}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-700">
                  {fmtWon(r.b)}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-500">
                  {fmtPct(share)}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-700">
                  {fmtWon(r.u)}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${
                    over ? 'font-semibold text-red-600' : 'text-emerald-700'
                  }`}
                >
                  {over ? `초과 ${fmtWon(-remain)}` : fmtWon(remain)}
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 대분류 1개 = 헤더 행(집계) + 중분류 행들 + 중분류 추가
function CategoryBlock({
  index,
  cat,
  budgetTotal,
  onRename,
  onRemove,
  onAddMid,
  onRemoveMid,
  onUpdateMid,
}: {
  index: number;
  cat: BudgetCategory;
  budgetTotal: number;
  onRename: (name: string) => void;
  onRemove: () => void;
  onAddMid: () => void;
  onRemoveMid: (midId: string) => void;
  onUpdateMid: (midId: string, patch: Partial<BudgetMid>) => void;
}) {
  const sums = catSums(cat);
  const catTotal = sums.gov + sums.cash + sums.inKind;
  const pct = (v: number): number =>
    budgetTotal > 0 ? (v / budgetTotal) * 100 : 0;
  const inCls =
    'w-full rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-indigo-500 focus:outline-none';

  return (
    <>
      {/* 대분류 헤더(집계, 읽기전용) */}
      <tr className="border-b border-slate-100 bg-slate-50/70">
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">{index}.</span>
            <input
              type="text"
              value={cat.name}
              onChange={(e) => onRename(e.target.value)}
              placeholder="대분류명 (예: 운영비)"
              className="w-40 rounded border border-slate-300 px-2 py-1 text-sm font-medium focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </td>
        <NumCell v={sums.gov} bold />
        <NumCell v={sums.cash} bold />
        <NumCell v={sums.inKind} bold />
        <NumCell v={sums.cash + sums.inKind} bold />
        <NumCell v={catTotal} bold />
        <td className="px-2 py-2 text-right text-slate-700 tabular-nums">
          {fmtPct(pct(catTotal))}
        </td>
        <td className="px-2 py-2 text-center">
          <button
            type="button"
            onClick={onRemove}
            className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-red-50 hover:text-red-600"
            title="대분류 삭제"
          >
            ×
          </button>
        </td>
      </tr>

      {/* 중분류 행 */}
      {cat.mids.map((m) => (
        <tr key={m.id} className="border-b border-slate-100">
          <td className="px-3 py-1.5 pl-8">
            <input
              type="text"
              value={m.name}
              onChange={(e) => onUpdateMid(m.id, { name: e.target.value })}
              placeholder="중분류명"
              className="w-44 rounded border border-slate-200 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </td>
          <td className="px-2 py-1.5">
            <MoneyInput
              value={m.gov}
              onChange={(n) => onUpdateMid(m.id, { gov: n })}
              placeholder="0"
              className={inCls}
            />
          </td>
          <td className="px-2 py-1.5">
            <MoneyInput
              value={m.cash}
              onChange={(n) => onUpdateMid(m.id, { cash: n })}
              placeholder="0"
              className={inCls}
            />
          </td>
          <td className="px-2 py-1.5">
            <MoneyInput
              value={m.inKind}
              onChange={(n) => onUpdateMid(m.id, { inKind: n })}
              placeholder="0"
              className={inCls}
            />
          </td>
          <NumCell v={midSub(m)} />
          <NumCell v={midTotal(m)} bold />
          <td className="px-2 py-1.5 text-right text-slate-600 tabular-nums">
            {fmtPct(pct(midTotal(m)))}
          </td>
          <td className="px-2 py-1.5 text-center">
            <button
              type="button"
              onClick={() => onRemoveMid(m.id)}
              disabled={cat.mids.length <= 1}
              className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              title="중분류 삭제"
            >
              ×
            </button>
          </td>
        </tr>
      ))}

      {/* 중분류 추가 */}
      <tr className="border-b border-slate-100">
        <td className="px-3 py-1.5 pl-8" colSpan={8}>
          <button
            type="button"
            onClick={onAddMid}
            className="rounded-md border border-dashed border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600"
          >
            + 중분류 추가
          </button>
        </td>
      </tr>
    </>
  );
}
