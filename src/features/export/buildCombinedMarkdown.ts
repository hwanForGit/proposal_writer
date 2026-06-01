import type { OutlineState } from '@/features/workspace/store';
import type { CoverMeta } from './types';

export interface BuildOptions {
  /** Step 3 본문 포함 여부 (false면 아웃라인만 = 트리 구조까지) */
  includeBody: boolean;
}

const DEFAULT_OPTIONS: BuildOptions = { includeBody: true };

const trim = (s: string | null | undefined): string => (s ?? '').trim();

export function buildCombinedMarkdown(
  outline: OutlineState,
  cover: CoverMeta,
  options: BuildOptions = DEFAULT_OPTIONS,
): string {
  const parts: string[] = [];

  // 표지
  const hasCover =
    cover.projectName ||
    cover.organization ||
    cover.author ||
    cover.contact;
  if (hasCover) {
    if (cover.projectName) parts.push(`# ${cover.projectName}`);
    const sub = [cover.organization, cover.author, cover.date]
      .filter(Boolean)
      .join(' · ');
    if (sub) parts.push(sub);
    if (cover.contact) parts.push(`연락처: ${cover.contact}`);
    parts.push('');
    parts.push('---');
    parts.push('');
  }

  // Step 1 (선택)
  if (cover.includeStep1 && trim(outline.step1.markdown)) {
    parts.push('## 1장. 사전 분석');
    parts.push('');
    parts.push(trim(outline.step1.markdown));
    parts.push('');
    parts.push('---');
    parts.push('');
  }

  // Step 2 + Step 3 통합 (대분류 순서)
  if (outline.step2.sections.length > 0) {
    parts.push(
      cover.includeStep1 ? '## 2장. 사업계획서' : '## 사업계획서',
    );
    parts.push('');

    for (const section of outline.step2.sections) {
      if (!trim(section.markdown)) continue;
      // 대분류 헤딩
      parts.push(`### ${section.index}. ${section.title}`);
      parts.push('');
      // 트리 마크다운 그대로 (대분류·중분류·소분류 + 가이드)
      parts.push(trim(section.markdown));
      parts.push('');

      // 같은 대분류에 속하는 Step 3 본문들 (옵션에 따라)
      if (options.includeBody) {
        const bodies = outline.step3.bodies.filter(
          (b) => b.ref.mainIndex === section.index && trim(b.markdown),
        );
        for (const body of bodies) {
          parts.push(
            `#### ${body.ref.mainIndex}.${body.ref.midIndex + 1} ${body.ref.midTitle}`,
          );
          parts.push('');
          parts.push(trim(body.markdown));
          parts.push('');
        }
      }
    }
  }

  // 부록 — Step 3 본문들의 "[부록]" 섹션 자동 취합 (본문 포함 시에만)
  const appendixes: string[] = [];
  if (options.includeBody) {
    for (const body of outline.step3.bodies) {
      const md = trim(body.markdown);
      if (!md) continue;
      const m = md.match(/(\*\*🔎[\s\S]*$|^---\s*\n\*\*🔎[\s\S]*$)/m);
      if (m) appendixes.push(`### ${body.ref.midTitle}\n\n${m[0]}`);
    }
  }
  if (appendixes.length > 0) {
    parts.push('---');
    parts.push('');
    parts.push('## 부록. 출처 리스트');
    parts.push('');
    parts.push(appendixes.join('\n\n'));
    parts.push('');
  }

  const result = parts.join('\n').trim();
  return result || '(아직 생성된 내용이 없습니다.)';
}
