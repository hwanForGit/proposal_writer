import { Router } from 'express';
import type { Response } from 'express';
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

interface OutlineGenerateBody {
  announcementFiles: InputFile[];
  companyFiles: InputFile[];
}

const isInputFile = (v: unknown): v is InputFile =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as InputFile).id === 'string' &&
  typeof (v as InputFile).name === 'string' &&
  typeof (v as InputFile).textContent === 'string';

const isOutlineBody = (v: unknown): v is OutlineGenerateBody =>
  typeof v === 'object' &&
  v !== null &&
  Array.isArray((v as OutlineGenerateBody).announcementFiles) &&
  (v as OutlineGenerateBody).announcementFiles.every(isInputFile) &&
  Array.isArray((v as OutlineGenerateBody).companyFiles) &&
  (v as OutlineGenerateBody).companyFiles.every(isInputFile);

const COMPANY_EMPTY_FALLBACK = `(회사 정보 파일이 제공되지 않았습니다. 자사 핵심 정보가 필요한 항목은 일반적 표현으로 대체하거나 "추후 자사 정보 확보 후 보강 필요"로 표기해주십시오. 단, [공고문]·[양식]과 온라인 우수 사례 분석은 평소대로 충실히 수행하여 양식·공고 요구사항을 모두 반영한 아웃라인을 도출하십시오.)`;

const formatFiles = (files: InputFile[], emptyFallback: string): string =>
  files.length === 0
    ? emptyFallback
    : files
        .map((f) => `## ${f.name}\n${f.textContent.trim()}`)
        .join('\n\n---\n\n');

const sendEvent = (res: Response, data: unknown): void => {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

export const outlineRouter: Router = Router();

// 진단용: 최소 LLM 호출. 게이트웨이/모델 정상성 확인.
outlineRouter.post('/llm/ping', async (_req, res, next) => {
  try {
    const { client, model } = getLlmClient();
    const startedAt = Date.now();
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: '안녕하세요. "ok"라고만 답하세요.' }],
      max_tokens: 10,
    });
    res.json({
      model,
      content: completion.choices[0]?.message?.content ?? null,
      finishReason: completion.choices[0]?.finish_reason ?? null,
      usage: completion.usage ?? null,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (err) {
    const status =
      typeof (err as { status?: number })?.status === 'number'
        ? (err as { status: number }).status
        : 502;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[llm ping]', status, message);
    return next(
      new ApiError(status, 'LLM_PING_FAILED', message, { cause: String(err) }),
    );
  }
});

