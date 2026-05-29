import type { OutlineState } from '@/features/workspace/store';

const pad2 = (n: number): string => n.toString().padStart(2, '0');

const formatTimestamp = (d: Date): string =>
  `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;

export const exportOutlineAsJson = (outline: OutlineState): void => {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    outline,
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `proposal-outline-${formatTimestamp(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportOutlineAsMarkdown = (outline: OutlineState): void => {
  const parts: string[] = [];

  if (outline.step1.markdown) {
    parts.push('# Step 1 — 사전 분석');
    parts.push('');
    parts.push(outline.step1.markdown.trim());
    parts.push('');
  }

  if (outline.step2.sections.length > 0) {
    parts.push('# Step 2 — 아웃라인 구조');
    parts.push('');
    for (const s of outline.step2.sections) {
      if (!s.markdown) continue;
      parts.push(s.markdown.trim());
      parts.push('');
    }
  }

  const text = parts.join('\n').trim() || '(아직 생성된 아웃라인이 없습니다.)';
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `proposal-outline-${formatTimestamp(new Date())}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
