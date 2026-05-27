import { SOURCE_META } from './types';
import type { OutlineNode } from './types';

interface Props {
  node: OutlineNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}

export default function OutlineNodeItem({
  node,
  depth,
  expanded,
  onToggle,
}: Props) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const badge = SOURCE_META[node.source];

  return (
    <li>
      <div
        className="group flex items-start gap-2 rounded px-2 py-1.5 hover:bg-gray-50"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggle(node.id)}
          className={`mt-1 size-4 shrink-0 text-[10px] text-gray-400 ${
            hasChildren
              ? 'cursor-pointer hover:text-gray-700'
              : 'invisible'
          }`}
          aria-label={isOpen ? '접기' : '펼치기'}
          aria-expanded={hasChildren ? isOpen : undefined}
        >
          {isOpen ? '▼' : '▶'}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {node.title}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>
          {node.description && (
            <p className="mt-0.5 text-xs text-gray-500">{node.description}</p>
          )}
        </div>
      </div>
      {hasChildren && isOpen && (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <OutlineNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
