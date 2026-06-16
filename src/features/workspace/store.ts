import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  ApiError,
  fetchStep2Sections,
  generateBodySection,
  generateOutlineStep1,
  generatePageAllocation,
  generateStep2Section,
  type OutlineUsage,
} from '@/lib/api';
import { parseSection } from '@/features/outline/sectionTree';
import {
  initialCoverMeta as buildInitialCoverMeta,
  type CoverMeta,
} from '@/features/export/types';
import type { FileCategory, WorkspaceFile } from './types';

interface UploadingInit {
  id: string;
  name: string;
  size: number;
  category: FileCategory;
}

interface ParsedPayload {
  mimeType: string;
  textContent: string;
  extractedAt: string;
  warnings: string[];
}

export type StepStatus = 'idle' | 'generating' | 'ready' | 'error';

export interface OutlineStepState {
  status: StepStatus;
  markdown: string | null;
  modelId: string | null;
  generatedAt: string | null;
  elapsedMs: number | null;
  startedAt?: number | null; // 생성 시작 시각(ms). 경과 시간 표시 기준(화면 이동에도 유지).
  usage: OutlineUsage | null;
  finishReason: string | null;
  error: { code: string; message: string } | null;
}

const initialStep: OutlineStepState = {
  status: 'idle',
  markdown: null,
  modelId: null,
  generatedAt: null,
  elapsedMs: null,
  startedAt: null,
  usage: null,
  finishReason: null,
  error: null,
};

export type SectionStatus = 'pending' | 'generating' | 'ready' | 'error';

export interface SectionState {
  index: number;
  title: string;
  status: SectionStatus;
  markdown: string | null;
  modelId: string | null;
  generatedAt: string | null;
  elapsedMs: number | null;
  startedAt?: number | null; // 생성 시작 시각(ms)
  usage: OutlineUsage | null;
  finishReason: string | null;
  error: { code: string; message: string } | null;
}

export type Step2Status =
  | 'idle'
  | 'fetching-sections'
  | 'in-progress'
  | 'all-done'
  | 'error';

export interface Step2State {
  status: Step2Status;
  sections: SectionState[];
  currentSectionIndex: number;
  error: { code: string; message: string } | null;
}

const initialStep2: Step2State = {
  status: 'idle',
  sections: [],
  currentSectionIndex: 0,
  error: null,
};

export type BodyStatus = 'pending' | 'generating' | 'ready' | 'error';

export interface BodyItemRef {
  mainIndex: number;
  mainTitle: string;
  midIndex: number;
  midTitle: string;
  midGuidance: string;
}

export interface BodyState {
  id: string;
  ref: BodyItemRef;
  status: BodyStatus;
  markdown: string | null;
  finishReason: string | null;
  modelId: string | null;
  generatedAt: string | null;
  elapsedMs: number | null;
  startedAt?: number | null; // 생성 시작 시각(ms)
  usage: OutlineUsage | null;
  error: { code: string; message: string } | null;
}

export type Step3Status = 'idle' | 'in-progress' | 'all-done' | 'error';

export interface Step3State {
  status: Step3Status;
  bodies: BodyState[];
  currentBodyIndex: number;
  error: { code: string; message: string } | null;
}

const initialStep3: Step3State = {
  status: 'idle',
  bodies: [],
  currentBodyIndex: 0,
  error: null,
};

export interface OutlineState {
  currentStep: 1 | 2 | 3;
  step1: OutlineStepState;
  step2: Step2State;
  step3: Step3State;
}

const initialOutline: OutlineState = {
  currentStep: 1,
  step1: { ...initialStep },
  step2: { ...initialStep2 },
  step3: { ...initialStep3 },
};

// ── 페이지 배분 (중분류별 목표 장수) ────────────────────────────────
export interface AllocationItem {
  key: string; // `${mainIndex}-${midIndex}` (body id와 동일 좌표계)
  mainIndex: number;
  midIndex: number;
  mainTitle: string;
  midTitle: string;
  pages: number; // 배정 페이지 (0.5 단위)
  weight: number; // LLM 중요도 가중치 (1~10)
  reason: string; // 배분 근거 한 줄
  manual?: boolean; // 사용자가 수동으로 조정한 항목
}

export type PageAllocationStatus = 'idle' | 'generating' | 'ready' | 'error';

export interface PageAllocationState {
  status: PageAllocationStatus;
  items: AllocationItem[];
  error: { code: string; message: string } | null;
}

const initialPageAllocation: PageAllocationState = {
  status: 'idle',
  items: [],
  error: null,
};

// 1페이지 ≈ 한국어 본문 글자 수(A4, 맑은 고딕 10~11pt, 줄간격 160% 기준 근사).
// 한 페이지당 추정 글자 수(렌더 밀도). 목표 페이지 × 이 값 = 본문 목표 자수.
// 실제 PDF/DOCX 렌더 밀도(제목·표·여백 포함)에 맞춘 보수적 값. 결과가 목표보다 길면
// 더 낮추고, 짧으면 높여 보정하면 됨.
export const CHARS_PER_PAGE = 1300;

// 해당 본문(중분류)에 배정된 목표 글자 수. 배분이 없으면 null(기존 단일 호출 흐름).
const targetCharsForBody = (
  body: BodyState,
  items: AllocationItem[],
): number | null => {
  const key = `${body.ref.mainIndex}-${body.ref.midIndex}`;
  const a = items.find((it) => it.key === key);
  return a && a.pages > 0 ? Math.round(a.pages * CHARS_PER_PAGE) : null;
};

