import type { ReactNode } from 'react';
import type { WorkspaceFile } from '@/features/workspace/types';
import { formatBytes } from './validation';

interface Props {
  files: WorkspaceFile[];
  onRemove: (id: string) => void;
}

export default function FileList({ files, onRemove }: Props) {
  if (files.length === 0) {
    return (
      <p className="text-xs text-gray-400">아직 업로드된 파일이 없습니다.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {files.map((f) => (
        <FileItem key={f.id} file={f} onRemove={onRemove} />
      ))}
    </ul>
  );
}

interface ItemProps {
  file: WorkspaceFile;
  onRemove: (id: string) => void;
}

function FileItem({ file, onRemove }: ItemProps) {
  const ui = describeStatus(file);
  return (
    <li
      className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${ui.containerClass}`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-gray-900">{file.name}</div>
        <div className="text-xs text-gray-500">
          {formatBytes(file.size)}
          {ui.detail && (
            <>
              <span className="mx-1.5 text-gray-300">·</span>
              {ui.detail}
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(file.id)}
        className="ml-3 shrink-0 text-xs text-gray-500 hover:text-red-600"
        aria-label={`${file.name} 삭제`}
      >
        삭제
      </button>
    </li>
  );
}

interface StatusUi {
  containerClass: string;
  detail: ReactNode;
}

function describeStatus(file: WorkspaceFile): StatusUi {
  if (file.status === 'uploading') {
    return {
      containerClass: 'border-gray-200 bg-gray-50',
      detail: <span className="text-gray-500">추출 중…</span>,
    };
  }
  if (file.status === 'error') {
    return {
      containerClass: 'border-red-200 bg-red-50',
      detail: (
        <span className="text-red-700">
          {file.errorCode}: {file.errorMessage}
        </span>
      ),
    };
  }
  const len = file.textContent?.length ?? 0;
  const warnCount = file.warnings?.length ?? 0;
  return {
    containerClass: 'border-gray-200 bg-white',
    detail: (
      <span className="text-gray-500">
        텍스트 {len.toLocaleString()}자 추출됨
        {warnCount > 0 && (
          <span className="ml-2 text-amber-600">경고 {warnCount}건</span>
        )}
      </span>
    ),
  };
}
