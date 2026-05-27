import { useState } from 'react';
import OutlineNodeItem from './OutlineNodeItem';
import type { OutlineNode } from './types';

interface Props {
  nodes: OutlineNode[];
}

const collectAllIds = (nodes: OutlineNode[]): string[] => {
  const ids: string[] = [];
  const walk = (ns: OutlineNode[]) => {
    for (const n of ns) {
      ids.push(n.id);
      if (n.children.length > 0) walk(n.children);
    }
  };
  walk(nodes);
  return ids;
};

export default function OutlineTree({ nodes }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(nodes.map((n) => n.id)),
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(collectAllIds(nodes)));
  const collapseAll = () => setExpanded(new Set());

  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={expandAll}
          className="text-gray-500 hover:text-gray-900"
        >
          모두 펼치기
        </button>
        <span className="text-gray-300">·</span>
        <button
          type="button"
          onClick={collapseAll}
          className="text-gray-500 hover:text-gray-900"
        >
          모두 접기
        </button>
      </div>
      <ul className="space-y-0.5">
        {nodes.map((node) => (
          <OutlineNodeItem
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            onToggle={toggle}
          />
        ))}
      </ul>
    </div>
  );
}
