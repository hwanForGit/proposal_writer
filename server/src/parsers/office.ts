import { parseOfficeAsync } from 'officeparser';
import type { ParseResult } from './index.js';

export async function parseOffice(
  buffer: Buffer,
  _fileName: string,
): Promise<ParseResult> {
  const text = await parseOfficeAsync(buffer);
  const trimmed = text.trim();
  return {
    text: trimmed,
    warnings: trimmed.length === 0 ? ['추출된 텍스트가 비어있습니다'] : undefined,
  };
}
