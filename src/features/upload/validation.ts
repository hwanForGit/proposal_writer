export const ACCEPTED_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.hwpx',
  '.xlsx',
  '.pptx',
  '.txt',
  '.md',
] as const;

export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const MAX_TOTAL_SIZE = 100 * 1024 * 1024;

export type RejectionReason =
  | 'UNSUPPORTED_EXTENSION'
  | 'FILE_TOO_LARGE'
  | 'TOTAL_TOO_LARGE';

export interface RejectedFile {
  fileName: string;
  reason: RejectionReason;
  message: string;
}

const getExtension = (name: string): string => {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.slice(idx).toLowerCase();
};

export const isExtensionAccepted = (name: string): boolean =>
  (ACCEPTED_EXTENSIONS as readonly string[]).includes(getExtension(name));

export interface ValidationResult {
  accepted: File[];
  rejected: RejectedFile[];
}

export const validateFiles = (
  newFiles: File[],
  existingTotalSize: number,
): ValidationResult => {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];
  let running = existingTotalSize;

  for (const f of newFiles) {
    if (!isExtensionAccepted(f.name)) {
      rejected.push({
        fileName: f.name,
        reason: 'UNSUPPORTED_EXTENSION',
        message: `지원하지 않는 형식입니다 (지원: ${ACCEPTED_EXTENSIONS.join(', ')})`,
      });
      continue;
    }
    if (f.size > MAX_FILE_SIZE) {
      rejected.push({
        fileName: f.name,
        reason: 'FILE_TOO_LARGE',
        message: `파일이 너무 큽니다 (최대 ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
      });
      continue;
    }
    if (running + f.size > MAX_TOTAL_SIZE) {
      rejected.push({
        fileName: f.name,
        reason: 'TOTAL_TOO_LARGE',
        message: `전체 업로드 합계가 한도(${MAX_TOTAL_SIZE / 1024 / 1024}MB)를 초과합니다`,
      });
      continue;
    }
    accepted.push(f);
    running += f.size;
  }

  return { accepted, rejected };
};

export const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};
