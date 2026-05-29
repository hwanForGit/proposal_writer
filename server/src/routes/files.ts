import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../middleware/error-handler.js';
import { parseFile } from '../parsers/index.js';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 50;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});

// multer 기본 originalname 디코딩이 latin1이라 한글 파일명이 mojibake로 들어옴.
// latin1로 재해석 → utf8 디코딩 했을 때 한글(완성형 or 자모 NFD)이 등장하면 그게 진짜 이름.
// macOS Finder는 한글 파일명을 NFD(자모 분리)로 저장하므로 자모 영역도 매칭에 포함.
// 디코딩 후 NFC로 정규화하여 클라이언트(NFC)와 매칭 가능하게 만듦.
// ASCII만 있는 경우엔 원본 raw 그대로.
const KOREAN_RE = /[가-힯ᄀ-ᇿ㄰-㆏]/;
const decodeOriginalName = (raw: string): string => {
  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    if (KOREAN_RE.test(decoded) && !decoded.includes('�')) {
      return decoded.normalize('NFC');
    }
    return raw.normalize('NFC');
  } catch {
    return raw;
  }
};

type FileCategory = 'announcement' | 'company';

interface ParsedFileResponse {
  id: string;
  name: string;
  category: FileCategory;
  mimeType: string;
  size: number;
  textContent: string;
  extractedAt: string;
  warnings: string[];
}

interface FileError {
  fileName: string;
  code: string;
  message: string;
}

const isCategory = (v: unknown): v is FileCategory =>
  v === 'announcement' || v === 'company';

export const filesRouter: Router = Router();

filesRouter.post(
  '/files/parse',
  upload.array('files', MAX_FILES),
  async (req, res, next) => {
    try {
      const category: unknown = req.body?.category;
      if (!isCategory(category)) {
        throw new ApiError(
          400,
          'INVALID_CATEGORY',
          'category는 announcement 또는 company이어야 합니다',
        );
      }

      const incoming = (req.files ?? []) as Express.Multer.File[];
      if (incoming.length === 0) {
        throw new ApiError(400, 'NO_FILES', '업로드된 파일이 없습니다');
      }

      const files: ParsedFileResponse[] = [];
      const errors: FileError[] = [];

      for (const f of incoming) {
        const name = decodeOriginalName(f.originalname);
        try {
          const result = await parseFile(f.buffer, name);
          files.push({
            id: randomUUID(),
            name,
            category,
            mimeType: f.mimetype,
            size: f.size,
            textContent: result.text,
            extractedAt: new Date().toISOString(),
            warnings: result.warnings ?? [],
          });
        } catch (err) {
          if (err instanceof ApiError) {
            errors.push({ fileName: name, code: err.code, message: err.message });
          } else {
            errors.push({
              fileName: name,
              code: 'PARSE_FAILED',
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      res.json({ files, errors });
    } catch (err) {
      next(err);
    }
  },
);
