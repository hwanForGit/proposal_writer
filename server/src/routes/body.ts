import { Router } from 'express';
import { ApiError } from '../middleware/error-handler.js';
import { config } from '../config.js';
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
  previousMarkdown?: string; // 이어쓰기 모드 — 있으면 이전 응답에 이어서 작성
  targetChars?: number; // 이 중분류에 배정된 목표 글자 수(페이지 배분). 없으면 기본 분량.
}

const isInputFile = (v: unknown): v is InputFile =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as InputFile).id === 'string' &&
  typeof (v as InputFile).name === 'string' &&
  typeof (v as InputFile).textContent === 'string';

const isBody = (v: unknown): v is BodySectionBody => {
  if (typeof v !== 'object' || v === null) return false;
  const b = v as BodySectionBody;
  return (
    Array.isArray(b.announcementFiles) &&
    b.announcementFiles.every(isInputFile) &&
    Array.isArray(b.companyFiles) &&
    b.companyFiles.every(isInputFile) &&
    typeof b.step1Markdown === 'string' &&
    typeof b.mainTitle === 'string' &&
    typeof b.midTitle === 'string' &&
    typeof b.midGuidance === 'string' &&
    typeof b.step2SectionMarkdown === 'string' &&
    (b.previousMarkdown === undefined ||
      typeof b.previousMarkdown === 'string') &&
    (b.targetChars === undefined || typeof b.targetChars === 'number')
  );
};

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
    previousMarkdown,
    targetChars,
  } = req.body;
  const isContinuation = !!previousMarkdown && previousMarkdown.length > 0;
  const hasTarget = typeof targetChars === 'number' && targetChars > 0;
  const INIT_CHUNK_CAP = 3200; // 초기 호출 1회 안전 상한(자)
  const CONT_CHUNK_CAP = 2200; // 이어쓰기 호출 1회 안전 상한(자)
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

    let userContent: string;
    let chunkChars: number; // 이번 회차에 기대하는 분량(자) — max_tokens 산정 기준
    if (isContinuation) {
      const prevLen = previousMarkdown!.length;
      if (hasTarget) {
        const remaining = Math.max(0, targetChars! - prevLen);
        if (remaining > 0) {
          const thisChunk = Math.min(remaining, CONT_CHUNK_CAP);
          chunkChars = thisChunk;
          userContent = `이번 회차의 대상 중분류는 "${midTitle}"입니다. 본 중분류의 전체 목표 분량은 약 ${targetChars}자이며, [이전 응답]까지 약 ${prevLen}자가 작성되었습니다. 남은 약 ${remaining}자를 이어서 작성하되 **이번 회차는 약 ${thisChunk}자 이내**로만 작성하십시오(한 번에 길게 쓰면 timeout). [이전 응답]의 마지막 지점에서 자연스럽게 이어 쓰고, 같은 내용 반복·재시작·재요약은 절대 금지. 목표 분량에 도달했으면 억지로 늘리지 말고 자연스럽게 마무리하십시오.

[이전 응답 (이어쓰기 대상)]
${previousMarkdown}`;
        } else {
          // 목표 분량 도달 — [이전 응답]이 토큰 한도로 잘렸을 때 '마지막 부분만' 매끄럽게 마무리.
          chunkChars = 800;
          userContent = `이번 회차의 대상 중분류는 "${midTitle}"입니다. 목표 분량에 이미 도달했습니다. [이전 응답]이 토큰 한도로 문장 중간에 끊겼으니, **끊긴 마지막 문장·단락만 자연스럽게 마무리하고 곧바로 종료**하십시오. 새 소주제·문단·표를 추가하지 말고, 반복·재요약은 절대 금지(보통 2~4문장이면 충분).

[이전 응답 (잘린 상태)]
${previousMarkdown}`;
        }
      } else {
        chunkChars = 2000;
        userContent = `이번 회차의 대상 중분류는 "${midTitle}"입니다. **이전 응답이 max_tokens 한도로 도중에 끊겼으므로**, 아래 [이전 응답]의 마지막 지점에서 **자연스럽게 이어서** 작성하십시오. 같은 내용 반복·재시작·재요약 절대 금지. 끊긴 단락부터 매끄럽게 이어 쓰되, **이어지는 부분만 1,500~2,000자 이내**로 간결히 마무리하십시오.

[이전 응답 (잘린 상태)]
${previousMarkdown}`;
      }
    } else if (hasTarget) {
      const thisChunk = Math.min(targetChars!, INIT_CHUNK_CAP);
      const willContinue = targetChars! > INIT_CHUNK_CAP;
      chunkChars = thisChunk;
      userContent = `이번 회차의 대상 중분류는 "${midTitle}"입니다. 다른 중분류는 절대 작성하지 마십시오. [Output Format]에 따라 본 중분류의 본문을 작성하십시오. 본 중분류의 목표 분량은 약 ${targetChars}자입니다. ${
        willContinue
          ? `한 번에 무리하지 말고 **이번 회차에는 약 ${thisChunk}자 이내**로 작성하십시오. 나머지는 이후 회차에서 이어서 채웁니다(한 번에 길게 쓰면 timeout).`
          : `**약 ${targetChars}자 내외**로 핵심 근거·정량 데이터·비교 표를 담아 완결성 있게 작성하십시오. 목표 분량을 크게 초과하지 마십시오.`
      } 군더더기·동어반복으로 분량만 늘리지는 마십시오.`;
    } else {
      chunkChars = 3500;
      userContent = `이번 회차의 대상 중분류는 "${midTitle}"입니다. 다른 중분류는 절대 작성하지 마십시오. [Output Format]에 따라 본 중분류의 본문을 작성하되, **응답 전체는 반드시 2,500~3,500자 이내로** 작성하십시오. 분량이 길어지면 timeout으로 작업이 중단됩니다.`;
    }

    // max_tokens를 이번 회차 목표 분량에 비례시켜 과도 생성을 막는다.
    //   한국어+마크다운 ≈ 1.3 tok/자 + 여유 마진. config 상한(초기/이어쓰기) 내로 클램프.
    //   부족하면 잘려도(finish=length) 이어쓰기 루프가 목표까지 채우므로 안전(특히 목표 있는 본문).
    const tokenCap = isContinuation
      ? config.bodyContinueMaxTokens
      : config.bodyMaxTokens;
    const maxTokens = Math.min(
      tokenCap,
      Math.max(800, Math.round(chunkChars * 1.3) + 200),
    );

    console.log(
      `[body section${isContinuation ? ' (continue)' : ''}] "${midTitle}" prompt=${systemPrompt.length}자 model=${model} target=${hasTarget ? targetChars : '-'} chunk=${chunkChars}자 max_tokens=${maxTokens}${
        isContinuation ? `, prev=${previousMarkdown.length}자` : ''
      }`,
    );

    const startedAt = Date.now();
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: maxTokens,
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
      `[body section${isContinuation ? ' (continue)' : ''}] "${midTitle}" done in ${Date.now() - startedAt}ms, output=${markdown.length}자, finish=${choice?.finish_reason}, completionTokens=${completion.usage?.completion_tokens ?? '-'}`,
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
