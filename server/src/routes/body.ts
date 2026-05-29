import { Router } from 'express';
import { ApiError } from '../middleware/error-handler.js';
import { getLlmClient } from '../llm/client.js';
import { loadAndRenderPrompt } from '../llm/prompts.js';

type FileCategory = 'announcement' | 'company';

interface InputFile {
  id: string;
  name: string;
  category: FileCategory;
  textContent: string;
}

interface BodySectionBody {
  announcementFiles: InputFile[];
  companyFiles: InputFile[];
  step1Markdown: string;
  mainTitle: string;
  midTitle: string;
  midGuidance: string;
  step2SectionMarkdown: string;
}

const isInputFile = (v: unknown): v is InputFile =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as InputFile).id === 'string' &&
  typeof (v as InputFile).name === 'string' &&
  typeof (v as InputFile).textContent === 'string';

const isBody = (v: unknown): v is BodySectionBody =>
  typeof v === 'object' &&
  v !== null &&
  Array.isArray((v as BodySectionBody).announcementFiles) &&
  (v as BodySectionBody).announcementFiles.every(isInputFile) &&
  Array.isArray((v as BodySectionBody).companyFiles) &&
  (v as BodySectionBody).companyFiles.every(isInputFile) &&
  typeof (v as BodySectionBody).step1Markdown === 'string' &&
  typeof (v as BodySectionBody).mainTitle === 'string' &&
  typeof (v as BodySectionBody).midTitle === 'string' &&
  typeof (v as BodySectionBody).midGuidance === 'string' &&
  typeof (v as BodySectionBody).step2SectionMarkdown === 'string';

const COMPANY_EMPTY_FALLBACK = `(회사 정보 파일이 제공되지 않았습니다. 자사 핵심 정보가 필요한 항목은 일반적 표현으로 대체하거나 "추후 자사 정보 확보 후 보강 필요"로 표기해주십시오.)`;

const formatFiles = (files: InputFile[], emptyFallback: string): string =>
  files.length === 0
    ? emptyFallback
    : files
        .map((f) => `## ${f.name}\n${f.textContent.trim()}`)
        .join('\n\n---\n\n');

export const bodyRouter: Router = Router();

bodyRouter.post('/body/section', async (req, res, next) => {
  if (!isBody(req.body)) {
    return next(
      new ApiError(
        400,
        'INVALID_BODY',
        'announcementFiles, companyFiles, step1Markdown, mainTitle, midTitle, midGuidance, step2SectionMarkdown이 필요합니다',
      ),
    );
  }
  const {
    announcementFiles,
    companyFiles,
    step1Markdown,
    mainTitle,
    midTitle,
    midGuidance,
    step2SectionMarkdown,
  } = req.body;
  if (announcementFiles.length === 0) {
    return next(
      new ApiError(
        400,
        'NO_ANNOUNCEMENT_FILES',
        '공고·양식 파일이 1개 이상 필요합니다',
      ),
    );
  }
  if (!midTitle.trim()) {
    return next(
      new ApiError(400, 'NO_CURRENT_MID', '작성할 중분류가 비어있습니다'),
    );
  }

  try {
    const companyText = formatFiles(companyFiles, COMPANY_EMPTY_FALLBACK);

    const targetSection = [
      `[대분류] ${mainTitle}`,
      `[중분류] ${midTitle}`,
      midGuidance
        ? `\n[중분류 기획 의도 및 자사 소스 매핑]\n${midGuidance}`
        : '',
      step2SectionMarkdown
        ? `\n[참고: 이 대분류의 전체 구조]\n${step2SectionMarkdown}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const systemPrompt = await loadAndRenderPrompt('body_phase2', {
      proposal_strategy: step1Markdown,
      target_section: targetSection,
      assigned_company_sources: companyText,
    });
    const { client, model } = getLlmClient();

    console.log(
      `[body section] "${midTitle}" prompt=${systemPrompt.length}자 model=${model}`,
    );

    const startedAt = Date.now();
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `이번 회차의 대상 중분류는 "${midTitle}"입니다. 다른 중분류는 절대 작성하지 마십시오. [Output Format]에 따라 본 중분류의 본문을 작성하되, **응답 전체는 반드시 2,500~3,500자 이내로** 작성하십시오. 분량이 길어지면 timeout으로 작업이 중단됩니다.`,
        },
      ],
      max_tokens: 5000,
    });

    const choice = completion.choices[0];
    const markdown = choice?.message?.content ?? '';
    if (!markdown.trim()) {
      throw new ApiError(
        502,
        'EMPTY_LLM_RESPONSE',
        'LLM이 빈 응답을 반환했습니다',
        { finishReason: choice?.finish_reason },
      );
    }

    console.log(
      `[body section] "${midTitle}" done in ${Date.now() - startedAt}ms, output=${markdown.length}자, finish=${choice?.finish_reason}, completionTokens=${completion.usage?.completion_tokens ?? '-'}`,
    );

    res.json({
      markdown,
      modelId: completion.model,
      generatedAt: new Date().toISOString(),
      finishReason: choice?.finish_reason ?? null,
      usage: completion.usage ?? null,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    const status =
      typeof (err as { status?: number })?.status === 'number'
        ? (err as { status: number }).status
        : 502;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[body section]', status, message);
    return next(
      new ApiError(status, 'LLM_REQUEST_FAILED', message, {
        cause: String(err),
      }),
    );
  }
});