// ────────────────────────────────────────────────────────────────────
// /api/outline/step1 — 사전 분석 (벤치마킹 + Executive Summary)
// 대분류·중분류는 Step 2에서 별도 호출.
// ────────────────────────────────────────────────────────────────────
outlineRouter.post('/outline/step1', async (req, res, next) => {
  if (!isOutlineBody(req.body)) {
    return next(
      new ApiError(
        400,
        'INVALID_BODY',
        'announcementFiles와 companyFiles 배열이 필요합니다',
      ),
    );
  }
  const { announcementFiles, companyFiles } = req.body;
  if (announcementFiles.length === 0) {
    return next(
      new ApiError(
        400,
        'NO_ANNOUNCEMENT_FILES',
        '공고·양식 파일이 1개 이상 필요합니다',
      ),
    );
  }

  try {
    const announcementText = formatFiles(announcementFiles, '(없음)');
    const companyText = formatFiles(companyFiles, COMPANY_EMPTY_FALLBACK);
    const systemPrompt = await loadAndRenderPrompt('outline_step1', {
      announcement_documents: announcementText,
      template_documents:
        '(상기 1번 <사업 공고문 및 RFP> 자료에 사업계획서 양식이 함께 포함되어 있습니다. 그 안의 작성 항목 목차를 양식으로 간주하여 사용하십시오.)',
      company_documents: companyText,
    });
    const { client, model } = getLlmClient();

    console.log(
      `[outline step1] prompt=${systemPrompt.length}자 (announcement=${announcementText.length}, company=${companyText.length}) model=${model}`,
    );
    console.log(
      `[outline step1] announcement files (${announcementFiles.length}):`,
      announcementFiles.map((f) => `"${f.name}" (${f.textContent.length}자)`),
    );
    console.log(
      `[outline step1] company files (${companyFiles.length}):`,
      companyFiles.map((f) => `"${f.name}" (${f.textContent.length}자)`),
    );

    const startedAt = Date.now();
    // 일단 stream:false로 — ping 호출은 정상이고 stream 옵션이 의심됨.
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            '위 지시에 따라 [Output Format]대로 (1) 벤치마킹 분석 보고서, (2) 사업 수주 핵심 전략 두 가지만 간결하게 출력하십시오. 대분류·중분류 등 사업계획서 뼈대는 절대 포함하지 마십시오.',
        },
      ],
      max_tokens: 8000,
    });

    const choice = completion.choices[0];
    const markdown = choice?.message?.content ?? '';
    const modelId = completion.model;
    const finishReason = choice?.finish_reason ?? null;
    const usage = completion.usage ?? null;

    if (!markdown.trim()) {
      throw new ApiError(
        502,
        'EMPTY_LLM_RESPONSE',
        'LLM이 빈 응답을 반환했습니다',
        { finishReason },
      );
    }

    console.log(
      `[outline step1] done in ${Date.now() - startedAt}ms, output=${markdown.length}자, finish=${finishReason}, completionTokens=${(usage as { completion_tokens?: number } | null)?.completion_tokens ?? '-'}`,
    );

    res.json({
      markdown,
      modelId,
      generatedAt: new Date().toISOString(),
      finishReason,
      usage,
      elapsedMs: Date.now() - startedAt,
      inputFileIds: [
        ...announcementFiles.map((f) => f.id),
        ...companyFiles.map((f) => f.id),
      ],
    });
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    const status =
      typeof (err as { status?: number })?.status === 'number'
        ? (err as { status: number }).status
        : 502;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[outline step1]', status, message);
    return next(
      new ApiError(status, 'LLM_REQUEST_FAILED', message, { cause: String(err) }),
    );
  }
});

// ────────────────────────────────────────────────────────────────────
// /api/outline/step2/sections — 대분류 목록 추출 (짧은 호출)
// ────────────────────────────────────────────────────────────────────
interface Step2SectionsBody {
  announcementFiles: InputFile[];
  companyFiles: InputFile[];
  step1Markdown: string;
}

const isStep2SectionsBody = (v: unknown): v is Step2SectionsBody =>
  typeof v === 'object' &&
  v !== null &&
  Array.isArray((v as Step2SectionsBody).announcementFiles) &&
  (v as Step2SectionsBody).announcementFiles.every(isInputFile) &&
  Array.isArray((v as Step2SectionsBody).companyFiles) &&
  (v as Step2SectionsBody).companyFiles.every(isInputFile) &&
  typeof (v as Step2SectionsBody).step1Markdown === 'string';

const SECTION_LINE_RE = /^\[대분류\s+(\d+)\]\s*(.+?)\s*$/gm;

