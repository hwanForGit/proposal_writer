import { useState } from 'react';
import { useWorkspaceStore } from '@/features/workspace/store';
import { buildCombinedMarkdown } from './buildCombinedMarkdown';
import type { CoverMeta } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const pad2 = (n: number) => n.toString().padStart(2, '0');
const stamp = (): string => {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export default function ExportDialog({ open, onClose }: Props) {
  const outline = useWorkspaceStore((s) => s.outline);
  const coverMeta = useWorkspaceStore((s) => s.coverMeta);
  const setCoverMeta = useWorkspaceStore((s) => s.setCoverMeta);
  const [working, setWorking] = useState<null | 'markdown' | 'docx' | 'pdf'>(
    null,
  );

  if (!open) return null;

  const update = <K extends keyof CoverMeta>(k: K, v: CoverMeta[K]) =>
    setCoverMeta({ [k]: v } as Partial<CoverMeta>);

  const onMarkdown = () => {
    setWorking('markdown');
    try {
      const md = buildCombinedMarkdown(outline, coverMeta);
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const projectName = coverMeta.projectName.trim() || 'proposal';
      downloadBlob(blob, `${projectName}-${stamp()}.md`);
      onClose();
    } finally {
      setWorking(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg space-y-4 rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h3 className="text-base font-semibold text-gray-900">
            사업계획서 다운로드
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            표지 정보는 선택입니다. 빈 채로도 진행 가능 — 표지 없이 본문만
            출력됩니다.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="사업명">
            <input
              type="text"
              value={coverMeta.projectName}
              onChange={(e) => update('projectName', e.target.value)}
              placeholder="2026년 ..."
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
            />
          </Field>
          <Field label="신청기관">
            <input
              type="text"
              value={coverMeta.organization}
              onChange={(e) => update('organization', e.target.value)}
              placeholder="(주)..."
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
            />
          </Field>
          <Field label="작성자">
            <input
              type="text"
              value={coverMeta.author}
              onChange={(e) => update('author', e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
            />
          </Field>
          <Field label="작성일">
            <input
              type="date"
              value={coverMeta.date}
              onChange={(e) => update('date', e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
            />
          </Field>
          <Field label="연락처" className="sm:col-span-2">
            <input
              type="text"
              value={coverMeta.contact}
              onChange={(e) => update('contact', e.target.value)}
              placeholder="010-..."
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={coverMeta.includeStep1}
            onChange={(e) => update('includeStep1', e.target.checked)}
          />
          Step 1 (사전 분석) 결과도 포함하기
          <span className="text-gray-400">— 기본 OFF, 내부 참고용</span>
        </label>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onMarkdown}
            disabled={working !== null}
            className="rounded bg-gray-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {working === 'markdown' ? '생성 중…' : 'Markdown 다운로드'}
          </button>
          <button
            type="button"
            disabled
            title="M24에서 활성화"
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white opacity-50"
          >
            DOCX
          </button>
          <button
            type="button"
            disabled
            title="M25에서 활성화"
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white opacity-50"
          >
            PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-0.5 block text-[11px] font-medium text-gray-700">
        {label}
      </span>
      {children}
    </label>
  );
}
