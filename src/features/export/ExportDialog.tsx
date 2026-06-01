import { useState } from 'react';
import { ApiError, exportMarkdownAsDocx, exportMarkdownAsPdf } from '@/lib/api';
import { useWorkspaceStore } from '@/features/workspace/store';
import { buildCombinedMarkdown } from './buildCombinedMarkdown';
import { VALIDATION_SAMPLE_MARKDOWN } from './validationSample';
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
  const [error, setError] = useState<{ code: string; message: string } | null>(
    null,
  );
  const [success, setSuccess] = useState<null | {
    format: 'markdown' | 'docx' | 'pdf';
    filename: string;
  }>(null);

  if (!open) return null;

  const update = <K extends keyof CoverMeta>(k: K, v: CoverMeta[K]) =>
    setCoverMeta({ [k]: v } as Partial<CoverMeta>);

  const baseFilename = () =>
    `${coverMeta.projectName.trim() || 'proposal'}-${stamp()}`;

  const onMarkdown = () => {
    setError(null);
    setSuccess(null);
    setWorking('markdown');
    try {
      const md = buildCombinedMarkdown(outline, coverMeta);
      const filename = `${baseFilename()}.md`;
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      downloadBlob(blob, filename);
      setSuccess({ format: 'markdown', filename });
    } finally {
      setWorking(null);
    }
  };

  const onDocx = async () => {
    setError(null);
    setSuccess(null);
    setWorking('docx');
    try {
      const md = buildCombinedMarkdown(outline, coverMeta);
      const filename = `${baseFilename()}.docx`;
      const blob = await exportMarkdownAsDocx(md, filename);
      downloadBlob(blob, filename);
      setSuccess({ format: 'docx', filename });
    } catch (err) {
      setError({
        code: err instanceof ApiError ? err.code : 'UNEXPECTED',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setWorking(null);
    }
  };

  const onPdf = async () => {
    setError(null);
    setSuccess(null);
    setWorking('pdf');
    try {
      const md = buildCombinedMarkdown(outline, coverMeta);
      const filename = `${baseFilename()}.pdf`;
      const blob = await exportMarkdownAsPdf(md, filename);
      downloadBlob(blob, filename);
      setSuccess({ format: 'pdf', filename });
    } catch (err) {
      setError({
        code: err instanceof ApiError ? err.code : 'UNEXPECTED',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setWorking(null);
    }
  };

  const onValidation = async (fmt: 'docx' | 'pdf') => {
    setError(null);
    setWorking(fmt);
    try {
      const filename = `validation-sample-${stamp()}.${fmt}`;
      const blob =
        fmt === 'docx'
          ? await exportMarkdownAsDocx(VALIDATION_SAMPLE_MARKDOWN, filename)
          : await exportMarkdownAsPdf(VALIDATION_SAMPLE_MARKDOWN, filename);
      downloadBlob(blob, filename);
    } catch (err) {
      setError({
        code: err instanceof ApiError ? err.code : 'UNEXPECTED',
        message: err instanceof Error ? err.message : String(err),
      });
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

        <details className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <summary className="cursor-pointer font-medium text-gray-700">
            🔧 서식 매핑 검증 (개발자 도구)
          </summary>
          <p className="mt-2 leading-relaxed">
            §5.5 매핑 표의 13개 마크다운 요소(헤딩·강조·표·코드·이모지 등)를
            모두 포함한 샘플 문서를 DOCX/PDF로 받아 화면과 비교합니다. 깨지는
            요소가 있으면 후속 보정 대상.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onValidation('docx')}
              disabled={working !== null}
              className="rounded border border-gray-300 px-2.5 py-1 text-[11px] text-gray-700 hover:bg-white disabled:opacity-50"
            >
              샘플 DOCX
            </button>
            <button
              type="button"
              onClick={() => onValidation('pdf')}
              disabled={working !== null}
              className="rounded border border-gray-300 px-2.5 py-1 text-[11px] text-gray-700 hover:bg-white disabled:opacity-50"
            >
              샘플 PDF
            </button>
          </div>
        </details>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <div className="font-medium">{error.code}</div>
            <div className="mt-0.5 whitespace-pre-wrap">{error.message}</div>
          </div>
        )}

        {success && (
          <div className="rounded border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-900">
            <div className="font-medium">
              ✓ 다운로드 완료 —{' '}
              <span className="font-mono">{success.filename}</span>
            </div>
            {success.format === 'docx' && (
              <div className="mt-1 leading-relaxed text-green-800">
                국비 사업 제출용 <strong>HWPX</strong>가 필요하면 한컴 한글에서
                이 DOCX를 열어 <strong>다른 이름으로 저장 → 한글 문서
                (*.hwpx)</strong>로 저장하세요. 표·서식이 미세하게 어긋날 수
                있어 한 번 훑어보는 걸 권장합니다.
              </div>
            )}
            {success.format === 'pdf' && (
              <div className="mt-1 leading-relaxed text-green-800">
                미리보기·공유용으로 사용하세요. 재편집이 필요하면 DOCX 다운로드
                후 한컴/Word에서 여는 것을 권장합니다.
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-3">
          <button
            type="button"
            onClick={() => {
              setSuccess(null);
              setError(null);
              onClose();
            }}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            {success ? '확인 (닫기)' : '닫기'}
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
            onClick={onDocx}
            disabled={working !== null}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {working === 'docx' ? 'DOCX 생성 중…' : 'DOCX 다운로드'}
          </button>
          <button
            type="button"
            onClick={onPdf}
            disabled={working !== null}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {working === 'pdf' ? 'PDF 생성 중…' : 'PDF 다운로드'}
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