outlineRouter.post('/outline/step2/sections', async (req, res, next) => {
  if (!isStep2SectionsBody(req.body)) {
    return next(
      new ApiError(
        400,
        'INVALID_BODY',
        'announcementFiles, companyFiles, step1Markdown이 필요합니다',
      ),
    );
  }
  const { announcementFiles, companyFiles, step1Markdown } = req.body;
  if (announcementFiles.length === 0) {
    return next(
      new ApiError(
        400,
        'NO_ANNOUNCEMENT_FILES',
        '공고·양식 파일이 1개 이상 필요합니다',
      ),
    );
  }

  try {
    const announcementText = formatFiles(announcementFiles, '(없음)');
    const companyText = formatFiles(companyFiles, COMPANY_EMPTY_FALLBACK);
    const systemPrompt = await loadAndRenderPrompt('outline_step2_sections', {
      announcement_documents: announcementText,
      template_documents:
        '(상기 1번 <사업 공고문 및 RFP> 자료에 사업계획서 양식이 함께 포함되어 있습니다. 그 안의 작성 항목 목차를 양식으로 간주하여 사용하십시오.)',
      company_documents: companyText,
      step1_markdown: step1Markdown,
    });
    const { client, model } = getLlmClient();

    console.log(
      `[outline step2 sections] prompt=${systemPrompt.length}자 model=${model}`,
    );

    const startedAt = Date.now();
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            '<사업계획서 양식>의 모든 대분류를 빠짐없이 [Output Format]에 따라 한 줄씩 나열하십시오. 다른 설명은 절대 포함하지 마십시오.',
        },
      ],
      max_tokens: 800,
    });

    const choice = completion.choices[0];
    const markdown = choice?.message?.content ?? '';
    const sections = [...markdown.matchAll(SECTION_LINE_RE)].map((m) => ({
      index: Number(m[1]),
      title: (m[2] ?? '').trim(),
    }));
    if (sections.length === 0) {
      throw new ApiError(
        502,
        'NO_SECTIONS_EXTRACTED',
        '대분류 목록 추출 실패 — LLM 응답에서 [대분류 N] 패턴을 찾지 못함',
        { rawMarkdown: markdown.slice(0, 500) },
      );
    }

    console.log(
      `[outline step2 sections] extracted ${sections.length}개:`,
      sections.map((s) => `[${s.index}] ${s.title}`).join(' | '),
    );

    res.json({
      sections,
      markdown,
      modelId: completion.model,
      generatedAt: new Date().toISOString(),
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
    console.error('[outline step2 sections]', status, message);
    return next(
      new ApiError(status, 'LLM_REQUEST_FAILED', message, {
        cause: String(err),
      }),
    );
  }
});

// ────────────────────────────────────────────────────────────────────
// /api/outline/step2/section — 한 대분류의 상세 (중분류·소분류·자사 매핑)
// ────────────────────────────────────────────────────────────────────
interface Step2SectionBody {
  announcementFiles: InputFile[];
  companyFiles: InputFile[];
  step1Markdown: string;
  allSectionTitles: string[];
  currentSection: string;
}

const isStep2SectionBody = (v: unknown): v is Step2SectionBody =>
  typeof v === 'object' &&
  v !== null &&
  Array.isArray((v as Step2SectionBody).announcementFiles) &&
  (v as Step2SectionBody).announcementFiles.every(isInputFile) &&
  Array.isArray((v as Step2SectionBody).companyFiles) &&
  (v as Step2SectionBody).companyFiles.every(isInputFile) &&
  typeof (v as Step2SectionBody).step1Markdown === 'string' &&
  Array.isArray((v as Step2SectionBody).allSectionTitles) &&
  (v as Step2SectionBody).allSectionTitles.every(
    (t) => typeof t === 'string',
  ) &&
  typeof (v as Step2SectionBody).currentSection === 'string';

outlineRouter.post('/outline/step2/section', async (req, res, next) => {
  if (!isStep2SectionBody(req.body)) {
    return next(
      new ApiError(
        400,
        'INVALID_BODY',
        'announcementFiles, companyFiles, step1Markdown, allSectionTitles, currentSection이 필요합니다',
      ),
    );
  }
  const {
    announcementFiles,
    companyFiles,
    step1Markdown,
    allSectionTitles,
    currentSection,
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
  if (!currentSection.trim()) {
    return next(
      new ApiError(400, 'NO_CURRENT_SECTION', '현재 작성할 대분류가 비어있습니다'),
    );
  }

  try {
    const announcementText = formatFiles(announcementFiles, '(없음)');
    const companyText = formatFiles(companyFiles, COMPANY_EMPTY_FALLBACK);
    const allSectionsText = allSectionTitles
      .map((t, i) => `${i + 1}. ${t}`)
      .join('\n');
    const systemPrompt = await loadAndRenderPrompt('outline_step2_section', {
      announcement_documents: announcementText,
      template_documents:
        '(상기 1번 <사업 공고문 및 RFP> 자료에 사업계획서 양식이 함께 포함되어 있습니다.)',
      company_documents: companyText,
      step1_markdown: step1Markdown,
      all_sections: allSectionsText,
      current_section: currentSection,
    });
    const { client, model } = getLlmClient();

    console.log(
      `[outline step2 section] "${currentSection}" prompt=${systemPrompt.length}자 model=${model}`,
    );

    const startedAt = Date.now();
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `이번 회차의 대상 대분류는 "${currentSection}"입니다. 다른 대분류는 절대 작성하지 마십시오. [Output Format]에 따라 작성하되, 각 중분류·소분류의 "포함될 자사 소스 및 벤치마킹 적용안"은 **1~2 문장**, "이 섹션의 기획 의도"도 **1~2 문장**으로 압축하십시오. 응답 전체는 **2,500자 이내**.`,
        },
      ],
      max_tokens: 4000,
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
      `[outline step2 section] "${currentSection}" done in ${Date.now() - startedAt}ms, output=${markdown.length}자, finish=${choice?.finish_reason}, completionTokens=${completion.usage?.completion_tokens ?? '-'}`,
    );

    res.json({
      markdown,
      currentSection,
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
    console.error('[outline step2 section]', status, message);
    return next(
      new ApiError(status, 'LLM_REQUEST_FAILED', message, {
        cause: String(err),
      }),
    );
  }
});

