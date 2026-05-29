import { useWorkspaceStore } from '@/features/workspace/store';
import type { FileCategory } from '@/features/workspace/types';
import { ApiError, parseFiles } from '@/lib/api';

const normalizeName = (s: string): string => s.normalize('NFC');

export function useFileUpload() {
  const addUploadingFiles = useWorkspaceStore((s) => s.addUploadingFiles);
  const markParsed = useWorkspaceStore((s) => s.markParsed);
  const markError = useWorkspaceStore((s) => s.markError);

  return async (category: FileCategory, files: File[]): Promise<void> => {
    if (files.length === 0) return;

    const items = files.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      normalizedName: normalizeName(f.name),
      size: f.size,
      category,
    }));
    addUploadingFiles(
      items.map(({ id, name, size, category: c }) => ({
        id,
        name,
        size,
        category: c,
      })),
    );

    try {
      const res = await parseFiles(category, files);
      const parsedPool = res.files.map((f) => ({
        ...f,
        _key: normalizeName(f.name),
      }));
      const errorPool = res.errors.map((e) => ({
        ...e,
        _key: normalizeName(e.fileName),
      }));

      for (const item of items) {
        const pIdx = parsedPool.findIndex(
          (f) => f._key === item.normalizedName,
        );
        if (pIdx !== -1) {
          const parsed = parsedPool[pIdx]!;
          parsedPool.splice(pIdx, 1);
          markParsed(item.id, {
            mimeType: parsed.mimeType,
            textContent: parsed.textContent,
            extractedAt: parsed.extractedAt,
            warnings: parsed.warnings,
          });
          continue;
        }
        const eIdx = errorPool.findIndex(
          (e) => e._key === item.normalizedName,
        );
        if (eIdx !== -1) {
          const err = errorPool[eIdx]!;
          errorPool.splice(eIdx, 1);
          markError(item.id, err.code, err.message);
          continue;
        }
        const respFiles =
          res.files.map((f) => `"${f.name}"`).join(', ') || '없음';
        const respErrors =
          res.errors
            .map((e) => `"${e.fileName}" [${e.code}]`)
            .join(', ') || '없음';
        markError(
          item.id,
          'UNKNOWN',
          `서버 응답에 해당 파일 결과가 없습니다 (요청: "${item.name}", 응답 files: ${respFiles}, 응답 errors: ${respErrors})`,
        );
      }
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'UNEXPECTED';
      const message = err instanceof Error ? err.message : String(err);
      for (const item of items) {
        markError(item.id, code, message);
      }
    }
  };
}
