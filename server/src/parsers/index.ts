import { extname } from 'node:path';
import { ApiError } from '../middleware/error-handler.js';
import { parseOffice } from './office.js';
import { parseHwpx } from './hwpx.js';
import { parseText } from './text.js';

export interface ParseResult {
  text: string;
  warnings?: string[];
}

export type ParseFn = (
  buffer: Buffer,
  fileName: string,
) => Promise<ParseResult>;

const OFFICE_EXTS = new Set(['.pdf', '.docx', '.pptx', '.xlsx']);
const TEXT_EXTS = new Set(['.txt', '.md']);

export async function parseFile(
  buffer: Buffer,
  fileName: string,
): Promise<ParseResult> {
  const ext = extname(fileName).toLowerCase();

  if (OFFICE_EXTS.has(ext)) return parseOffice(buffer, fileName);
  if (ext === '.hwpx') return parseHwpx(buffer, fileName);
  if (TEXT_EXTS.has(ext)) return parseText(buffer, fileName);
  throw new ApiError(
    415,
    'UNSUPPORTED_FORMAT',
    `지원하지 않는 형식: ${ext || '(no extension)'}`,
    { fileName },
  );
}
