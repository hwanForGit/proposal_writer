import { useEffect, useMemo, useRef, useState } from 'react';
import {
  emptyMidNode,
  emptySubNode,
  hasValidStructure,
  parseSection,
  serializeSection,
  type MidNode,
  type SectionTree,
  type SubNode,
} from './sectionTree';

interface Props {
  markdown: string;
  onSave: (next: string) => void;
}

export default function SectionTreeView({ markdown, onSave }: Props) {
  // 외부 markdown이 변하면(예: 재생성) 트리 재파싱.
  const parsed = useMemo(() => parseSection(markdown), [markdown]);
  const [tree, setTree] = useState<SectionTree>(parsed);

  // 외부 markdown이 갱신되면 트리 동기화
  useEffect(() => {
    setTree(parsed);
  }, [parsed]);

  const valid = hasValidStructure(tree);

  // 트리 변경 시 즉시 markdown 직렬화하여 store에 반영
  const apply = (next: SectionTree) => {
    setTree(next);
    onSave(serializeSection(next));
  };

  const updateMid = (id: string, patch: Partial<MidNode>) => {
    apply({
      ...tree,
      midNodes: tree.midNodes.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  };
  const updateSub = (midId: string, subId: string, patch: Partial<SubNode>) => {
    apply({
      ...tree,
      midNodes: tree.midNodes.map((m) =>
        m.id !== midId
          ? m
          : {
              ...m,
              subNodes: m.subNodes.map((s) =>
                s.id === subId ? { ...s, ...patch } : s,
              ),
            },
      ),
    });
  };
  const removeMid = (id: string) => {
    apply({ ...tree, midNodes: tree.midNodes.filter((m) => m.id !== id) });
  };
  const removeSub = (midId: string, subId: string) => {
    apply({
      ...tree,
      midNodes: tree.midNodes.map((m) =>
        m.id !== midId
          ? m
          : { ...m, subNodes: m.subNodes.filter((s) => s.id !== subId) },
      ),
    });
  };
  const addMid = () => {
    apply({ ...tree, midNodes: [...tree.midNodes, emptyMidNode()] });
  };
  const addSub = (midId: string) => {
    apply({
      ...tree,
      midNodes: tree.midNodes.map((m) =>
        m.id !== midId ? m : { ...m, subNodes: [...m.subNodes, emptySubNode()] },
      ),
    });
  };

  if (!valid) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        구조 파싱 실패 — 마크다운 원문 그대로 표시합니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 섹션 제목 + 기획 의도 (가이드 박스) */}
      <header className="space-y-2">
        <div className="text-lg font-bold text-gray-900">
          [{tree.sectionTitle}]
        </div>
        {tree.intentGuidance && (
          <GuidanceBox label="이 섹션의 기획 의도">
            {tree.intentGuidance}
          </GuidanceBox>
        )}
      </header>

      {/* 중분류 카드 리스트 */}
      <div className="space-y-3">
        {tree.midNodes.map((mid) => (
          <MidNodeCard
            key={mid.id}
            mid={mid}
            onUpdateTitle={(t) => updateMid(mid.id, { title: t })}
            onRemove={() => removeMid(mid.id)}
            onAddSub={() => addSub(mid.id)}
            onUpdateSubTitle={(subId, t) =>
              updateSub(mid.id, subId, { title: t })
            }
            onRemoveSub={(subId) => removeSub(mid.id, subId)}
          />
        ))}
      </div>

      {/* 중분류 추가 버튼 */}
      <button
        type="button"
        onClick={addMid}
        className="w-full rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/40 py-3 text-sm font-medium text-blue-700 hover:border-blue-400 hover:bg-blue-50"
      >
        + 중분류 추가
      </button>
    </div>
  );
}

// ─── 중분류 카드 ────────────────────────────────────────────────

interface MidCardProps {
  mid: MidNode;
  onUpdateTitle: (t: string) => void;
  onRemove: () => void;
  onAddSub: () => void;
  onUpdateSubTitle: (subId: string, t: string) => void;
  onRemoveSub: (subId: string) => void;
}

function MidNodeCard({
  mid,
  onUpdateTitle,
  onRemove,
  onAddSub,
  onUpdateSubTitle,
  onRemoveSub,
}: MidCardProps) {
  return (
    <div className="rounded-lg border-2 border-blue-300 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <InlineTitle
          value={mid.title}
          onChange={onUpdateTitle}
          className="flex-1 text-base font-bold text-blue-900"
        />
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onAddSub}
            className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
            title="소분류 추가"
          >
            + 소분류
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-600 hover:bg-red-50 hover:text-red-600"
            title="중분류 삭제"
          >
            ×
          </button>
        </div>
      </div>
      {mid.guidance && (
        <GuidanceBox className="mt-2" label="포함될 자사 소스 및 벤치마킹 적용안">
          {mid.guidance}
        </GuidanceBox>
      )}
      {mid.subNodes.length > 0 && (
        <div className="mt-3 space-y-2 border-l-2 border-blue-100 pl-3">
          {mid.subNodes.map((sub) => (
            <SubNodeCard
              key={sub.id}
              sub={sub}
              onUpdateTitle={(t) => onUpdateSubTitle(sub.id, t)}
              onRemove={() => onRemoveSub(sub.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 소분류 카드 ────────────────────────────────────────────────

interface SubCardProps {
  sub: SubNode;
  onUpdateTitle: (t: string) => void;
  onRemove: () => void;
}

function SubNodeCard({ sub, onUpdateTitle, onRemove }: SubCardProps) {
  return (
    <div className="rounded border border-blue-200 bg-blue-50/40 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <InlineTitle
          value={sub.title}
          onChange={onUpdateTitle}
          className="flex-1 text-sm font-semibold text-blue-800"
        />
        <button
          type="button"
          onClick={onRemove}
          className="rounded border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-red-50 hover:text-red-600"
          title="소분류 삭제"
        >
          ×
        </button>
      </div>
      {sub.guidance && (
        <GuidanceBox
          className="mt-1.5"
          compact
          label="포함될 자사 소스 및 벤치마킹 적용안"
        >
          {sub.guidance}
        </GuidanceBox>
      )}
    </div>
  );
}

// ─── 인라인 제목 편집 ──────────────────────────────────────────

interface InlineTitleProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

function InlineTitle({ value, onChange, className }: InlineTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onChange(next);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`text-left hover:underline ${className ?? ''}`}
        title="클릭하여 편집"
      >
        {value}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') cancel();
      }}
      className={`w-full rounded border border-blue-400 bg-white px-2 py-1 ${className ?? ''}`}
    />
  );
}

// ─── 가이드 박스 (read-only 참고 정보) ────────────────────────

interface GuidanceProps {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
  className?: string;
}

function GuidanceBox({ label, children, compact, className }: GuidanceProps) {
  return (
    <div
      className={`flex gap-2 rounded-md border-l-[3px] border-amber-300 bg-amber-50/60 ${
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
      } ${className ?? ''}`}
    >
      <span
        className={`shrink-0 select-none ${compact ? 'text-[11px]' : 'text-xs'}`}
        aria-hidden
      >
        💡
      </span>
      <div className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          작성 가이드 · {label}
        </span>
        <p
          className={`mt-0.5 italic leading-relaxed text-gray-700 ${
            compact ? 'text-[12px]' : 'text-[13px]'
          }`}
        >
          {children}
        </p>
      </div>
    </div>
  );
}
