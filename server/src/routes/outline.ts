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
// /api/outline/page-allocation — 중분류별 페이지 배분
// 전체 아웃라인(중분류 목록) + 목표 페이지 수를 받아, 중요도·강점 기반 가중치를
// LLM에서 받고, 서버에서 가중치를 페이지(0.5단위)로 정규화하여 합이 목표와 일치하게 한다.
// ────────────────────────────────────────────────────────────────────
interface AllocInputItem {
  key: string;
  mainTitle: string;
  midTitle: string;
  midGuidance?: string;
}

interface PageAllocBody {
  step1Markdown: string;
  companyPresent: boolean;
  pageLimit: number;
  items: AllocInputItem[];
}

const isAllocItem = (v: unknown): v is AllocInputItem =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as AllocInputItem).key === 'string' &&
  typeof (v as AllocInputItem).mainTitle === 'string' &&
  typeof (v as AllocInputItem).midTitle === 'string';

const isPageAllocBody = (v: unknown): v is PageAllocBody =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as PageAllocBody).step1Markdown === 'string' &&
  typeof (v as PageAllocBody).companyPresent === 'boolean' &&
  typeof (v as PageAllocBody).pageLimit === 'number' &&
  Array.isArray((v as PageAllocBody).items) &&
  (v as PageAllocBody).items.every(isAllocItem);

// LLM 응답에서 [{"n":..,"weight":..,"reason":".."}] JSON 배열만 추출/파싱 (방어적)
const parseWeightArray = (
  raw: string,
): { n: number; weight: number; reason: string }[] => {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr: unknown = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
      .map((e) => ({
        n: Number(e.n),
        weight: Number(e.weight),
        reason: typeof e.reason === 'string' ? e.reason : '',
      }))
      .filter((e) => Number.isFinite(e.n));
  } catch {
    return [];
  }
};

// 가중치 배열 → 페이지(0.5단위) 배열. 각 항목 최소 0.5p, 합은 정확히 totalPages(0.5 반올림).
// 최대잔여(largest remainder)법으로 정확히 합을 맞춘다.
const allocatePages = (weights: number[], totalPages: number): number[] => {
  const n = weights.length;
  if (n === 0) return [];
  const step = 0.5;
  const totalUnits = Math.max(n, Math.round(totalPages / step)); // 항목당 최소 1 unit(0.5p)
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 1));
  const sumW = w.reduce((a, b) => a + b, 0) || n;
  const extra = totalUnits - n;
  const raw = w.map((x) => (extra * x) / sumW);
  const floor = raw.map((r) => Math.floor(r));
  let rem = extra - floor.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  const bonus = new Array<number>(n).fill(0);
  for (let k = 0; k < order.length && rem > 0; k++) {
    bonus[order[k]!.i] = 1;
    rem--;
  }
  return w.map((_, i) => (1 + floor[i]! + bonus[i]!) * step);
};

outlineRouter.post('/outline/page-allocation', async (req, res, next) => {
  if (!isPageAllocBody(req.body)) {
    return next(
      new ApiError(
        400,
        'INVALID_BODY',
        'step1Markdown, companyPresent, pageLimit, items가 필요합니다',
      ),
    );
  }
  const { step1Markdown, companyPresent, items } = req.body;
  const pageLimit = Math.min(300, Math.max(1, Math.round(req.body.pageLimit)));
  if (items.length === 0) {
    return next(new ApiError(400, 'NO_ITEMS', '배분할 중분류가 없습니다'));
  }

  try {
    const midList = items
      .map((it, i) => {
        const g = (it.midGuidance ?? '').trim();
        return `${i + 1}. [${it.mainTitle}] > ${it.midTitle}${
          g ? ` — ${g.slice(0, 80)}` : ''
        }`;
      })
      .join('\n');
    const companyNote = companyPresent
      ? '회사 자료가 제공됨 — 자사 강점·실적이 드러나는 영역에 가중하십시오.'
      : '회사 자료 미제공 — 공고/양식의 평가 항목 중요도를 중심으로 판단하십시오.';

    const systemPrompt = await loadAndRenderPrompt('page_allocation', {
      step1_markdown: step1Markdown || '(사전 분석 결과 없음)',
      company_note: companyNote,
      page_limit: String(pageLimit),
      mid_list: midList,
    });
    const { client, model } = getLlmClient();

    console.log(
      `[page allocation] items=${items.length} pageLimit=${pageLimit} prompt=${systemPrompt.length}자 model=${model}`,
    );

    const startedAt = Date.now();
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            '위 중분류 전부에 대해 [출력 형식]대로 JSON 배열만 출력하십시오. 설명·코드펜스 금지.',
        },
      ],
      max_tokens: 2500,
    });

    const choice = completion.choices[0];
    const rawContent = choice?.message?.content ?? '';
    const parsed = parseWeightArray(rawContent);
    const byN = new Map(parsed.map((p) => [p.n, p]));
    const weights = items.map((_, i) => byN.get(i + 1)?.weight ?? 5);
    const pages = allocatePages(weights, pageLimit);

    const allocations = items.map((it, i) => ({
      key: it.key,
      pages: pages[i]!,
      weight: weights[i]!,
      reason: byN.get(i + 1)?.reason ?? '',
    }));

    console.log(
      `[page allocation] done in ${Date.now() - startedAt}ms, parsed=${parsed.length}/${items.length}, sum=${pages.reduce((a, b) => a + b, 0)}p (target ${pageLimit})`,
    );

    res.json({
      allocations,
      pageLimit,
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
    console.error('[page allocation]', status, message);
    return next(
      new ApiError(status, 'LLM_REQUEST_FAILED', message, { cause: String(err) }),
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
