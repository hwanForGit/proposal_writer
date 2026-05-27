export type FileCategory = 'announcement' | 'company';

export type WorkspaceFileStatus = 'uploading' | 'parsed' | 'error';

export interface WorkspaceFile {
  id: string;
  name: string;
  size: number;
  category: FileCategory;
  status: WorkspaceFileStatus;
  mimeType?: string;
  textContent?: string;
  extractedAt?: string;
  warnings?: string[];
  errorCode?: string;
  errorMessage?: string;
}

export const CATEGORY_LABELS: Record<FileCategory, string> = {
  announcement: '공고·양식 파일',
  company: '회사 정보 파일',
};

export const CATEGORY_DESCRIPTIONS: Record<FileCategory, string> = {
  announcement: '사업 공고, 제안서 양식 등 사업과 관련된 모든 문서',
  company: '기술, 역량, 장점, 매출 등 회사 정보가 담긴 문서',
};
