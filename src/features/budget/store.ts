import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { genId } from '@/lib/id';

// 사업비 총괄표 — 인건비 외 비목(대분류)과 그 안의 중분류 금액.
// 인건비(대분류 1)는 별도: 용역비(인건비) 계산의 출처 합계에서 자동 산입(여기 저장 안 함).
export interface BudgetMid {
  id: string;
  name: string; // 중분류 명
  gov: number; // 정부출연금(원)
  cash: number; // 민간부담금 현금(원)
  inKind: number; // 민간부담금 현물(원)
}

export interface BudgetCategory {
  id: string;
  name: string; // 대분류 명(운영비·여비 등)
  mids: BudgetMid[];
}

interface BudgetState {
  categories: BudgetCategory[];
  addCategory: () => void;
  removeCategory: (id: string) => void;
  renameCategory: (id: string, name: string) => void;
  addMid: (catId: string) => void;
  removeMid: (catId: string, midId: string) => void;
  updateMid: (catId: string, midId: string, patch: Partial<BudgetMid>) => void;
  resetAll: () => void;
}

const newMid = (name = ''): BudgetMid => ({
  id: genId('bm'),
  name,
  gov: 0,
  cash: 0,
  inKind: 0,
});

const newCategory = (name = ''): BudgetCategory => ({
  id: genId('bc'),
  name,
  mids: [newMid()],
});

// 인건비 제외 기본 대분류 5종.
const DEFAULT_CATEGORY_NAMES = [
  '운영비',
  '여비',
  '업무추진비',
  '연구용역비',
  '유형자산',
];
const defaultCategories = (): BudgetCategory[] =>
  DEFAULT_CATEGORY_NAMES.map((n) => newCategory(n));

// ── 파생 합계 ──────────────────────────────────────────────────────────
export interface SourceTriple {
  gov: number;
  cash: number;
  inKind: number;
}
export const midSub = (m: BudgetMid): number => (m.cash || 0) + (m.inKind || 0); // 민간 소계
export const midTotal = (m: BudgetMid): number =>
  (m.gov || 0) + (m.cash || 0) + (m.inKind || 0); // 합계

export const catSums = (c: BudgetCategory): SourceTriple =>
  c.mids.reduce<SourceTriple>(
    (a, m) => ({
      gov: a.gov + (m.gov || 0),
      cash: a.cash + (m.cash || 0),
      inKind: a.inKind + (m.inKind || 0),
    }),
    { gov: 0, cash: 0, inKind: 0 },
  );

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set) => ({
      categories: defaultCategories(),

      addCategory: () =>
        set((s) => ({ categories: [...s.categories, newCategory('')] })),

      removeCategory: (id) =>
        set((s) => ({ categories: s.categories.filter((c) => c.id !== id) })),

      renameCategory: (id, name) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, name } : c,
          ),
        })),

      addMid: (catId) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === catId ? { ...c, mids: [...c.mids, newMid()] } : c,
          ),
        })),

      removeMid: (catId, midId) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === catId
              ? { ...c, mids: c.mids.filter((m) => m.id !== midId) }
              : c,
          ),
        })),

      updateMid: (catId, midId, patch) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === catId
              ? {
                  ...c,
                  mids: c.mids.map((m) =>
                    m.id === midId ? { ...m, ...patch } : m,
                  ),
                }
              : c,
          ),
        })),

      resetAll: () => set({ categories: defaultCategories() }),
    }),
    {
      name: 'proposal_writer.budget.v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
