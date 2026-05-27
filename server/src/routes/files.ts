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
        try {
          const result = await parseFile(f.buffer, f.originalname);
          files.push({
            id: randomUUID(),
            name: f.originalname,
            category,
            mimeType: f.mimetype,
            size: f.size,
            textContent: result.text,
            extractedAt: new Date().toISOString(),
            warnings: result.warnings ?? [],
          });
        } catch (err) {
          if (err instanceof ApiError) {
            errors.push({
              fileName: f.originalname,
              code: err.code,
              message: err.message,
            });
          } else {
            errors.push({
              fileName: f.originalname,
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