// ────────────────────────────────────────────────────────────────────
// /api/outline/generate — 레거시 (한 번에 전체). 큰 입력에서는 502 가능.
// split 흐름으로 대체 중이지만 호환을 위해 유지.
// ────────────────────────────────────────────────────────────────────
outlineRouter.post('/outline/generate', async (req, res, next) => {
  // === Phase A: pre-stream validation (JSON error 가능) ===
  if (!isOutlineBody(req.body)) {
    return next(
      new ApiError(
        400,
        'INVALID_BODY',
        'announcementFiles와 companyFiles 배열이 필요합니다',
      ),
    );
  }
  const { announcementFiles, companyFiles } = req.body;
  if (announcementFiles.length === 0) {
    return next(
      new ApiError(
        400,
        'NO_ANNOUNCEMENT_FILES',
        '공고·양식 파일이 1개 이상 필요합니다',
      ),
    );
  }

  let systemPrompt: string;
  let llm: ReturnType<typeof getLlmClient>;
  try {
    const announcementText = formatFiles(announcementFiles, '(없음)');
    const companyText = formatFiles(companyFiles, COMPANY_EMPTY_FALLBACK);
    systemPrompt = await loadAndRenderPrompt('outline_phase1', {
      announcement_documents: announcementText,
      template_documents: announcementText,
      company_documents: companyText,
    });
    llm = getLlmClient();
  } catch (err) {
    return next(err);
  }

  // === Phase B: 스트리밍 시작 (이후 JSON 응답 불가, SSE error 이벤트로만) ===
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const startedAt = Date.now();
  let totalChars = 0;
  let chunkCount = 0;
  let finishReason: string | null = null;
  let usage: unknown = null;
  let modelId: string | undefined;

  // 클라이언트가 connection 끊으면 stream 중단 신호
  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  try {
    const stream = await llm.client.chat.completions.create({
      model: llm.model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            '위 [Input Data]와 [Instructions]에 따라 [Output Format]에 맞춰 결과물을 출력하십시오.',
        },
      ],
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      if (aborted) break;
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        chunkCount++;
        totalChars += delta.length;
        sendEvent(res, { type: 'delta', text: delta });
      }
      if (chunk.choices[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason;
      }
      if (chunk.model) {
        modelId = chunk.model;
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }
    }

    if (!aborted) {
      sendEvent(res, {
        type: 'done',
        modelId: modelId ?? llm.model,
        generatedAt: new Date().toISOString(),
        finishReason,
        usage,
        elapsedMs: Date.now() - startedAt,
        inputFileIds: [
          ...announcementFiles.map((f) => f.id),
          ...companyFiles.map((f) => f.id),
        ],
        chunkCount,
        totalChars,
      });
    }
    res.end();
  } catch (streamErr) {
    const status =
      typeof (streamErr as { status?: number })?.status === 'number'
        ? (streamErr as { status: number }).status
        : 502;
    const message =
      streamErr instanceof Error ? streamErr.message : String(streamErr);
    console.error('[outline stream]', status, message);
    sendEvent(res, {
      type: 'error',
      code: 'LLM_STREAM_FAILED',
      message: `${status} ${message}`,
      partialChars: totalChars,
    });
    res.end();
  }
});
