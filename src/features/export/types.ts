export interface CoverMeta {
  projectName: string;
  organization: string;
  author: string;
  date: string; // YYYY-MM-DD
  contact: string;
  includeStep1: boolean;
}

const todayIso = (): string => {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const initialCoverMeta = (): CoverMeta => ({
  projectName: '',
  organization: '',
  author: '',
  date: todayIso(),
  contact: '',
  includeStep1: false,
});

export type ExportFormat = 'markdown' | 'docx' | 'pdf';
