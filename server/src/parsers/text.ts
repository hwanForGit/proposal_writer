import type { ParseResult } from './index.js';

export async function parseText(
  buffer: Buffer,
  _fileName: string,
): Promise<ParseResult> {
  return { text: buffer.toString('utf-8') };
}
