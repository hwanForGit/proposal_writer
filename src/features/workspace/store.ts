import { create } from 'zustand';
import {
  ApiError,
  fetchStep2Sections,
  generateOutlineStep1,
  generateStep2Section,
  type OutlineUsage,
} from '@/lib/api';
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

export interface OutlineState {
  currentStep: 1 | 2 | 3;
  step1: OutlineStepState;
  step2: Step2State;
}

const initialOutline: OutlineState = {
  currentStep: 1,
  step1: { ...initialStep },
  step2: { ...initialStep2 },
};

interface WorkspaceState {
  files: WorkspaceFile[];
  outline: OutlineState;

  addUploadingFiles: (items: UploadingInit[]) => void;
  markParsed: (id: string, payload: ParsedPayload) => void;
  markError: (id: string, code: string, message: string) => void;
  removeFile: (id: string) => void;
  removeByName: (category: FileCategory, names: string[]) => void;

  generateStep1: () => Promise<void>;
  proceedToStep2: () => Promise<void>;
  retryStep2Sections: () => Promise<void>;
  generateCurrentSection: () => Promise<void>;
  retryCurrentSection: () => Promise<void>;
  nextSection: () => Promise<void>;
  proceedToStep3: () => void;
  resetOutline: () => void;
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

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  files: [],
  outline: initialOutline,

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
        step1: { ...initialStep, status: 'generating' },
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
    set((state) => ({
      outline: {
        ...state.outline,
        currentStep: 2,
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

  generateCurrentSection: async () => {
    const { files, outline } = get();
    const { step2, step1 } = outline;
    const i = step2.currentSectionIndex;
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
              ? { ...s, status: 'generating', markdown: null, error: null }
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

  proceedToStep3: () =>
    set((state) => ({
      outline: { ...state.outline, currentStep: 3 },
    })),

  resetOutline: () => set({ outline: initialOutline }),
}));
