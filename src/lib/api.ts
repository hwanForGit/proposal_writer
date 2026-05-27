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
