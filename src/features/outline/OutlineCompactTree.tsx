import { useState } from 'react';
import { parseSection, type MidNode, type SubNode } from './sectionTree';
import type { SectionState } from '@/features/workspace/store';

interface Props {
  sections: SectionState[];
  currentSectionIndex: number;
  onJumpSection?: (index: number) => void;
}

export default function OutlineCompactTree({
  sections,
  currentSectionIndex,
  onJumpSection,
}: Props) {
  const ready = sections.filter((s) => s.status === 'ready' && s.markdown);

  if (ready.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        아직 생성된 대분류가 없습니다.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-white">
      <div className="rounded-t-lg border-b border-blue-100 bg-blue-50/70 px-3 py-2 text-xs font-semibold text-blue-900">
        🌳 전체 구조 트리{' '}
        <span className="font-normal text-blue-700">
          ({ready.length}/{sections.length} 대분류) — 대분류 제목 클릭 시 이동
        </span>
      </div>
      <ul className="space-y-1.5 p-3 text-sm">
        {sections.map((section, idx) => {
          if (section.status !== 'ready' || !section.markdown) {
            return (
              <li key={section.index} className="text-gray-400">
                <span className="font-medium">
                  {section.index}. {section.title}
                </span>
                <span className="ml-2 text-[10px] text-gray-400">
                  (아직 생성 안 됨)
                </span>
              </li>
            );
          }
          const tree = parseSection(section.markdown, section.title);
          return (
            <SectionTreeRow
              key={section.index}
              displayIndex={section.index}
              title={section.title}
              midNodes={tree.midNodes}
              isCurrent={idx === currentSectionIndex}
              onJump={onJumpSection ? () => onJumpSection(idx) : undefined}
            />
          );
        })}
      </ul>
    </div>
  );
}

interface SectionRowProps {
  displayIndex: number;
  title: string;
  midNodes: MidNode[];
  isCurrent: boolean;
  onJump?: () => void;
}

function SectionTreeRow({
  displayIndex,
  title,
  midNodes,
  isCurrent,
  onJump,
}: SectionRowProps) {
  const [open, setOpen] = useState(true);
  const hasChildren = midNodes.length > 0;
  return (
    <li>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => hasChildren && setOpen(!open)}
          className={`size-4 shrink-0 text-[10px] text-gray-400 ${
            hasChildren ? 'hover:text-gray-700' : 'invisible'
          }`}
          aria-label={open ? '접기' : '펼치기'}
        >
          {open ? '▾' : '▸'}
        </button>
        {onJump ? (
          <button
            type="button"
            onClick={onJump}
            className={`rounded px-1 py-0.5 text-left text-sm font-bold hover:bg-blue-50 ${
              isCurrent
                ? 'bg-blue-100 text-blue-900'
                : 'text-blue-800'
            }`}
          >
            {displayIndex}. {title}
          </button>
        ) : (
          <span
            className={`text-sm font-bold ${isCurrent ? 'text-blue-900' : 'text-blue-800'}`}
          >
            {displayIndex}. {title}
          </span>
        )}
      </div>
      {open && hasChildren && (
        <ul className="mt-1 ml-2 space-y-0.5 border-l border-gray-200 pl-3">
          {midNodes.map((mid) => (
            <MidTreeRow key={mid.id} mid={mid} />
          ))}
        </ul>
      )}
    </li>
  );
}

function MidTreeRow({ mid }: { mid: MidNode }) {
  const [open, setOpen] = useState(true);
  const hasChildren = mid.subNodes.length > 0;
  // 마크다운 굵게(**) 표시 제거
  const cleanTitle = mid.title.replace(/\*\*/g, '');
  return (
    <li>
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={() => hasChildren && setOpen(!open)}
          className={`mt-0.5 size-4 shrink-0 text-[10px] text-gray-400 ${
            hasChildren ? 'hover:text-gray-700' : 'invisible'
          }`}
          aria-label={open ? '접기' : '펼치기'}
        >
          {open ? '▾' : '▸'}
        </button>
        <span className="text-[13px] text-gray-800">{cleanTitle}</span>
      </div>
      {open && hasChildren && (
        <ul className="mt-0.5 ml-2 space-y-0.5 border-l border-gray-200 pl-3">
          {mid.subNodes.map((sub) => (
            <SubTreeRow key={sub.id} sub={sub} />
          ))}
        </ul>
      )}
    </li>
  );
}

function SubTreeRow({ sub }: { sub: SubNode }) {
  const cleanTitle = sub.title.replace(/\*\*/g, '');
  return (
    <li className="flex items-start gap-1.5">
      <span className="mt-0.5 text-[10px] text-gray-400">•</span>
      <span className="text-[12px] text-gray-700">{cleanTitle}</span>
    </li>
  );
}
