import { create } from 'zustand';
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

interface WorkspaceState {
  files: WorkspaceFile[];
  addUploadingFiles: (items: UploadingInit[]) => void;
  markParsed: (id: string, payload: ParsedPayload) => void;
  markError: (id: string, code: string, message: string) => void;
  removeFile: (id: string) => void;
  removeByName: (category: FileCategory, names: string[]) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  files: [],

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
}));
