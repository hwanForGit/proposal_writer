import type { FileCategory } from '@/features/workspace/types';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE = '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (cause) {
    throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다', {
      cause: String(cause),
    });
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body: unknown = isJson ? await res.json() : null;

  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'UNKNOWN_ERROR',
      err?.message ?? res.statusText,
      err?.details,
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body == null ? undefined : JSON.stringify(body),
    }),
};

export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
  uptime: number;
}

export const fetchHealth = () => api.get<HealthResponse>('/api/health');

export interface ServerParsedFile {
  id: string;
  name: string;
  category: FileCategory;
  mimeType: string;
  size: number;
  textContent: string;
  extractedAt: string;
  warnings: string[];
}

export interface ServerFileError {
  fileName: string;
  code: string;
  message: string;
}

export interface ParseFilesResponse {
  files: ServerParsedFile[];
  errors: ServerFileError[];
}

export interface OutlineGenerateInputFile {
  id: string;
  name: string;
  category: FileCategory;
  textContent: string;
}

export interface OutlineUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface OutlineStepResponse {
  markdown: string;
  modelId: string;
  generatedAt: string;
  finishReason: string | null;
  usage: OutlineUsage | null;
  elapsedMs: number;
  inputFileIds: string[];
}

export async function generateOutlineStep1(input: {
  announcementFiles: OutlineGenerateInputFile[];
  companyFiles: OutlineGenerateInputFile[];
}): Promise<OutlineStepResponse> {
  return api.post<OutlineStepResponse>('/api/outline/step1', input);
}

export interface SectionItem {
  index: number;
  title: string;
}

export interface Step2SectionsResponse {
  sections: SectionItem[];
  markdown: string;
  modelId: string;
  generatedAt: string;
  usage: OutlineUsage | null;
  elapsedMs: number;
}

export async function fetchStep2Sections(input: {
  announcementFiles: OutlineGenerateInputFile[];
  companyFiles: OutlineGenerateInputFile[];
  step1Markdown: string;
}): Promise<Step2SectionsResponse> {
  return api.post<Step2SectionsResponse>('/api/outline/step2/sections', input);
}

export interface Step2SectionResponse {
  markdown: string;
  currentSection: string;
  modelId: string;
  generatedAt: string;
  finishReason: string | null;
  usage: OutlineUsage | null;
  elapsedMs: number;
}

export async function generateStep2Section(input: {
  announcementFiles: OutlineGenerateInputFile[];
  companyFiles: OutlineGenerateInputFile[];
  step1Markdown: string;
  allSectionTitles: string[];
  currentSection: string;
}): Promise<Step2SectionResponse> {
  return api.post<Step2SectionResponse>('/api/outline/step2/section', input);
}

// 레거시: 전체를 한 번에 스트림. 큰 입력에서 502 가능. split 흐름 정착 후 제거 예정.
export type OutlineStreamEvent =
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      modelId: string;
      generatedAt: string;
      finishReason: string | null;
      usage: OutlineUsage | null;
      elapsedMs: number;
      inputFileIds: string[];
      chunkCount: number;
      totalChars: number;
    }
  | {
      type: 'error';
      code: string;
      message: string;
      partialChars?: number;
    };

export async function* streamOutline(input: {
  announcementFiles: OutlineGenerateInputFile[];
  companyFiles: OutlineGenerateInputFile[];
}): AsyncGenerator<OutlineStreamEvent, void, unknown> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/outline/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (cause) {
    throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다', {
      cause: String(cause),
    });
  }

  if (!res.ok) {
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const body: unknown = isJson ? await res.json().catch(() => null) : null;
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'UNKNOWN_ERROR',
      err?.message ?? res.statusText,
      err?.details,
    );
  }

  if (!res.body) {
    throw new ApiError(0, 'NO_RESPONSE_BODY', '응답 본문이 없습니다');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (!raw.startsWith('data: ')) continue;
      const json = raw.slice(6);
      try {
        const parsed = JSON.parse(json) as OutlineStreamEvent;
        yield parsed;
      } catch {
        // malformed event 무시
      }
    }
  }
}

export async function parseFiles(
  category: FileCategory,
  files: File[],
): Promise<ParseFilesResponse> {
  const form = new FormData();
  form.append('category', category);
  for (const f of files) form.append('files', f, f.name);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/files/parse`, {
      method: 'POST',
      body: form,
    });
  } catch (cause) {
    throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다', {
      cause: String(cause),
    });
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body: unknown = isJson ? await res.json() : null;

  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'UNKNOWN_ERROR',
      err?.message ?? res.statusText,
      err?.details,
    );
  }

  return body as ParseFilesResponse;
}
