import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  markdown: string;
  editable?: boolean;
  onSave?: (next: string) => void;
}

export default function MarkdownView({ markdown, editable = false, onSave }: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [draft, setDraft] = useState(markdown);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (mode === 'view') setDraft(markdown);
  }, [markdown, mode]);

  useEffect(() => {
    if (mode === 'edit') textareaRef.current?.focus();
  }, [mode]);

  const startEdit = () => {
    setDraft(markdown);
    setMode('edit');
  };
  const save = () => {
    if (onSave && draft !== markdown) onSave(draft);
    setMode('view');
  };
  const cancel = () => {
    setDraft(markdown);
    setMode('view');
  };

  const dirty = mode === 'edit' && draft !== markdown;

  if (mode === 'view') {
    return (
      <div className="space-y-2">
        {editable && onSave && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={startEdit}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              편집
            </button>
          </div>
        )}
        <div className="markdown-body rounded border border-gray-200 bg-white p-4 text-sm text-gray-800">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          편집 중 {dirty && <span className="ml-1 text-amber-600">●  변경됨</span>}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={cancel}
            className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty}
            className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="min-h-[24rem] w-full resize-y rounded border border-gray-300 bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-900 focus:border-blue-500 focus:outline-none"
        />
        <div className="markdown-body min-h-[24rem] overflow-auto rounded border border-gray-200 bg-white p-3 text-sm text-gray-800">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
