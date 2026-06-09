import { genId } from '@/lib/id';

export interface SubNode {
  id: string;
  title: string;
  guidance: string;
}

export interface MidNode {
  id: string;
  title: string;
  guidance: string;
  subNodes: SubNode[];
}

export interface SectionTree {
  sectionTitle: string;
  intentGuidance: string;
  midNodes: MidNode[];
}

const MID_RE = /\[\s*중분류[^\]]*\]/;
const SUB_RE = /\[\s*소분류[^\]]*\]/;
const SECTION_RE = /^\s*\[([^\]]+)\]\s*$/;
const INTENT_RE = /이\s*섹션의\s*기획\s*의도/;
const GUIDE_RE = /포함될\s*자사\s*소스|벤치마킹\s*적용/;

// LLM이 "[중분류 X.Y] 제목" 대신 마크다운 헤딩 형식으로 응답한 경우를 대비.
// "## 1.1 제목", "### 1.1.1 제목", "## 중분류 1.1 ..." 모두 헤딩 fallback으로 인식.
const H2_RE = /^##\s+/;
const H3_PLUS_RE = /^#{3,}\s+/;

const stripFormat = (s: string): string =>
  s
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/, '')
    .replace(/^[-*\s]+/, '')
    .trim();

const titleFromMidLine = (line: string): string => {
  const stripped = stripFormat(line);
  return stripped.replace(/\s*:\s*$/, '').trim();
};

const extractAfterColon = (line: string): string => {
  const idx = line.indexOf(':');
  if (idx < 0) return stripFormat(line);
  return stripFormat(line.slice(idx + 1));
};

const appendLine = (existing: string, line: string): string => {
  const clean = stripFormat(line);
  if (!clean) return existing;
  return existing ? `${existing} ${clean}` : clean;
};

const newId = (): string => genId('n');

export function parseSection(markdown: string, fallbackTitle?: string): SectionTree {
  const lines = markdown.split('\n');
  const tree: SectionTree = {
    sectionTitle: '',
    intentGuidance: '',
    midNodes: [],
  };

  type Cursor = 'intent' | { mid: MidNode } | { mid: MidNode; sub: SubNode } | null;
  let cursor: Cursor = null;
  // section 헤더가 비어있거나 누락된 경우 첫 헤딩을 섹션 제목으로 채택.
  let sectionTitleAssigned = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 1) 섹션 헤더 — "[{section title}]"만 있는 줄
    const sec = trimmed.match(SECTION_RE);
    if (sec && !MID_RE.test(trimmed) && !SUB_RE.test(trimmed)) {
      const title = sec[1]!.trim();
      // 빈 대괄호 "[]"는 무시 (다음 헤딩으로 fallback)
      if (title) {
        tree.sectionTitle = title;
        sectionTitleAssigned = true;
      }
      cursor = null;
      continue;
    }

    // 2) 중분류 (정상 형식)
    if (MID_RE.test(trimmed)) {
      const mid: MidNode = {
        id: newId(),
        title: titleFromMidLine(line),
        guidance: '',
        subNodes: [],
      };
      tree.midNodes.push(mid);
      cursor = { mid };
      continue;
    }

    // 3) 소분류 (정상 형식) — 가장 최근 mid의 자식으로
    if (SUB_RE.test(trimmed) && cursor && typeof cursor === 'object' && 'mid' in cursor) {
      const sub: SubNode = {
        id: newId(),
        title: titleFromMidLine(line),
        guidance: '',
      };
      cursor.mid.subNodes.push(sub);
      cursor = { mid: cursor.mid, sub };
      continue;
    }

    // 4) "이 섹션의 기획 의도" 시작 줄
    if (INTENT_RE.test(trimmed)) {
      tree.intentGuidance = appendLine(tree.intentGuidance, extractAfterColon(line));
      cursor = 'intent';
      continue;
    }

    // 5) "포함될 자사 소스 ..." 가이드 줄
    if (GUIDE_RE.test(trimmed) && cursor && typeof cursor === 'object') {
      const text = extractAfterColon(line);
      if ('sub' in cursor) cursor.sub.guidance = appendLine(cursor.sub.guidance, text);
      else cursor.mid.guidance = appendLine(cursor.mid.guidance, text);
      continue;
    }

    // 6) 헤딩 fallback — LLM이 [중분류]/[소분류] 대신 ##/### 헤딩으로 응답한 경우.
    //    H2: 첫 occurence는 섹션 제목으로(미할당 시), 이후는 중분류로 인식.
    //    H3+: 직전 mid의 소분류로 인식. mid가 없으면 그것이 mid가 됨(안전 폴백).
    if (H3_PLUS_RE.test(trimmed)) {
      const title = stripFormat(line);
      if (cursor && typeof cursor === 'object' && 'mid' in cursor) {
        const sub: SubNode = { id: newId(), title, guidance: '' };
        cursor.mid.subNodes.push(sub);
        cursor = { mid: cursor.mid, sub };
      } else {
        const mid: MidNode = { id: newId(), title, guidance: '', subNodes: [] };
        tree.midNodes.push(mid);
        cursor = { mid };
      }
      continue;
    }
    if (H2_RE.test(trimmed)) {
      const title = stripFormat(line);
      if (!sectionTitleAssigned) {
        tree.sectionTitle = title;
        sectionTitleAssigned = true;
        cursor = null;
      } else {
        const mid: MidNode = { id: newId(), title, guidance: '', subNodes: [] };
        tree.midNodes.push(mid);
        cursor = { mid };
      }
      continue;
    }

    // 7) 그 외 — 현재 커서에 가이드 누적 (마크다운 마커는 stripFormat에서 제거됨)
    if (cursor === 'intent') {
      tree.intentGuidance = appendLine(tree.intentGuidance, trimmed);
    } else if (cursor && typeof cursor === 'object') {
      if ('sub' in cursor) cursor.sub.guidance = appendLine(cursor.sub.guidance, trimmed);
      else cursor.mid.guidance = appendLine(cursor.mid.guidance, trimmed);
    }
  }

  // 모든 라인을 본 뒤에도 sectionTitle이 비어있으면 외부에서 받은 fallback으로 채움.
  if (!tree.sectionTitle && fallbackTitle) {
    tree.sectionTitle = fallbackTitle;
  }

  return tree;
}