// Step 2 대분류들에서 중분류 평면 목록 추출 (body/배분 좌표계: key = `${mainIndex}-${midIndex}`)
interface MidMeta {
  key: string;
  mainIndex: number;
  midIndex: number;
  mainTitle: string;
  midTitle: string;
  midGuidance: string;
}
const collectMidItems = (sections: SectionState[]): MidMeta[] =>
  sections.flatMap((sec) => {
    if (!sec.markdown) return [];
    const tree = parseSection(sec.markdown, sec.title);
    return tree.midNodes.map((mid, mIdx) => ({
      key: `${sec.index}-${mIdx}`,
      mainIndex: sec.index,
      midIndex: mIdx,
      mainTitle: `[${sec.index}] ${sec.title}`,
      midTitle: mid.title,
      midGuidance: mid.guidance,
    }));
  });

// n개 항목에 total 페이지를 0.5 단위로 균등 분배(합 = total). 큰 잔여부터 +0.5.
const evenSplitPages = (n: number, total: number): number[] => {
  if (n <= 0) return [];
  const units = Math.round(total / 0.5); // 0.5 단위 개수
  const base = Math.floor(units / n);
  const rem = units - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < rem ? 1 : 0)) * 0.5);
};

interface WorkspaceState {
  files: WorkspaceFile[];
  outline: OutlineState;
  coverMeta: CoverMeta;
  // 페이지 배분: 사용자가 입력한 목표 총 페이지 + LLM 배분 결과
  pageLimit: number | null;
  pageAllocation: PageAllocationState;
  // 자동 진행(한 번에 끝까지) 상태 — 영속화하지 않음(transient)
  autoRunActive: boolean;
  autoRunStop: boolean;
  // 자동 진행 중 화면이 생성 위치를 따라갈지. 사용자가 직접 이동하면 false → 머무름.
  autoFollowView: boolean;
  // 자동 진행 중 본문이 잘려 이어쓰기 여부를 물어보는 모달 상태(null=닫힘).
  pendingContinue: { bodyIndex: number; midTitle: string } | null;

  addUploadingFiles: (items: UploadingInit[]) => void;
  markParsed: (id: string, payload: ParsedPayload) => void;
  markError: (id: string, code: string, message: string) => void;
  removeFile: (id: string) => void;
  removeByName: (category: FileCategory, names: string[]) => void;

  generateStep1: () => Promise<void>;
  setStep1Markdown: (markdown: string) => void;
  proceedToStep2: () => Promise<void>;
  retryStep2Sections: () => Promise<void>;
  generateCurrentSection: (index?: number) => Promise<void>;
  retryCurrentSection: () => Promise<void>;
  setSectionMarkdown: (index: number, markdown: string) => void;
  nextSection: () => Promise<void>;
  proceedToStep3: () => Promise<void>;
  generateCurrentBody: (index?: number) => Promise<void>;
  retryCurrentBody: () => Promise<void>;
  continueCurrentBody: (index?: number) => Promise<void>;
  setBodyMarkdown: (index: number, markdown: string) => void;
  nextBody: () => Promise<void>;
  setCurrentStep: (step: 1 | 2 | 3) => void;
  setCurrentSectionIndex: (index: number) => void;
  setCurrentBodyIndex: (index: number) => void;
  setCoverMeta: (patch: Partial<CoverMeta>) => void;
  // stopAfter: 'step2'면 아웃라인 구조(Step 2 all-done)까지만, 'step3'(기본)이면 본문 끝까지.
  runAll: (stopAfter?: 'step2' | 'step3') => Promise<void>;
  stopAutoRun: () => void;
  resolveContinue: (decision: boolean) => void;
  setPageLimit: (pages: number | null) => void;
  generatePageAllocation: () => Promise<void>;
  // 중분류 1개의 배정 페이지를 수동으로 덮어쓴다(0.5 단위). 합계가 목표와 달라도 허용.
  setAllocationPages: (key: string, pages: number) => void;
  // LLM 없이 중분류 목록을 균등 분배(목표 페이지 합)로 채워 수동 편집을 시작한다.
  initManualAllocation: () => void;
  resetOutline: () => void;
  resetAll: () => void;
}

const buildLlmInputs = (files: WorkspaceFile[]) => {
  const map = (cat: FileCategory) =>
    files
      .filter((f) => f.category === cat && f.status === 'parsed')
      .map((f) => ({
        id: f.id,
        name: f.name,
        category: f.category,
        textContent: f.textContent ?? '',
      }));
  return {
    announcementFiles: map('announcement'),
    companyFiles: map('company'),
  };
};

const errInfo = (err: unknown): { code: string; message: string } => ({
  code: err instanceof ApiError ? err.code : 'UNEXPECTED',
  message: err instanceof Error ? err.message : String(err),
});

// 본문이 분량 한도로 잘렸는지 — 게이트웨이/모델별로 'length'(OpenAI) 또는
// 'max_tokens'(Anthropic 계열)로 올 수 있어 둘 다 잘림으로 본다.
export const isTruncated = (finishReason: string | null | undefined): boolean =>
  finishReason === 'length' || finishReason === 'max_tokens';

