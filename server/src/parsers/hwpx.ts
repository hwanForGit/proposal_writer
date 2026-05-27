import JSZip from 'jszip';
import type { ParseResult } from './index.js';

const SECTION_PATH = /^Contents\/section\d+\.xml$/i;
const TEXT_TAG = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g;

const decodeEntities = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

export async function parseHwpx(
  buffer: Buffer,
  fileName: string,
): Promise<ParseResult> {
  const zip = await JSZip.loadAsync(buffer);
  const sectionPaths = Object.keys(zip.files)
    .filter((p) => SECTION_PATH.test(p))
    .sort();

  if (sectionPaths.length === 0) {
    return {
      text: '',
      warnings: [`HWPX 본문 섹션을 찾지 못했습니다: ${fileName}`],
    };
  }

  const lines: string[] = [];
  for (const path of sectionPaths) {
    const entry = zip.file(path);
    if (!entry) continue;
    const xml = await entry.async('string');
    for (const match of xml.matchAll(TEXT_TAG)) {
      const raw = match[1] ?? '';
      const piece = decodeEntities(raw.replace(/<[^>]+>/g, '')).trim();
      if (piece) lines.push(piece);
    }
  }

  const text = lines.join('\n').trim();
  return {
    text,
    warnings:
      text.length === 0
        ? ['HWPX 텍스트를 추출하지 못했습니다 (구조가 비표준일 수 있음)']
        : undefined,
  };
}