export function serializeSection(tree: SectionTree): string {
  const lines: string[] = [];
  lines.push(`[${tree.sectionTitle}]`);
  if (tree.intentGuidance) {
    lines.push(`- **이 섹션의 기획 의도:** ${tree.intentGuidance}`);
  }
  for (const mid of tree.midNodes) {
    lines.push(`- ${mid.title}`);
    if (mid.guidance) {
      lines.push(`    - 포함될 자사 소스 및 벤치마킹 적용안: ${mid.guidance}`);
    }
    for (const sub of mid.subNodes) {
      lines.push(`    - ${sub.title}`);
      if (sub.guidance) {
        lines.push(
          `        - 포함될 자사 소스 및 벤치마킹 적용안: ${sub.guidance}`,
        );
      }
    }
  }
  return lines.join('\n');
}

export const hasValidStructure = (tree: SectionTree): boolean =>
  tree.midNodes.length > 0;

// "[중분류 1.1] 사업 배경" → "1.1 사업 배경" / "[소분류 1.1.1] X" → "1.1.1 X"
// "[중분류 새 항목] 제목" → "제목" (숫자 없을 때 마커 제거)
const cleanNodeTitle = (raw: string): string => {
  const s = raw.trim();
  const m = s.match(
    /^\[\s*(?:중분류|소분류)\s*((?:\d+(?:\.\d+)*)?)[^\]]*\]\s*(.*)$/,
  );
  if (m) {
    const num = (m[1] ?? '').trim();
    const title = (m[2] ?? '').trim();
    if (num && title) return `${num} ${title}`;
    return title || num;
  }
  return s;
};

/**
 * 가이드(기획 의도·자사 매핑)를 제외하고 제목 트리만 직렬화. 회람·구조 확인용.
 * 중분류는 "- 1.1 제목", 소분류는 들여쓰기 2칸 + "- 1.1.1 제목".
 */
export function serializeTitlesOnly(tree: SectionTree): string {
  const lines: string[] = [];
  for (const mid of tree.midNodes) {
    lines.push(`- ${cleanNodeTitle(mid.title)}`);
    for (const sub of mid.subNodes) {
      lines.push(`  - ${cleanNodeTitle(sub.title)}`);
    }
  }
  return lines.join('\n');
}

export const emptyMidNode = (): MidNode => ({
  id: newId(),
  title: '[중분류 새 항목] 제목을 입력하세요',
  guidance: '',
  subNodes: [],
});

export const emptySubNode = (): SubNode => ({
  id: newId(),
  title: '[소분류 새 항목] 제목을 입력하세요',
  guidance: '',
});