// 자동 진행 중 이어쓰기 확인 모달의 사용자 응답을 기다리는 resolver.
// 동시에 하나의 자동 진행만 존재하므로 모듈 스코프 단일 변수로 충분하다.
let continueResolver: ((decision: boolean) => void) | null = null;

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
  files: [],
  outline: initialOutline,
  coverMeta: buildInitialCoverMeta(),
  pageLimit: null,
  pageAllocation: { ...initialPageAllocation },
  autoRunActive: false,
  autoRunStop: false,
  autoFollowView: true,
  pendingContinue: null,

  addUploadingFiles: (items) =>
    set((state) => ({
      files: [
        ...state.files,
        ...items.map<WorkspaceFile>((it) => ({
          id: it.id,
          name: it.name,
          size: it.size,
          category: it.category,
          status: 'uploading',
        })),
      ],
    })),

  markParsed: (id, payload) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.id === id ? { ...f, status: 'parsed', ...payload } : f,
      ),
    })),

  markError: (id, code, message) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.id === id
          ? { ...f, status: 'error', errorCode: code, errorMessage: message }
          : f,
      ),
    })),

  removeFile: (id) =>
    set((state) => ({ files: state.files.filter((f) => f.id !== id) })),

  removeByName: (category, names) => {
    const nameSet = new Set(names);
    set((state) => ({
      files: state.files.filter(
        (f) => !(f.category === category && nameSet.has(f.name)),
      ),
    }));
  },

  // ── Step 1 ──────────────────────────────────────────────────────
  generateStep1: async () => {
    const { files } = get();
    const inputs = buildLlmInputs(files);
    set((state) => ({
      outline: {
        ...state.outline,
        currentStep: 1,
        step1: { ...initialStep, status: 'generating', startedAt: Date.now() },
      },
    }));
    try {
      const res = await generateOutlineStep1(inputs);
      set((state) => ({
        outline: {
          ...state.outline,
          step1: {
            status: 'ready',
            markdown: res.markdown,
            modelId: res.modelId,
            generatedAt: res.generatedAt,
            elapsedMs: res.elapsedMs,
            usage: res.usage,
            finishReason: res.finishReason,
            error: null,
          },
        },
      }));
    } catch (err) {
      set((state) => ({
        outline: {
          ...state.outline,
          step1: { ...initialStep, status: 'error', error: errInfo(err) },
        },
      }));
    }
  },

  // ── Step 2 ──────────────────────────────────────────────────────
  proceedToStep2: async () => {
    const keepView = get().autoRunActive && !get().autoFollowView;
    set((state) => ({
      outline: {
        ...state.outline,
        currentStep: keepView ? state.outline.currentStep : 2,
        step2: { ...initialStep2, status: 'fetching-sections' },
      },
    }));
    await get().retryStep2Sections();
  },

  retryStep2Sections: async () => {
    const { files, outline } = get();
    const step1Markdown = outline.step1.markdown ?? '';
    if (!step1Markdown) {
      set((state) => ({
        outline: {
          ...state.outline,
          step2: {
            ...state.outline.step2,
            status: 'error',
            error: { code: 'NO_STEP1', message: 'Step 1 결과가 없습니다' },
          },
        },
      }));
      return;
    }
    set((state) => ({
      outline: {
        ...state.outline,
        step2: { ...state.outline.step2, status: 'fetching-sections', error: null },
      },
    }));
    try {
      const inputs = buildLlmInputs(files);
      const res = await fetchStep2Sections({ ...inputs, step1Markdown });
      const sections: SectionState[] = res.sections.map((s) => ({
        index: s.index,
        title: s.title,
        status: 'pending',
        markdown: null,
        modelId: null,
        generatedAt: null,
        elapsedMs: null,
        usage: null,
        finishReason: null,
        error: null,
      }));
      set((state) => ({
        outline: {
          ...state.outline,
          step2: {
            status: 'in-progress',
            sections,
            currentSectionIndex: 0,
            error: null,
          },
        },
      }));
      // 첫 대분류 자동 시작
      await get().generateCurrentSection();
    } catch (err) {
      set((state) => ({
        outline: {
          ...state.outline,
          step2: {
            ...state.outline.step2,
            status: 'error',
            error: errInfo(err),
          },
        },
      }));
    }
  },

  generateCurrentSection: async (index?: number) => {
    const { files, outline } = get();
    const { step2, step1 } = outline;
    const i = index ?? step2.currentSectionIndex;
    const section = step2.sections[i];
    if (!section) return;
    if (!step1.markdown) return;

    // mark generating
    set((state) => ({
      outline: {
        ...state.outline,
        step2: {
          ...state.outline.step2,
          sections: state.outline.step2.sections.map((s, idx) =>
            idx === i
              ? {
                  ...s,
                  status: 'generating',
                  markdown: null,
                  error: null,
                  startedAt: Date.now(),
                }
              : s,
          ),
        },
      },
    }));

    const inputs = buildLlmInputs(files);
    const callArgs = {
      ...inputs,
      step1Markdown: step1.markdown,
      allSectionTitles: step2.sections.map((s) => s.title),
      currentSection: section.title,
    };

    // 504/timeout 류는 1회 자동 재시도 (5초 대기). 그 외 에러는 즉시 실패.
    const isTransient = (err: unknown): boolean => {
      if (!(err instanceof ApiError)) return false;
      const status = err.status;
      return (
        err.code === 'LLM_REQUEST_FAILED' &&
        (status === 502 || status === 503 || status === 504 || status === 0)
      );
    };

    let res: Awaited<ReturnType<typeof generateStep2Section>> | null = null;
    let lastErr: unknown = null;
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          await new Promise((r) => setTimeout(r, 5000));
        }
        res = await generateStep2Section(callArgs);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (!isTransient(err) || attempt === maxAttempts) break;
      }
    }

    if (res) {
      set((state) => ({
        outline: {
          ...state.outline,
          step2: {
            ...state.outline.step2,
            sections: state.outline.step2.sections.map((s, idx) =>
              idx === i
                ? {
                    ...s,
                    status: 'ready',
                    markdown: res.markdown,
                    modelId: res.modelId,
                    generatedAt: res.generatedAt,
                    elapsedMs: res.elapsedMs,
                    usage: res.usage,
                    finishReason: res.finishReason,
                    error: null,
                  }
                : s,
            ),
          },
        },
      }));
    } else {
      set((state) => ({
        outline: {
          ...state.outline,
          step2: {
            ...state.outline.step2,
            sections: state.outline.step2.sections.map((s, idx) =>
              idx === i
                ? { ...s, status: 'error', error: errInfo(lastErr) }
                : s,
            ),
          },
        },
      }));
    }
  },

  retryCurrentSection: async () => {
    await get().generateCurrentSection();
  },

  setStep1Markdown: (markdown) =>
    set((state) => ({
      outline: {
        ...state.outline,
        step1: { ...state.outline.step1, markdown },
      },
    })),

  setSectionMarkdown: (index, markdown) =>
    set((state) => ({
      outline: {
        ...state.outline,
        step2: {
          ...state.outline.step2,
          sections: state.outline.step2.sections.map((s, i) =>
            i === index ? { ...s, markdown } : s,
          ),
        },
      },
    })),

  nextSection: async () => {
    const { outline } = get();
    const last = outline.step2.sections.length - 1;
    if (outline.step2.currentSectionIndex >= last) {
      // 마지막 — all done
      set((state) => ({
        outline: {
          ...state.outline,
          step2: { ...state.outline.step2, status: 'all-done' },
        },
      }));
      return;
    }
    set((state) => ({
      outline: {
        ...state.outline,
        step2: {
          ...state.outline.step2,
          currentSectionIndex: state.outline.step2.currentSectionIndex + 1,
        },
      },
    }));
    await get().generateCurrentSection();
  },

  proceedToStep3: async () => {
    const { outline } = get();
    const keepView = get().autoRunActive && !get().autoFollowView;
    // Step 2 모든 sections의 마크다운에서 중분류 추출 → 평면 본문 목록
    const refs: BodyItemRef[] = [];
    for (const sec of outline.step2.sections) {
      if (!sec.markdown) continue;
      const tree = parseSection(sec.markdown, sec.title);
      tree.midNodes.forEach((mid, mIdx) => {
        refs.push({
          mainIndex: sec.index,
          mainTitle: `[${sec.index}] ${sec.title}`,
          midIndex: mIdx,
          midTitle: mid.title,
          midGuidance: mid.guidance,
        });
      });
    }

    if (refs.length === 0) {
      set((state) => ({
        outline: {
          ...state.outline,
          currentStep: keepView ? state.outline.currentStep : 3,
          step3: {
            ...initialStep3,
            status: 'error',
            error: {
              code: 'NO_MID_SECTIONS',
              message:
                'Step 2의 마크다운에서 중분류를 추출하지 못했습니다. Step 2 결과를 확인해주세요.',
            },
          },
        },
      }));
      return;
    }

    // 목표 페이지(pageLimit)가 설정돼 있으면 본문 생성 전에 '페이지 배분'을 보장한다.
    // 배분이 없으면 본문 목표 자수가 비어(null) 기본 분량으로 길게 생성돼 페이지가 폭증함.
    {
      const { pageLimit, pageAllocation } = get();
      if (pageLimit && pageLimit > 0) {
        const itemKeys = new Set(pageAllocation.items.map((it) => it.key));
        const covered =
          pageAllocation.status === 'ready' &&
          refs.every((r) => itemKeys.has(`${r.mainIndex}-${r.midIndex}`));
        if (!covered) await get().generatePageAllocation();
      }
    }

    const bodies: BodyState[] = refs.map((ref) => ({
      id: `body-${ref.mainIndex}-${ref.midIndex}`,
      ref,
      status: 'pending',
      markdown: null,
      finishReason: null,
      modelId: null,
      generatedAt: null,
      elapsedMs: null,
      usage: null,
      error: null,
    }));

    set((state) => ({
      outline: {
        ...state.outline,
        currentStep: keepView ? state.outline.currentStep : 3,
        step3: {
          status: 'in-progress',
          bodies,
          currentBodyIndex: 0,
          error: null,
        },
      },
    }));

    await get().generateCurrentBody();
  },

  generateCurrentBody: async (index?: number) => {
    const { files, outline } = get();
    const { step3, step2, step1 } = outline;
    const i = index ?? step3.currentBodyIndex;
    const body = step3.bodies[i];
    if (!body) return;
    if (!step1.markdown) {
      set((state) => ({
        outline: {
          ...state.outline,
          step3: {
            ...state.outline.step3,
            bodies: state.outline.step3.bodies.map((b, idx) =>
              idx === i
                ? {
                    ...b,
                    status: 'error',
                    error: { code: 'NO_STEP1', message: 'Step 1 결과가 없습니다' },
                  }
                : b,
            ),
          },
        },
      }));
      return;
    }

    // Step 2의 해당 대분류 전체 마크다운 (참고 컨텍스트)
    const step2Section = step2.sections.find(
      (s) => s.index === body.ref.mainIndex,
    );
    const step2SectionMarkdown = step2Section?.markdown ?? '';
    // 페이지 배분이 있으면 이 중분류의 목표 글자 수
    const target = targetCharsForBody(body, get().pageAllocation.items);

    // mark generating
    set((state) => ({
      outline: {
        ...state.outline,
        step3: {
          ...state.outline.step3,
          bodies: state.outline.step3.bodies.map((b, idx) =>
            idx === i
              ? {
                  ...b,
                  status: 'generating',
                  markdown: null,
                  error: null,
                  startedAt: Date.now(),
                }
              : b,
          ),
        },
      },
    }));

    const inputs = buildLlmInputs(files);
    const callArgs = {
      ...inputs,
      step1Markdown: step1.markdown,
      mainTitle: body.ref.mainTitle,
      midTitle: body.ref.midTitle,
      midGuidance: body.ref.midGuidance,
      step2SectionMarkdown,
      targetChars: target ?? undefined,
    };

    // 504/502/503/0 류(게이트웨이 타임아웃 등)는 자동 재시도.
    //   재시도마다 '목표 분량을 0.6배씩 축소'해 초기 호출을 가볍게 → 504 회피.
    //   (줄여서 부족해진 분량은 아래 이어쓰기 루프가 504-안전한 작은 청크로 채움)
    const isTransient = (err: unknown): boolean => {
      if (!(err instanceof ApiError)) return false;
      const status = err.status;
      return (
        err.code === 'LLM_REQUEST_FAILED' &&
        (status === 502 || status === 503 || status === 504 || status === 0)
      );
    };

    const MAX_ATTEMPTS = 4;
    const TARGET_FLOOR = 1200; // 더는 줄이지 않는 목표 하한(자)
    let attemptTarget: number | undefined = target ?? undefined;
    let res: Awaited<ReturnType<typeof generateBodySection>> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        if (attempt > 1) await new Promise((r) => setTimeout(r, 4000));
        res = await generateBodySection({ ...callArgs, targetChars: attemptTarget });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (!isTransient(err) || attempt === MAX_ATTEMPTS) break;
        // 다음 시도엔 목표 분량 축소(무목표였으면 보수적 목표로 시작).
        attemptTarget =
          attemptTarget == null
            ? 2000
            : Math.max(TARGET_FLOOR, Math.round(attemptTarget * 0.6));
      }
    }

    if (res) {
      set((state) => ({
        outline: {
          ...state.outline,
          step3: {
            ...state.outline.step3,
            bodies: state.outline.step3.bodies.map((b, idx) =>
              idx === i
                ? {
                    ...b,
                    status: 'ready',
                    markdown: res.markdown,
                    modelId: res.modelId,
                    generatedAt: res.generatedAt,
                    elapsedMs: res.elapsedMs,
                    usage: res.usage,
                    finishReason: res.finishReason,
                    error: null,
                  }
                : b,
            ),
          },
        },
      }));
    } else {
      set((state) => ({
        outline: {
          ...state.outline,
          step3: {
            ...state.outline.step3,
            bodies: state.outline.step3.bodies.map((b, idx) =>
              idx === i ? { ...b, status: 'error', error: errInfo(lastErr) } : b,
            ),
          },
        },
      }));
    }

    // ── 목표 페이지 분량까지 자동 이어쓰기 ──
    // 배정 목표가 있으면 목표의 ~85%에 도달할 때까지 이어쓰기 반복(호출당 ~2,200자, 504 회피).
    // ★ 단, 마지막 응답이 토큰 한도로 '잘린(finish=length)' 상태면, 목표를 넘었어도
    //   문장이 매끄럽게 끝(finish=stop)날 때까지 이어써서 '내용이 중간에 잘리는' 것을 방지.
    if (res && target) {
      const truncated = (b: { finishReason: string | null } | undefined) =>
        b?.finishReason === 'length';
      const maxChunks = Math.ceil(target / 2000) + 4; // 마무리 이어쓰기 여유 포함
      for (let c = 0; c < maxChunks; c++) {
        if (get().autoRunStop) break;
        const b = get().outline.step3.bodies[i];
        if (!b || b.status !== 'ready' || !b.markdown) break;
        const before = b.markdown.length;
        // 충분히 채웠고(85%↑) + 깔끔히 끝났으면 종료. 잘린 상태면 계속 이어써 마무리.
        if (before >= target * 0.85 && !truncated(b)) break;
        await get().continueCurrentBody(i);
        const b2 = get().outline.step3.bodies[i];
        if (!b2 || b2.status === 'error') break;
        const after = b2.markdown?.length ?? before;
        // 증가량이 미미하고(모델이 마무리) + 잘리지도 않았으면 종료.
        if (after - before < 200 && !truncated(b2)) break;
      }
    }
  },

  retryCurrentBody: async () => {
    await get().generateCurrentBody();
  },

  continueCurrentBody: async (index?: number) => {
    const { files, outline } = get();
    const { step3, step2, step1 } = outline;
    const i = index ?? step3.currentBodyIndex;
    const body = step3.bodies[i];
    if (!body || !body.markdown || !step1.markdown) return;

    const step2Section = step2.sections.find(
      (s) => s.index === body.ref.mainIndex,
    );
    const step2SectionMarkdown = step2Section?.markdown ?? '';

    // 기존 markdown 유지하면서 status만 generating으로
    set((state) => ({
      outline: {
        ...state.outline,
        step3: {
          ...state.outline.step3,
          bodies: state.outline.step3.bodies.map((b, idx) =>
            idx === i
              ? { ...b, status: 'generating', error: null, startedAt: Date.now() }
              : b,
          ),
        },
      },
    }));

    const target = targetCharsForBody(body, get().pageAllocation.items);
    const inputs = buildLlmInputs(files);
    const callArgs = {
      ...inputs,
      step1Markdown: step1.markdown,
      mainTitle: body.ref.mainTitle,
      midTitle: body.ref.midTitle,
      midGuidance: body.ref.midGuidance,
      step2SectionMarkdown,
      previousMarkdown: body.markdown,
      targetChars: target ?? undefined,
    };

    const isTransient = (err: unknown): boolean => {
      if (!(err instanceof ApiError)) return false;
      const status = err.status;
      return (
        err.code === 'LLM_REQUEST_FAILED' &&
        (status === 502 || status === 503 || status === 504 || status === 0)
      );
    };

    let res: Awaited<ReturnType<typeof generateBodySection>> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        if (attempt > 1) await new Promise((r) => setTimeout(r, 5000));
        res = await generateBodySection(callArgs);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (!isTransient(err) || attempt === 2) break;
      }
    }

    if (res) {
      set((state) => ({
        outline: {
          ...state.outline,
          step3: {
            ...state.outline.step3,
            bodies: state.outline.step3.bodies.map((b, idx) => {
              if (idx !== i) return b;
              const merged =
                (b.markdown ?? '').trimEnd() + '\n\n' + res.markdown.trimStart();
              return {
                ...b,
                status: 'ready',
                markdown: merged,
                finishReason: res.finishReason,
                modelId: res.modelId,
                generatedAt: res.generatedAt,
                elapsedMs: (b.elapsedMs ?? 0) + res.elapsedMs,
                usage: res.usage,
                error: null,
              };
            }),
          },
        },
      }));
    } else {
      set((state) => ({
        outline: {
          ...state.outline,
          step3: {
            ...state.outline.step3,
            bodies: state.outline.step3.bodies.map((b, idx) =>
              idx === i ? { ...b, status: 'error', error: errInfo(lastErr) } : b,
            ),
          },
        },
      }));
    }
  },

  setBodyMarkdown: (index, markdown) =>
    set((state) => ({
      outline: {
        ...state.outline,
        step3: {
          ...state.outline.step3,
          bodies: state.outline.step3.bodies.map((b, i) =>
            i === index ? { ...b, markdown } : b,
          ),
        },
      },
    })),

  nextBody: async () => {
    const { outline } = get();
    const last = outline.step3.bodies.length - 1;
    if (outline.step3.currentBodyIndex >= last) {
      set((state) => ({
        outline: {
          ...state.outline,
          step3: { ...state.outline.step3, status: 'all-done' },
        },
      }));
      return;
    }
    set((state) => ({
      outline: {
        ...state.outline,
        step3: {
          ...state.outline.step3,
          currentBodyIndex: state.outline.step3.currentBodyIndex + 1,
        },
      },
    }));
    await get().generateCurrentBody();
  },

      // 아래 세 setter는 사용자의 직접 이동(스텝퍼/뱃지 클릭)에서만 호출된다.
      // 자동 진행 중이라면 화면 따라가기를 끊어, 사용자가 보는 위치에 머물게 한다.
      setCurrentStep: (step) =>
        set((state) => ({
          autoFollowView: false,
          outline: { ...state.outline, currentStep: step },
        })),

      setCurrentSectionIndex: (index) =>
        set((state) => {
          if (
            index < 0 ||
            index >= state.outline.step2.sections.length
          )
            return state;
          return {
            autoFollowView: false,
            outline: {
              ...state.outline,
              step2: { ...state.outline.step2, currentSectionIndex: index },
            },
          };
        }),

      setCurrentBodyIndex: (index) =>
        set((state) => {
          if (index < 0 || index >= state.outline.step3.bodies.length)
            return state;
          return {
            autoFollowView: false,
            outline: {
              ...state.outline,
              step3: { ...state.outline.step3, currentBodyIndex: index },
            },
          };
        }),

      setCoverMeta: (patch) =>
        set((state) => ({ coverMeta: { ...state.coverMeta, ...patch } })),

      // ── 페이지 배분 ───────────────────────────────────────────────
      setPageLimit: (pages) =>
        set({ pageLimit: pages != null && pages > 0 ? pages : null }),

      generatePageAllocation: async () => {
        const { files, outline, pageLimit } = get();
        const { step2, step1 } = outline;
        if (!pageLimit || pageLimit <= 0) {
          set({
            pageAllocation: {
              status: 'error',
              items: [],
              error: { code: 'NO_PAGE_LIMIT', message: '목표 페이지 수를 입력해주세요.' },
            },
          });
          return;
        }

        // 중분류 평면 목록 (body 좌표계와 동일: key = `${mainIndex}-${midIndex}`)
        const items = collectMidItems(step2.sections);

        if (items.length === 0) {
          set({
            pageAllocation: {
              status: 'error',
              items: [],
              error: {
                code: 'NO_MID_SECTIONS',
                message: 'Step 2에서 중분류를 추출하지 못했습니다. Step 2 결과를 확인해주세요.',
              },
            },
          });
          return;
        }

        set({
          pageAllocation: { status: 'generating', items: [], error: null },
        });

        try {
          const companyPresent = files.some(
            (f) => f.category === 'company' && f.status === 'parsed',
          );
          const res = await generatePageAllocation({
            step1Markdown: step1.markdown ?? '',
            companyPresent,
            pageLimit,
            items: items.map(({ key, mainTitle, midTitle, midGuidance }) => ({
              key,
              mainTitle,
              midTitle,
              midGuidance,
            })),
          });
          const byKey = new Map(res.allocations.map((a) => [a.key, a]));
          const merged: AllocationItem[] = items.map((it) => {
            const a = byKey.get(it.key);
            return {
              key: it.key,
              mainIndex: it.mainIndex,
              midIndex: it.midIndex,
              mainTitle: it.mainTitle,
              midTitle: it.midTitle,
              pages: a?.pages ?? 0,
              weight: a?.weight ?? 0,
              reason: a?.reason ?? '',
            };
          });
          set({
            pageAllocation: { status: 'ready', items: merged, error: null },
          });
        } catch (err) {
          set({
            pageAllocation: { status: 'error', items: [], error: errInfo(err) },
          });
        }
      },

      setAllocationPages: (key, pages) => {
        const next = Math.max(0, Math.round(pages * 2) / 2); // 0.5 단위, 음수 방지
        set((state) => ({
          pageAllocation: {
            ...state.pageAllocation,
            status: 'ready',
            error: null,
            items: state.pageAllocation.items.map((it) =>
              it.key === key
                ? { ...it, pages: next, manual: true, reason: '수동 조정' }
                : it,
            ),
          },
        }));
      },

      initManualAllocation: () => {
        const { outline, pageLimit } = get();
        const items = collectMidItems(outline.step2.sections);
        if (items.length === 0) {
          set({
            pageAllocation: {
              status: 'error',
              items: [],
              error: {
                code: 'NO_MID_SECTIONS',
                message: 'Step 2에서 중분류를 추출하지 못했습니다. Step 2 결과를 확인해주세요.',
              },
            },
          });
          return;
        }
        // 목표가 있으면 균등 분배, 없으면 0에서 시작.
        const split =
          pageLimit && pageLimit > 0
            ? evenSplitPages(items.length, pageLimit)
            : items.map(() => 0);
        const merged: AllocationItem[] = items.map((it, i) => ({
          key: it.key,
          mainIndex: it.mainIndex,
          midIndex: it.midIndex,
          mainTitle: it.mainTitle,
          midTitle: it.midTitle,
          pages: split[i] ?? 0,
          weight: 0,
          reason: '수동 배분',
          manual: true,
        }));
        set({ pageAllocation: { status: 'ready', items: merged, error: null } });
      },

      // ── 한 번에 끝까지 자동 진행 ──────────────────────────────────
      // Step 1 → Step 2(대분류 순회) → Step 3(본문 순회)를 현재 위치에서
      // 끝까지 자동으로 몰아간다. 본문이 분량 한도(finishReason==='length')로
      // 끊기면 잠깐 멈춰 이어쓸지 사용자에게 묻는다.
      //   예  → 이어쓰고 계속 자동 진행
      //   아니오 → 자동 진행 종료(해당 본문에 멈춤). 이후 수동 [이어서 작성]/[다음 중분류] 가능.
      // 에러가 나면 자동 진행을 멈추고 기존 에러/재시도 UI에 맡긴다.
      // "정지"(stopAutoRun)는 새 호출을 막을 뿐, 진행 중인 호출은 끝까지 둔다.
      runAll: async (stopAfter: 'step2' | 'step3' = 'step3') => {
        if (get().autoRunActive) return;
        set({ autoRunActive: true, autoRunStop: false, autoFollowView: true });
        const stopped = () => get().autoRunStop;
        // 화면 따라가기: 사용자가 직접 이동했다면(autoFollowView=false) 건드리지 않는다.
        const followSection = (i: number) => {
          if (!get().autoFollowView) return;
          set((state) => ({
            outline: {
              ...state.outline,
              currentStep: 2,
              step2: { ...state.outline.step2, currentSectionIndex: i },
            },
          }));
        };
        const followBody = (i: number) => {
          if (!get().autoFollowView) return;
          set((state) => ({
            outline: {
              ...state.outline,
              currentStep: 3,
              step3: { ...state.outline.step3, currentBodyIndex: i },
            },
          }));
        };
        try {
          // ── Step 1 ──
          if (!stopped() && get().outline.step1.status !== 'ready') {
            await get().generateStep1();
            if (get().outline.step1.status !== 'ready') return; // 에러 → 멈춤
          }
          if (stopped()) return;

          // ── Step 2: 대분류 목록 확보 (없을 때만) ──
          {
            const s2 = get().outline.step2;
            if (
              s2.sections.length === 0 ||
              s2.status === 'idle' ||
              s2.status === 'error'
            ) {
              await get().proceedToStep2();
              if (get().outline.step2.status === 'error') return;
            }
          }

          // ── Step 2: 모든 대분류를 인덱스로 순회 (화면 커서와 무관) ──
          {
            const total = get().outline.step2.sections.length;
            for (let i = 0; i < total; i++) {
              if (stopped()) return;
              let sec = get().outline.step2.sections[i];
              if (!sec) break;
              if (sec.status === 'error') return; // 멈춤 → 수동 재시도
              if (sec.status !== 'ready') {
                followSection(i);
                await get().generateCurrentSection(i);
                sec = get().outline.step2.sections[i];
                if (sec.status !== 'ready') return; // 에러/미완 → 멈춤
              }
            }
            set((state) => ({
              outline: {
                ...state.outline,
                step2: { ...state.outline.step2, status: 'all-done' },
              },
            }));
          }
          if (stopped()) return;
          if (stopAfter === 'step2') return; // 아웃라인 구조까지만

          // ── Step 3: 본문 목록 확보 (없을 때만) ──
          {
            const s3 = get().outline.step3;
            if (
              s3.bodies.length === 0 ||
              s3.status === 'idle' ||
              s3.status === 'error'
            ) {
              await get().proceedToStep3();
              if (get().outline.step3.status === 'error') return;
            }
          }

          // ── Step 3: 모든 중분류 본문을 인덱스로 순회 ──
          {
            const total = get().outline.step3.bodies.length;
            for (let i = 0; i < total; i++) {
              if (stopped()) return;
              let body = get().outline.step3.bodies[i];
              if (!body) break;
              if (body.status === 'error') return;

              // 페이지 배분이 있는 본문은 generateCurrentBody가 목표까지 자동
              // 이어쓰기하므로 모달이 불필요. 배분이 없을 때만 잘림 모달로 확인.
              const hasTarget =
                targetCharsForBody(body, get().pageAllocation.items) != null;

              const willAct =
                body.status !== 'ready' || isTruncated(body.finishReason);
              if (willAct) followBody(i);

              if (body.status !== 'ready') {
                await get().generateCurrentBody(i);
                body = get().outline.step3.bodies[i];
                if (body.status === 'error') return;
              }

              // 분량 한도로 끊긴 경우 이어쓸지 인앱 모달로 확인
              // (이어쓴 결과가 또 끊기면 반복). window.confirm은 비동기 컨텍스트에서
              // 브라우저가 무시(취소 처리)할 수 있어 store 상태 기반 모달로 처리한다.
              while (!hasTarget && isTruncated(body.finishReason)) {
                if (stopped()) return;
                const targetTitle = body.ref.midTitle;
                followBody(i);
                const decision = await new Promise<boolean>((resolve) => {
                  continueResolver = resolve;
                  set({ pendingContinue: { bodyIndex: i, midTitle: targetTitle } });
                });
                continueResolver = null;
                set({ pendingContinue: null });
                if (!decision) return; // 사용자가 멈춤 선택 → finally가 정리
                await get().continueCurrentBody(i);
                body = get().outline.step3.bodies[i];
                if (!body || body.status === 'error') return;
              }
            }
            set((state) => ({
              outline: {
                ...state.outline,
                step3: { ...state.outline.step3, status: 'all-done' },
              },
            }));
          }
        } finally {
          set({ autoRunActive: false, autoRunStop: false });
        }
      },

      stopAutoRun: () => {
        set({ autoRunStop: true });
        // 이어쓰기 확인 모달이 떠 있으면 '멈춤'으로 응답해 즉시 종료시킨다.
        if (continueResolver) {
          const r = continueResolver;
          continueResolver = null;
          set({ pendingContinue: null });
          r(false);
        }
      },

      resolveContinue: (decision) => {
        if (!continueResolver) return;
        const r = continueResolver;
        continueResolver = null;
        set({ pendingContinue: null });
        r(decision);
      },

      resetOutline: () =>
        set({
          outline: initialOutline,
          pageAllocation: { ...initialPageAllocation },
        }),

      resetAll: () =>
        set({
          files: [],
          outline: initialOutline,
          coverMeta: buildInitialCoverMeta(),
          pageLimit: null,
          pageAllocation: { ...initialPageAllocation },
        }),
    }),
    {
      name: 'proposal_writer.outline.v1',
      storage: createJSONStorage(() => localStorage),
      // files는 parsed 상태만 저장 (textContent 포함, 보통 50KB 정도 × N).
      // outline + files 둘 다 영구 저장 → 새로고침/슬립 후에도 그대로 복원.
      partialize: (state) => ({
        outline: state.outline,
        files: state.files.filter((f) => f.status === 'parsed'),
        coverMeta: state.coverMeta,
        pageLimit: state.pageLimit,
        pageAllocation: state.pageAllocation,
      }),
      // 스토어 모양 진화 시 누락 필드를 기본값으로 채워 throw 방지.
      version: 5,
      migrate: (persistedState) => {
        const s = persistedState as {
          outline?: Partial<OutlineState>;
          files?: WorkspaceFile[];
          coverMeta?: Partial<CoverMeta>;
          pageLimit?: number | null;
          pageAllocation?: PageAllocationState;
        } | null;
        if (!s)
          return {
            outline: initialOutline,
            files: [],
            coverMeta: buildInitialCoverMeta(),
            pageLimit: null,
            pageAllocation: { ...initialPageAllocation },
          };
        const outline: OutlineState = s.outline
          ? {
              currentStep: s.outline.currentStep ?? 1,
              step1: s.outline.step1 ?? { ...initialStep },
              step2: s.outline.step2 ?? { ...initialStep2 },
              step3: s.outline.step3 ?? { ...initialStep3 },
            }
          : initialOutline;
        const files = Array.isArray(s.files)
          ? s.files.filter((f) => f.status === 'parsed')
          : [];
        const coverMeta: CoverMeta = {
          ...buildInitialCoverMeta(),
          ...(s.coverMeta ?? {}),
        };
        return {
          outline,
          files,
          coverMeta,
          pageLimit: s.pageLimit ?? null,
          pageAllocation: s.pageAllocation ?? { ...initialPageAllocation },
        };
      },
    },
  ),
);
