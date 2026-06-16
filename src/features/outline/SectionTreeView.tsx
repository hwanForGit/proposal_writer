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
  /** LLM 응답에서 섹션 헤더가 비어/누락된 경우의 fallback 제목 (Step 2 sections[i].title). */
  fallbackTitle?: string;
  onSave: (next: string) => void;
}

export default function SectionTreeView({ markdown, fallbackTitle, onSave }: Props) {
  // 외부 markdown이 변하면(예: 재생성) 트리 재파싱.
  const parsed = useMemo(
    () => parseSection(markdown, fallbackTitle),
    [markdown, fallbackTitle],
  );
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
  // 인접 노드와 자리 교환(↑/↓). 경계를 벗어나면 그대로 둔다.
  const moveMid = (id: string, dir: -1 | 1) => {
    const i = tree.midNodes.findIndex((m) => m.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= tree.midNodes.length) return;
    const midNodes = tree.midNodes.slice();
    [midNodes[i], midNodes[j]] = [midNodes[j]!, midNodes[i]!];
    apply({ ...tree, midNodes });
  };
  const moveSub = (midId: string, subId: string, dir: -1 | 1) => {
    apply({
      ...tree,
      midNodes: tree.midNodes.map((m) => {
        if (m.id !== midId) return m;
        const i = m.subNodes.findIndex((s) => s.id === subId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= m.subNodes.length) return m;
        const subNodes = m.subNodes.slice();
        [subNodes[i], subNodes[j]] = [subNodes[j]!, subNodes[i]!];
        return { ...m, subNodes };
      }),
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
          <GuidanceBox label="이 섹션의 기획 의도" text={tree.intentGuidance} />
        )}
      </header>

      {/* 중분류 카드 리스트 */}
      <div className="space-y-3">
        {tree.midNodes.map((mid, idx) => (
          <MidNodeCard
            key={mid.id}
            mid={mid}
            canMoveUp={idx > 0}
            canMoveDown={idx < tree.midNodes.length - 1}
            onMoveUp={() => moveMid(mid.id, -1)}
            onMoveDown={() => moveMid(mid.id, 1)}
            onUpdateTitle={(t) => updateMid(mid.id, { title: t })}
            onRemove={() => removeMid(mid.id)}
            onAddSub={() => addSub(mid.id)}
            onUpdateSubTitle={(subId, t) =>
              updateSub(mid.id, subId, { title: t })
            }
            onRemoveSub={(subId) => removeSub(mid.id, subId)}
            onMoveSub={(subId, dir) => moveSub(mid.id, subId, dir)}
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
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdateTitle: (t: string) => void;
  onRemove: () => void;
  onAddSub: () => void;
  onUpdateSubTitle: (subId: string, t: string) => void;
  onRemoveSub: (subId: string) => void;
  onMoveSub: (subId: string, dir: -1 | 1) => void;
}

function MidNodeCard({
  mid,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onUpdateTitle,
  onRemove,
  onAddSub,
  onUpdateSubTitle,
  onRemoveSub,
  onMoveSub,
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
          <ReorderButtons
            canUp={canMoveUp}
            canDown={canMoveDown}
            onUp={onMoveUp}
            onDown={onMoveDown}
            label="중분류"
          />
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
        <GuidanceBox
          className="mt-2"
          label="포함될 자사 소스 및 벤치마킹 적용안"
          text={mid.guidance}
        />
      )}
      {mid.subNodes.length > 0 && (
        <div className="mt-3 space-y-2 border-l-2 border-blue-100 pl-3">
          {mid.subNodes.map((sub, sIdx) => (
            <SubNodeCard
              key={sub.id}
              sub={sub}
              canMoveUp={sIdx > 0}
              canMoveDown={sIdx < mid.subNodes.length - 1}
              onMoveUp={() => onMoveSub(sub.id, -1)}
              onMoveDown={() => onMoveSub(sub.id, 1)}
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
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdateTitle: (t: string) => void;
  onRemove: () => void;
}

function SubNodeCard({
  sub,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onUpdateTitle,
  onRemove,
}: SubCardProps) {
  return (
    <div className="rounded border border-blue-200 bg-blue-50/40 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <InlineTitle
          value={sub.title}
          onChange={onUpdateTitle}
          className="flex-1 text-sm font-semibold text-blue-800"
        />
        <div className="flex shrink-0 gap-1">
          <ReorderButtons
            canUp={canMoveUp}
            canDown={canMoveDown}
            onUp={onMoveUp}
            onDown={onMoveDown}
            label="소분류"
            compact
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
      </div>
      {sub.guidance && (
        <GuidanceBox
          className="mt-1.5"
          compact
          label="포함될 자사 소스 및 벤치마킹 적용안"
          text={sub.guidance}
        />
      )}
    </div>
  );
}

// ─── 순서 변경 버튼 (↑/↓) ──────────────────────────────────────

function ReorderButtons({
  canUp,
  canDown,
  onUp,
  onDown,
  label,
  compact,
}: {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  label: string;
  compact?: boolean;
}) {
  const cls = `rounded border border-gray-300 text-gray-600 enabled:hover:bg-blue-50 enabled:hover:text-blue-700 disabled:opacity-30 ${
    compact ? 'px-1 py-0.5 text-[10px]' : 'px-1.5 py-1 text-[11px]'
  }`;
  return (
    <div className="flex">
      <button
        type="button"
        onClick={onUp}
        disabled={!canUp}
        className={`${cls} rounded-r-none`}
        title={`${label} 위로 이동`}
        aria-label={`${label} 위로 이동`}
      >
        ↑
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={!canDown}
        className={`${cls} -ml-px rounded-l-none`}
        title={`${label} 아래로 이동`}
        aria-label={`${label} 아래로 이동`}
      >
        ↓
      </button>
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
  text: string;
  compact?: boolean;
  className?: string;
}

// "1) ... 2) ..." / "1. ... 2. ..." 형태(개조식)면 항목별로 분리. 아니면 null.
// 파서가 줄바꿈을 공백으로 합치므로, 번호 마커 직전에서 분리해 복원한다.
//
// ★ 소수·재무 수치 보호: 번호 마커는 (1) 문장 시작 또는 공백 뒤의 1~2자리 숫자 +
//   ".)"+ 공백이고, (2) 1,2,3… 으로 시작하는 '연속 수열'일 때만 리스트로 인정한다.
//   "2.2조", "3.0억" 같은 소수는 마커 뒤에 공백이 없어 마커로 잡히지 않고,
//   숫자가 흩어진 텍스트도 연속 수열이 아니면 그대로 한 문단으로 둔다.
function splitItemized(text: string): string[] | null {
  const s = text.trim();
  // 마커 후보 수집: 시작/공백 뒤의 "N. " 또는 "N) " (N=1~2자리). 마커 뒤 공백 필수.
  const markerRe = /(^|\s)(\d{1,2})[.)]\s+/g;
  const markers: { at: number; n: number }[] = [];
  for (let m = markerRe.exec(s); m; m = markerRe.exec(s)) {
    markers.push({ at: m.index + m[1]!.length, n: Number(m[2]) });
  }
  // 1부터 시작하는 연속 수열(1,2,3,…)이 아니면 리스트가 아님 → 원문 그대로.
  if (markers.length < 2) return null;
  if (markers.some((mk, i) => mk.n !== i + 1)) return null;

  const parts: string[] = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i]!.at;
    const end = i + 1 < markers.length ? markers[i + 1]!.at : s.length;
    // 검증된 마커만 정확히 제거(소수점 정수부는 건드리지 않음).
    const seg = s.slice(start, end).replace(/^\d{1,2}[.)]\s+/, '').trim();
    if (seg) parts.push(seg);
  }
  // 분리 후 빈 조각이 생겼으면(오분할 신호) 원문 그대로 둔다.
  return parts.length === markers.length ? parts : null;
}

function GuidanceBox({ label, text, compact, className }: GuidanceProps) {
  const items = splitItemized(text);
  const textSize = compact ? 'text-[12px]' : 'text-[13px]';
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
        {items ? (
          <ol
            className={`mt-0.5 list-decimal space-y-0.5 pl-4 leading-relaxed text-gray-700 ${textSize}`}
          >
            {items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ol>
        ) : (
          <p className={`mt-0.5 italic leading-relaxed text-gray-700 ${textSize}`}>
            {text}
          </p>
        )}
      </div>
    </div>
  );
}
