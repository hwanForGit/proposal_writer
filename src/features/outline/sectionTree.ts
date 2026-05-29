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

const stripFormat = (s: string): string =>
  s
    .replace(/\*\*/g, '')
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

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `n-${Math.random().toString(36).slice(2, 10)}`;

export function parseSection(markdown: string): SectionTree {
  const lines = markdown.split('\n');
  const tree: SectionTree = {
    sectionTitle: '',
    intentGuidance: '',
    midNodes: [],
  };

  type Cursor = 'intent' | { mid: MidNode } | { mid: MidNode; sub: SubNode } | null;
  let cursor: Cursor = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 1) 섹션 헤더 — "[{section title}]"만 있는 줄
    const sec = trimmed.match(SECTION_RE);
    if (sec && !MID_RE.test(trimmed) && !SUB_RE.test(trimmed)) {
      tree.sectionTitle = sec[1]!.trim();
      cursor = null;
      continue;
    }

    // 2) 중분류
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

    // 3) 소분류 — 가장 최근 mid의 자식으로
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

    // 6) 그 외 — 현재 커서에 가이드 누적
    if (cursor === 'intent') {
      tree.intentGuidance = appendLine(tree.intentGuidance, trimmed);
    } else if (cursor && typeof cursor === 'object') {
      if ('sub' in cursor) cursor.sub.guidance = appendLine(cursor.sub.guidance, trimmed);
      else cursor.mid.guidance = appendLine(cursor.mid.guidance, trimmed);
    }
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
