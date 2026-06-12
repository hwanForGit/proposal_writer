import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

interface ProjectCostState {
  govGrant: number | null; // 정부출연금(원)
  selfRatioPct: number; // 자부담 비율(%) — 총사업비 대비
  cashRatioPct: number; // 자부담금 중 현금 비율(%)

  setGovGrant: (v: number | null) => void;
  setSelfRatioPct: (v: number) => void;
  setCashRatioPct: (v: number) => void;
  reset: () => void;
}

export const useProjectCostStore = create<ProjectCostState>()(
  persist(
    (set) => ({
      govGrant: null,
      selfRatioPct: 0,
      cashRatioPct: 0,
      setGovGrant: (v) => set({ govGrant: v != null && v > 0 ? v : null }),
      // 자부담 100%면 총사업비가 무한대 → 99.9%로 상한
      setSelfRatioPct: (v) => set({ selfRatioPct: clamp(v || 0, 0, 99.9) }),
      setCashRatioPct: (v) => set({ cashRatioPct: clamp(v || 0, 0, 100) }),
      reset: () => set({ govGrant: null, selfRatioPct: 0, cashRatioPct: 0 }),
    }),
    {
      name: 'proposal_writer.projectcost.v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

export interface ProjectCostResult {
  total: number; // 총 사업비 = 정부출연금 + 자부담금
  selfFund: number; // 자부담금
  cash: number; // 자부담금 중 현금
  inKind: number; // 자부담금 중 현물
}

// 총사업비 대비 자부담 비율:
//   총사업비 = 정부출연금 ÷ (1 − 자부담비율)
//   자부담금 = 총사업비 − 정부출연금
//   현금 = 자부담금 × 현금비율 / 현물 = 자부담금 − 현금
export function computeProjectCost(
  govGrant: number | null,
  selfRatioPct: number,
  cashRatioPct: number,
): ProjectCostResult {
  const gov = govGrant ?? 0;
  const r = clamp(selfRatioPct || 0, 0, 99.9) / 100;
  const total = gov > 0 ? Math.round(gov / (1 - r)) : 0;
  const selfFund = Math.max(0, total - gov);
  const cash = Math.round((selfFund * clamp(cashRatioPct || 0, 0, 100)) / 100);
  const inKind = Math.max(0, selfFund - cash);
  return { total, selfFund, cash, inKind };
}
