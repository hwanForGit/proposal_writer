import { Router } from 'express';
import { ApiError } from '../middleware/error-handler.js';
import { markdownToDocx } from '../exporters/docx.js';

interface ExportMarkdownBody {
  markdown: string;
  filename?: string;
}

const isBody = (v: unknown): v is ExportMarkdownBody =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as ExportMarkdownBody).markdown === 'string';

export const exportRouter: Router = Router();

exportRouter.post('/export/docx', async (req, res, next) => {
  if (!isBody(req.body)) {
    return next(
      new ApiError(400, 'INVALID_BODY', 'markdown 필드가 필요합니다'),
    );
  }
  const { markdown } = req.body;
  const filename = req.body.filename?.trim() || 'proposal.docx';
  if (!markdown.trim()) {
    return next(new ApiError(400, 'EMPTY_MARKDOWN', '마크다운이 비어있습니다'));
  }

  try {
    console.log(`[export docx] markdown=${markdown.length}자`);
    const startedAt = Date.now();
    const buffer = await markdownToDocx(markdown);
    console.log(
      `[export docx] done in ${Date.now() - startedAt}ms, output=${buffer.length} bytes`,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[export docx]', message);
    if (message === 'PANDOC_NOT_INSTALLED') {
      return next(
        new ApiError(
          503,
          'PANDOC_NOT_INSTALLED',
          'pandoc이 서버 환경에 설치되지 않았습니다. 설치: brew install pandoc (macOS) 또는 apt install pandoc (Linux). 그 후 백엔드 재시작.',
        ),
      );
    }
    return next(
      new ApiError(500, 'DOCX_CONVERSION_FAILED', message, {
        cause: String(err),
      }),
    );
  }
});
