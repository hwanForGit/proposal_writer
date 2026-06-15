import { parseSection, serializeTitlesOnly } from '@/features/outline/sectionTree';
import type { OutlineState } from '@/features/workspace/store';
import type { CoverMeta } from './types';

/**
 * 다운로드 범위 옵션.
 * - 'full'              : 표지 + (선택)Step 1 + 아웃라인(가이드) + 본문 + 부록
 * - 'body'             : 표지 + (선택)Step 1 + 본문만(가이드 제외) — 제출용 깔끔한 사업계획서
 * - 'outline-with-guide': 표지 + (선택)Step 1 + 아웃라인(가이드). 본문 제외
 * - 'titles-only'       : 표지 + (선택)Step 1 + 제목 트리만(대·중·소분류 제목). 가이드·본문 제외
 */
export type ExportScope = 'full' | 'body' | 'outline-with-guide' | 'titles-only';

export interface BuildOptions {
  scope: ExportScope;
}

const DEFAULT_OPTIONS: BuildOptions = { scope: 'full' };

const trim = (s: string | null | undefined): string => (s ?? '').trim();

// 여러 줄 텍스트를 마크다운 인용블록(> )으로 감싼다. 가이드를 본문과 시각적으로 분리.
const blockquote = (text: string): string =>
  text
    .split('\n')
    .map((l) => (l.trim() ? `> ${l}` : '>'))
    .join('\n');

export function buildCombinedMarkdown(
  outline: OutlineState,
  cover: CoverMeta,
  options: BuildOptions = DEFAULT_OPTIONS,
): string {
  const parts: string[] = [];
  const includeBody = options.scope === 'full' || options.scope === 'body';
  const includeGuide =
    options.scope === 'full' || options.scope === 'outline-with-guide';

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
      const sectionMd = trim(section.markdown);
      if (!sectionMd) continue;
      // 대분류 헤딩 (H3)
      parts.push(`### ${section.index}. ${section.title}`);
      parts.push('');

      if (options.scope === 'titles-only') {
        const tree = parseSection(sectionMd, section.title);
        const titles = serializeTitlesOnly(tree);
        if (titles) {
          parts.push(titles);
          parts.push('');
        }
        continue;
      }

      // 작성 가이드 — 인용블록 + 라벨로 본문과 명확히 분리
      if (includeGuide) {
        parts.push(
          '> 📋 **작성 가이드** — 집필 지침이며, 실제 제출 본문이 아닙니다.',
        );
        parts.push('>');
        parts.push(blockquote(sectionMd));
        parts.push('');
      }

      // 같은 대분류에 속하는 Step 3 본문들
      if (includeBody) {
        const bodies = outline.step3.bodies.filter(
          (b) => b.ref.mainIndex === section.index && trim(b.markdown),
        );
        if (bodies.length > 0) {
          // 가이드가 앞에 있을 때만 본문 시작을 구분선·라벨로 명시
          if (includeGuide) {
            parts.push('---');
            parts.push('');
            parts.push('✍️ **본문**');
            parts.push('');
          }
          for (const body of bodies) {
            // 중분류 본문 헤딩 (H4)
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
  }

  // 부록 — Step 3 본문들의 "[부록]" 섹션 자동 취합 (본문 포함 시에만)
  const appendixes: string[] = [];
  if (includeBody) {
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
