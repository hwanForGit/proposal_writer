import { useEffect, useMemo, useState } from 'react';
import {
  useLaborStore,
  memberCost,
  totalCost,
  effectiveRate,
  sourceSums,
  type Member,
  type SalaryBasis,
  type FundingSource,
} from '@/features/labor/store';
import {
  useProjectCostStore,
  computeProjectCost,
} from '@/features/projectCost/store';
import { copyToClipboard } from '@/lib/clipboard';

const salaryLabel = (basis: SalaryBasis): string =>
  basis === 'monthly' ? '월 단가' : '연봉총액';

const fmtWon = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;

export default function LaborCostPage() {
  const targetTotal = useLaborStore((s) => s.targetTotal);
  const salaryBasis = useLaborStore((s) => s.salaryBasis);
  const projectMonths = useLaborStore((s) => s.projectMonths);
  const setProjectMonths = useLaborStore((s) => s.setProjectMonths);
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

  // 총 사업비 섹션 값 → '가져오기' 버튼으로 출처 예산에 채움
  const pcGovGrant = useProjectCostStore((s) => s.govGrant);
  const pcSelfRatio = useProjectCostStore((s) => s.selfRatioPct);
  const pcCashRatio = useProjectCostStore((s) => s.cashRatioPct);
  const pc = useMemo(
    () => computeProjectCost(pcGovGrant, pcSelfRatio, pcCashRatio),
    [pcGovGrant, pcSelfRatio, pcCashRatio],
  );

  // 정부출연금 인건비 한도(총사업비의 N%) 사용 시 정부출연금 예산 자동 산정.
  //   정부출연금 = max(0, 총사업비×N% − 자부담 현물)  (1순위 현물 차감, 3순위 현금 그대로)
  const govLaborAuto = govLaborPct > 0;
  useEffect(() => {
    if (!govLaborAuto) return;
    const desired = Math.max(
      0,
      Math.round((pc.total * govLaborPct) / 100) - sourceInKind,
    );
    if (desired !== sourceGov) setSourceGov(desired);
  }, [govLaborAuto, govLaborPct, pc.total, sourceInKind, sourceGov, setSourceGov]);

  const computed = useMemo(
    () => totalCost(members, salaryBasis),
    [members, salaryBasis],
  );
  const diff = targetTotal != null ? computed - targetTotal : 0;
  // 허용오차는 원 단위 반올림 잔차만 흡수(인력 수 ×1원). 그 이상은 정직하게 불일치로 표시.
  const tol = targetTotal != null ? Math.max(1, members.length) : 0;

  // 인력별 선택 출처에 따른 출처별 배정 합계
  const assigned = useMemo(
    () => sourceSums(members, salaryBasis),
    [members, salaryBasis],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">🧮 사업비 계산</h1>
          <p className="mt-1 text-xs text-gray-500">
            정부지원금·자부담으로 총 사업비를 구성하고, 용역비(인건비)를
            산출합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('입력한 내용을 모두 지웁니다. 계속할까요?')) {
              resetAll();
              resetProjectCost();
            }
          }}
          className="shrink-0 rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          초기화
        </button>
      </header>

      {/* 총 사업비 */}
      <ProjectCostSection />

      {/* 용역비(인건비) 계산 */}
      <div className="border-t border-gray-200 pt-4">
        <h2 className="text-base font-semibold text-gray-900">
          용역비(인건비) 계산
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          {salaryBasis === 'monthly'
            ? '인건비 = 월 단가(4대보험·퇴직금 포함) × 투입률 × 참여개월.'
            : '인건비 = 연봉총액(4대보험·퇴직금 포함) × 투입률 × (참여개월 ÷ 12).'}{' '}
          국가연구개발사업 비목별 계상기준 기반. 산출 인건비는 천원 단위 내림.
        </p>
      </div>

      {/* 지출 출처 예산 + 단가 기준 */}
      <section className="rounded-lg border border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-gray-800">지출 출처 예산</span>
            <button
              type="button"
              onClick={() =>
                fillSourcesFromProject(
                  pc.inKind,
                  govLaborAuto
                    ? Math.max(
                        0,
                        Math.round((pc.total * govLaborPct) / 100) - pc.inKind,
                      )
                    : (pcGovGrant ?? 0),
                  pc.cash,
                )
              }
              className="rounded border border-emerald-300 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
              title="위 '총 사업비'의 자부담 현물·정부지원금·자부담 현금 값을 가져옵니다."
            >
              💰 총 사업비에서 가져오기
            </button>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <span className="text-gray-600">사업 기간</span>
              <input
                type="number"
                min={1}
                max={120}
                value={projectMonths || ''}
                onChange={(e) => setProjectMonths(Number(e.target.value) || 0)}
                placeholder="12"
                className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none"
              />
              <span className="text-gray-500">개월</span>
            </label>
            <span className="text-gray-600">단가 기준</span>
            <div className="inline-flex overflow-hidden rounded border border-gray-300 text-xs">
              <button
                type="button"
                onClick={() => setSalaryBasis('annual')}
                className={`px-3 py-1 ${salaryBasis === 'annual' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
              >
                연봉
              </button>
              <button
                type="button"
                onClick={() => setSalaryBasis('monthly')}
                className={`px-3 py-1 ${salaryBasis === 'monthly' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
              >
                월 단가
              </button>
            </div>
          </div>
        </div>

        {/* 정부출연금 인건비 한도 (총사업비의 N%) */}
        <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span>정부출연금 인건비 한도</span>
          <span>= 총사업비의</span>
          <input
            type="number"
            min={0}
            max={100}
            value={govLaborPct || ''}
            onChange={(e) => setGovLaborPct(Number(e.target.value) || 0)}
            placeholder="0"
            className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none"
          />
          <span>%</span>
          {govLaborAuto ? (
            <span className="text-[11px] text-emerald-700">
              → 정부출연금 = 총사업비×{govLaborPct}% − 자부담 현물 (자동)
            </span>
          ) : (
            <span className="text-[11px] text-gray-400">
              (0 = 미사용, 정부출연금 직접 입력)
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
            label="② 정부출연금"
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

        <div className="mt-2 text-right text-xs text-gray-500">
          목표 총 인건비(세 출처 합):{' '}
          <span className="font-semibold text-gray-800">
            {fmtWon(targetTotal ?? 0)}
          </span>
        </div>
      </section>

      {/* 투입 인력 표 */}
      <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-600">
              <th className="px-3 py-2 text-left font-medium">성명 / 역할</th>
              <th className="px-3 py-2 text-right font-medium">
                {salaryLabel(salaryBasis)} (4대보험·퇴직금 포함)
              </th>
              <th className="px-3 py-2 text-right font-medium">참여개월</th>
              <th className="px-3 py-2 text-left font-medium">투입률</th>
              <th className="px-3 py-2 text-right font-medium">산출 인건비</th>
              <th className="px-2 py-2"></th>
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
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
              <td className="px-3 py-2 text-gray-800" colSpan={4}>
                합계 ({members.length}명)
              </td>
              <td className="px-3 py-2 text-right text-gray-900">
                {fmtWon(computed)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <div className="border-t border-gray-100 px-3 py-2">
          <button
            type="button"
            onClick={addMember}
            className="rounded border border-dashed border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
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
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            title="고정 투입률은 유지하고, 변동 인력은 최대 상한선 이하에서 연봉 높은 순으로 목표(출처 예산 합)까지 자동 계산합니다."
          >
            ⚙️ 자동 계산하기
          </button>
          <span className="text-[11px] text-gray-500">
            고정 투입률은 그대로 두고, 변동 인력은 <b>최대 상한선 이하</b>에서{' '}
            <b>연봉 높은 순</b>으로 목표(출처 예산 합)까지 자동 산정합니다.
          </span>
        </div>
      </section>

      <CopyBar members={members} computed={computed} basis={salaryBasis} />
    </div>
  );
}

// ─── 금액 입력 (천 단위 콤마 자동) ──────────────────────────────────
// type=number는 콤마를 못 넣으므로 text로 받아 숫자만 저장하고 콤마로 표시.
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
  const display = value ? value.toLocaleString('ko-KR') : '';
  return (
    <input
      type="text"
      inputMode="numeric"
      readOnly={readOnly}
      value={display}
      onChange={(e) => {
        if (readOnly) return;
        const digits = e.target.value.replace(/[^\d]/g, '');
        onChange(digits === '' ? 0 : Number(digits));
      }}
      placeholder={placeholder}
      className={className}
    />
  );
}

// ─── 지출 출처 ───────────────────────────────────────────────────────

const SOURCE_META: Record<FundingSource, { label: string; cls: string }> = {
  inKind: { label: '자부담 현물', cls: 'bg-amber-100 text-amber-800' },
  gov: { label: '정부출연금', cls: 'bg-blue-100 text-blue-800' },
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
  const remain = value - assigned;
  const over = remain < 0;
  return (
    <div className="rounded border border-gray-200 bg-gray-50/60 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        <span className="text-[10px] text-gray-400">
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
            ? 'border-gray-200 bg-gray-100 text-gray-500'
            : 'border-gray-300 focus:border-blue-500'
        }`}
      />
      <div className="mt-1 flex justify-between text-[10px]">
        <span className="text-gray-600">배정 {fmtWon(assigned)}</span>
        <span className={over ? 'font-semibold text-red-600' : 'text-gray-500'}>
          {over ? `초과 ${fmtWon(-remain)}` : `잔여 ${fmtWon(remain)}`}
        </span>
      </div>
    </div>
  );
}

// ─── 총 사업비 (정부지원금 + 자부담금) ──────────────────────────────

function ProjectCostSection() {
  const govGrant = useProjectCostStore((s) => s.govGrant);
  const selfRatioPct = useProjectCostStore((s) => s.selfRatioPct);
  const cashRatioPct = useProjectCostStore((s) => s.cashRatioPct);
  const setGovGrant = useProjectCostStore((s) => s.setGovGrant);
  const setSelfRatioPct = useProjectCostStore((s) => s.setSelfRatioPct);
  const setCashRatioPct = useProjectCostStore((s) => s.setCashRatioPct);

  const { total, selfFund, cash, inKind } = computeProjectCost(
    govGrant,
    selfRatioPct,
    cashRatioPct,
  );

  const numCls =
    'w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none';

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50/40 px-4 py-3">
      <h2 className="text-base font-semibold text-gray-900">💰 총 사업비</h2>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-gray-700">정부지원금</span>
          <MoneyInput
            value={govGrant ?? 0}
            onChange={(n) => setGovGrant(n > 0 ? n : null)}
            placeholder="예: 70,000,000"
            className="w-44 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none"
          />
          <span className="text-gray-500">원</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-gray-700">자부담 비율</span>
          <input
            type="number"
            min={0}
            max={99.9}
            value={selfRatioPct || ''}
            onChange={(e) => setSelfRatioPct(Number(e.target.value) || 0)}
            placeholder="예: 30"
            className={numCls}
          />
          <span className="text-gray-500">% (총사업비 대비)</span>
        </label>
      </div>

      {/* 자부담금 / 총 사업비 요약 */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <SummaryBox label="정부지원금" value={govGrant ?? 0} />
        <SummaryBox label="자부담금" value={selfFund} />
        <SummaryBox label="총 사업비" value={total} highlight />
      </div>

      {/* 자부담금 내 현금/현물 */}
      <div className="mt-3 border-t border-emerald-200 pt-3">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-700">자부담금 중 현금 비율</span>
          <input
            type="number"
            min={0}
            max={100}
            value={cashRatioPct || ''}
            onChange={(e) => setCashRatioPct(Number(e.target.value) || 0)}
            placeholder="예: 40"
            className={numCls}
          />
          <span className="text-gray-500">%</span>
          <span className="ml-1 text-xs text-gray-400">
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
  return (
    <div
      className={`rounded border px-3 py-2 ${
        highlight
          ? 'border-emerald-300 bg-white'
          : 'border-gray-200 bg-white/70'
      }`}
    >
      <div className="text-[11px] text-gray-500">{label}</div>
      <div
        className={`tabular-nums ${highlight ? 'text-base font-bold text-emerald-700' : 'text-sm font-semibold text-gray-800'}`}
      >
        {fmtWon(value)}
      </div>
    </div>
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
  const numCls =
    'w-full rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none';
  return (
    <tr className="border-b border-gray-100 align-top">
      <td className="px-3 py-2">
        <input
          type="text"
          value={m.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="예: 홍길동 / 책임연구원"
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        />
      </td>
      <td className="px-3 py-2">
        <MoneyInput
          value={m.salary}
          onChange={(n) => onChange({ salary: n })}
          placeholder={basis === 'monthly' ? '예: 5,000,000' : '예: 60,000,000'}
          className={numCls}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min={0}
          max={120}
          value={m.months || ''}
          onChange={(e) => onChange({ months: Number(e.target.value) || 0 })}
          className={`${numCls} w-20`}
        />
      </td>
      <td className="px-3 py-2">
        <div className="space-y-1.5">
          <div className="inline-flex overflow-hidden rounded border border-gray-300 text-[11px]">
            <button
              type="button"
              onClick={() => onChange({ mode: 'fixed' })}
              className={`px-2 py-0.5 ${m.mode === 'fixed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
            >
              고정
            </button>
            <button
              type="button"
              onClick={() => onChange({ mode: 'range' })}
              className={`px-2 py-0.5 ${m.mode === 'range' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
            >
              범위
            </button>
          </div>
          {m.mode === 'fixed' ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                value={m.rate || ''}
                onChange={(e) => onChange({ rate: Number(e.target.value) || 0 })}
                className={`${numCls} w-16`}
              />
              <span className="text-xs text-gray-500">%</span>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <span className="text-[10px] text-gray-400">최대</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={m.maxRate || ''}
                  onChange={(e) =>
                    onChange({ maxRate: Number(e.target.value) || 0 })
                  }
                  className={`${numCls} w-14`}
                  title="최대 투입률(상한선, %)"
                />
                <span>%</span>
              </div>
              <div className="text-[10px] text-gray-500">
                적용{' '}
                <span className="font-semibold text-indigo-600">
                  {effectiveRate(m)}%
                </span>{' '}
                <span className="text-gray-400">(자동 계산)</span>
              </div>
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-900">
        {fmtWon(memberCost(m, basis))}
        {m.costAdjust !== 0 && (
          <div className="text-[10px] font-normal text-indigo-600">
            (잔액 조정 {m.costAdjust > 0 ? '+' : ''}
            {Math.round(m.costAdjust).toLocaleString('ko-KR')})
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
            <option value="gov">정부출연금</option>
            <option value="cash">자부담 현금</option>
          </select>
        </div>
      </td>
      <td className="px-2 py-2 text-center">
        <button
          type="button"
          onClick={onRemove}
          disabled={!removable}
          className="rounded border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
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
  if (target == null) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
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

function buildRows(members: Member[], basis: SalaryBasis) {
  return members.map((m) => ({
    name: m.name || '-',
    salary: Math.round(m.salary).toLocaleString('ko-KR'),
    months: String(m.months),
    rate: `${effectiveRate(m)}%`,
    cost: Math.round(memberCost(m, basis)).toLocaleString('ko-KR'),
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
  const rows = buildRows(members, basis);
  const salCol = salaryLabel(basis);

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
    <section className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
      <span className="text-xs font-medium text-gray-600">결과 복사:</span>
      <button
        type="button"
        onClick={() => copy(asMarkdown(), 'Markdown 표')}
        className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
      >
        📋 Markdown 표
      </button>
      <button
        type="button"
        onClick={() => copy(asTsv(), '엑셀(탭 구분)')}
        className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
      >
        📋 엑셀 붙여넣기용
      </button>
      {msg && <span className="text-xs text-green-600">{msg}</span>}
    </section>
  );
}
