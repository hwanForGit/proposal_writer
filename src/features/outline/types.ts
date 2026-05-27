export type OutlineSource = 'announcement' | 'template' | 'derived';

export interface OutlineNode {
  id: string;
  title: string;
  description?: string;
  source: OutlineSource;
  children: OutlineNode[];
}

export interface OutlineDocument {
  rootNodes: OutlineNode[];
  generatedAt: string;
  modelId: string;
  inputFileIds: string[];
}

export const SOURCE_META: Record<
  OutlineSource,
  { label: string; className: string }
> = {
  announcement: {
    label: '공고',
    className: 'bg-blue-100 text-blue-700',
  },
  template: {
    label: '양식',
    className: 'bg-purple-100 text-purple-700',
  },
  derived: {
    label: '도출',
    className: 'bg-gray-100 text-gray-600',
  },
};
