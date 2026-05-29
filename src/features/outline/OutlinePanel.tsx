import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceStore } from '@/features/workspace/store';
import type {
  OutlineStepState,
  SectionState,
  Step2State,
} from '@/features/workspace/store';
import MarkdownView from './MarkdownView';
import SectionTreeView from './SectionTreeView';
import { hasValidStructure, parseSection } from './sectionTree';
import {
  exportOutlineAsJson,
  exportOutlineAsMarkdown,
} from './exportOutline';

const formatElapsed = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function OutlinePanel() {
  const files = useWorkspaceStore((s) => s.files);
  const outline = useWorkspaceStore((s) => s.outline);
  const generateStep1 = useWorkspaceStore((s) => s.generateStep1);
  const proceedToStep2 = useWorkspaceStore((s) => s.proceedToStep2);
  const retryStep2Sections = useWorkspaceStore((s) => s.retryStep2Sections);
  const retryCurrentSection = useWorkspaceStore((s) => s.retryCurrentSection);
  const setSectionMarkdown = useWorkspaceStore((s) => s.setSectionMarkdown);
  const nextSection = useWorkspaceStore((s) => s.nextSection);
  const proceedToStep3 = useWorkspaceStore((s) => s.proceedToStep3);
  const resetOutline = useWorkspaceStore((s) => s.resetOutline);

  const { canGenerate, reason } = useMemo<{
    canGenerate: boolean;
    reason: string;
  }>(() => {
    if (files.length === 0)
      return { canGenerate: false, reason: '파일을 업로드해주세요.' };
    if (files.some((f) => f.status === 'uploading'))
      return { canGenerate: false, reason: '파일 추출이 끝나기를 기다리는 중…' };
    const parsedAnnouncement = files.some(
      (f) => f.category === 'announcement' && f.status === 'parsed',
    );
    if (!parsedAnnouncement)
      return {
        canGenerate: false,
        reason: '공고·양식 파일이 1개 이상 필요합니다.',
      };
    const hasCompany = files.some(
      (f) => f.category === 'company' && f.status === 'parsed',
    );
    return {
      canGenerate: true,
      reason: hasCompany
        ? '준비 완료. "Step 1 시작"을 눌러주세요.'
        : '회사 정보 파일 없이도 진행 가능합니다. 공고·양식과 온라인 우수 사례 기반으로 작성됩니다.',
    };
  }, [files]);

  const { step1, step2, currentStep } = outline;
  const currentSection = step2.sections[step2.currentSectionIndex];
  const isStep1Generating = step1.status === 'generating';
  const isStep2Busy =
    step2.status === 'fetching-sections' ||
    currentSection?.status === 'generating';

  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    const busy = isStep1Generating || isStep2Busy;
    if (!busy) {
      setElapsedSec(0);
      return;
    }
    const start = Date.now();
    setElapsedSec(0);
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [isStep1Generating, isStep2Busy]);

  const hasAnything =
    step1.markdown != null || step2.sections.some((s) => s.markdown);

  const onExportJson = () => exportOutlineAsJson(outline);
  const onExportMd = () => exportOutlineAsMarkdown(outline);

  return (
    <div className="flex h-full min-h-[400px] flex-col rounded-lg border border-gray-200 bg-white">
      <header className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">
              아웃라인{' '}
              <span className="ml-2 text-[10px] font-normal text-gray-400">
                자동 저장됨 (localStorage)
              </span>
            </h2>
            <Stepper currentStep={currentStep} step1={step1} step2={step2} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasAnything && (
              <ExportMenu onJson={onExportJson} onMarkdown={onExportMd} />
            )}
            <HeaderActions
              currentStep={currentStep}
              canGenerate={canGenerate}
              step1={step1}
              step2={step2}
              currentSection={currentSection}
              onStartStep1={generateStep1}
              onProceedToStep2={proceedToStep2}
              onRetryStep2Sections={retryStep2Sections}
              onRetryCurrentSection={retryCurrentSection}
              onNextSection={nextSection}
              onProceedToStep3={proceedToStep3}
              onReset={resetOutline}
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {currentStep === 1 && (
          <StepView
            state={step1}
            title="사전 분석 (벤치마킹 + 사업 수주 핵심 전략)"
            elapsedSec={elapsedSec}
            reason={reason}
            // 사전 분석은 read-only 가이드 — onSave 미전달
          />
        )}
        {currentStep === 2 && (
          <Step2View
            step2={step2}
            step1Markdown={step1.markdown}
            elapsedSec={elapsedSec}
            onSaveSection={(md) =>
              setSectionMarkdown(step2.currentSectionIndex, md)
            }
          />
        )}
        {currentStep === 3 && (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-400">
            Step 3 (본문 작성)은 다음 마일스톤에서 추가됩니다.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Export menu ───────────────────────────────────────────────────

function ExportMenu({
  onJson,
  onMarkdown,
}: {
  onJson: () => void;
  onMarkdown: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
      >
        내보내기 ▾
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-40 rounded border border-gray-200 bg-white py-1 shadow-md">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onMarkdown();
              setOpen(false);
            }}
            className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
          >
            Markdown (.md)
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onJson();
              setOpen(false);
            }}
            className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
          >
            JSON (.json)
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Header actions ────────────────────────────────────────────────

interface HeaderActionsProps {
  currentStep: 1 | 2 | 3;
  canGenerate: boolean;
  step1: OutlineStepState;
  step2: Step2State;
  currentSection: SectionState | undefined;
  onStartStep1: () => void;
  onProceedToStep2: () => void;
  onRetryStep2Sections: () => void;
  onRetryCurrentSection: () => void;
  onNextSection: () => void;
  onProceedToStep3: () => void;
  onReset: () => void;
}

function HeaderActions(p: HeaderActionsProps) {
  if (p.currentStep === 1) {
    const isGen = p.step1.status === 'generating';
    const isReady = p.step1.status === 'ready';
    return (
      <div className="flex shrink-0 gap-2">
        {isReady && (
          <button
            type="button"
            onClick={p.onReset}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            지우기
          </button>
        )}
        {!isReady && (
          <button
            type="button"
            onClick={p.onStartStep1}
            disabled={!p.canGenerate || isGen}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGen
              ? '생성 중…'
              : p.step1.status === 'error'
                ? '다시 시도'
                : 'Step 1 시작'}
          </button>
        )}
        {isReady && (
          <button
            type="button"
            onClick={p.onProceedToStep2}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            다음: Step 2
          </button>
        )}
      </div>
    );
  }

  if (p.currentStep === 2) {
    // 대분류 목록 추출 단계
    if (p.step2.status === 'fetching-sections') {
      return (
        <div className="flex shrink-0 gap-2">
          <span className="rounded bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
            대분류 목록 추출 중…
          </span>
        </div>
      );
    }
    if (p.step2.status === 'error') {
      return (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={p.onRetryStep2Sections}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            대분류 목록 다시 시도
          </button>
        </div>
      );
    }
    if (p.step2.status === 'all-done') {
      return (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={p.onProceedToStep3}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            다음: Step 3
          </button>
        </div>
      );
    }
    // in-progress: 현재 section 상태별
    const sec = p.currentSection;
    if (!sec) return null;
    const isLast = p.step2.currentSectionIndex === p.step2.sections.length - 1;
    if (sec.status === 'generating') {
      return (
        <div className="flex shrink-0 gap-2">
          <span className="rounded bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
            대분류 {sec.index} 생성 중…
          </span>
        </div>
      );
    }
    if (sec.status === 'error') {
      return (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={p.onRetryCurrentSection}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            다시 시도
          </button>
        </div>
      );
    }
    if (sec.status === 'ready') {
      return (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={p.onNextSection}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            {isLast ? '대분류 완료 (Step 3로)' : `다음: 대분류 ${sec.index + 1}`}
          </button>
        </div>
      );
    }
    return null;
  }

  return null;
}

// ─── Idle guide (빈 상태 — 처음 사용자에게 흐름 안내) ─────────────

function IdleGuide({ reason }: { reason: string }) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-4 px-2 text-sm">
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3 text-xs text-blue-900">
        <div className="font-semibold">💡 사용 흐름</div>
        <ol className="mt-2 space-y-1 pl-4">
          <li>
            <span className="font-medium">1.</span> 좌측에 공고·양식 파일과
            (선택) 회사 정보 파일 업로드
          </li>
          <li>
            <span className="font-medium">2.</span>{' '}
            <span className="font-semibold">Step 1</span> — 벤치마킹 + 사업 수주
            핵심 전략 자동 생성
          </li>
          <li>
            <span className="font-medium">3.</span>{' '}
            <span className="font-semibold">Step 2</span> — 영역별 대분류 →
            중분류·소분류 순차 작성 + 인라인 편집
          </li>
          <li>
            <span className="font-medium">4.</span> Markdown / JSON
            <span className="text-blue-700"> 내보내기</span>
          </li>
        </ol>
      </div>
      <div className="text-center text-gray-500">{reason}</div>
      <div className="text-center text-[11px] text-gray-400">
        ⚠️ 사내 LLM Gateway 호출 — VPN이 켜져 있어야 합니다.
      </div>
    </div>
  );
}

// ─── Stepper ────────────────────────────────────────────────────────

interface StepperProps {
  currentStep: 1 | 2 | 3;
  step1: OutlineStepState;
  step2: Step2State;
}

function Stepper({ currentStep, step1, step2 }: StepperProps) {
  const step1Done = step1.status === 'ready';
  const step2Done = step2.status === 'all-done';
  const items: { num: 1 | 2 | 3; label: string; done: boolean }[] = [
    { num: 1, label: '사전 분석', done: step1Done },
    { num: 2, label: '아웃라인 구조', done: step2Done },
    { num: 3, label: '본문 작성', done: false },
  ];
  return (
    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
      {items.map((it, i) => {
        const isCurrent = it.num === currentStep;
        return (
          <div key={it.num} className="flex items-center gap-2">
            <span
              className={`inline-flex size-4 items-center justify-center rounded-full text-[10px] font-medium ${
                it.done
                  ? 'bg-green-500 text-white'
                  : isCurrent
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-500'
              }`}
            >
              {it.done ? '✓' : it.num}
            </span>
            <span className={isCurrent ? 'font-medium text-gray-900' : ''}>
              {it.label}
            </span>
            {i < items.length - 1 && <span className="text-gray-300">›</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1/2 공용: 단일 마크다운 카드 ────────────────────────────

interface StepViewProps {
  state: OutlineStepState;
  title: string;
  elapsedSec: number;
  reason: string;
  onSave?: (next: string) => void;
}

function StepView({ state, title, elapsedSec, reason, onSave }: StepViewProps) {
  if (state.status === 'idle') {
    return <IdleGuide reason={reason} />;
  }
  if (state.status === 'generating' && !state.markdown) {
    return <ProgressView title={title} elapsedSec={elapsedSec} />;
  }
  if (state.status === 'error' && state.error) {
    return <ErrorView code={state.error.code} message={state.error.message} />;
  }
  if (state.markdown) {
    return <ResultView state={state} onSave={onSave} />;
  }
  return null;
}

// ─── Step 2 ───────────────────────────────────────────────────────

interface Step2ViewProps {
  step2: Step2State;
  step1Markdown: string | null;
  elapsedSec: number;
  onSaveSection?: (next: string) => void;
}

function Step2View({
  step2,
  step1Markdown,
  elapsedSec,
  onSaveSection,
}: Step2ViewProps) {
  if (step2.status === 'fetching-sections') {
    return <ProgressView title="대분류 목록 추출 중" elapsedSec={elapsedSec} />;
  }
  if (step2.status === 'error' && step2.error) {
    return <ErrorView code={step2.error.code} message={step2.error.message} />;
  }
  if (step2.sections.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        대분류 목록이 비어있습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step 1 결과 접힘 */}
      {step1Markdown && (
        <details className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          <summary className="cursor-pointer font-medium text-gray-800">
            Step 1 결과 (벤치마킹 + 핵심 전략)
          </summary>
          <div className="mt-2">
            <MarkdownView markdown={step1Markdown} />
          </div>
        </details>
      )}

      {/* 대분류 진행 현황 */}
      <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
        <div className="mb-2 font-medium">
          대분류 진행 {step2.currentSectionIndex + 1} / {step2.sections.length}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {step2.sections.map((s, idx) => (
            <SectionBadge
              key={s.index}
              section={s}
              isCurrent={idx === step2.currentSectionIndex}
            />
          ))}
        </div>
      </div>

      {/* 현재 대분류 본문 */}
      <CurrentSectionView
        section={step2.sections[step2.currentSectionIndex]!}
        elapsedSec={elapsedSec}
        onSave={onSaveSection}
      />

      {/* 완료된 이전 대분류들 (접힘) */}
      {step2.sections
        .slice(0, step2.currentSectionIndex)
        .filter((s) => s.status === 'ready')
        .map((s) => (
          <details
            key={s.index}
            className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs"
          >
            <summary className="cursor-pointer font-medium text-gray-800">
              ✓ [대분류 {s.index}] {s.title}
            </summary>
            <div className="mt-2">
              <MarkdownView markdown={s.markdown ?? ''} />
            </div>
          </details>
        ))}
    </div>
  );
}

function SectionBadge({
  section,
  isCurrent,
}: {
  section: SectionState;
  isCurrent: boolean;
}) {
  const style =
    section.status === 'ready'
      ? 'bg-green-100 text-green-800 border-green-200'
      : section.status === 'generating'
        ? 'bg-blue-100 text-blue-800 border-blue-300'
        : section.status === 'error'
          ? 'bg-red-100 text-red-800 border-red-200'
          : 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] ${style} ${
        isCurrent ? 'ring-2 ring-blue-400' : ''
      }`}
      title={`대분류 ${section.index}: ${section.title}`}
    >
      {section.index}. {section.title.length > 15 ? section.title.slice(0, 15) + '…' : section.title}
    </span>
  );
}

function CurrentSectionView({
  section,
  elapsedSec,
  onSave,
}: {
  section: SectionState;
  elapsedSec: number;
  onSave?: (next: string) => void;
}) {
  if (section.status === 'generating' && !section.markdown) {
    return (
      <ProgressView
        title={`[대분류 ${section.index}] ${section.title} 생성 중`}
        elapsedSec={elapsedSec}
      />
    );
  }
  if (section.status === 'error' && section.error) {
    return <ErrorView code={section.error.code} message={section.error.message} />;
  }
  if (section.markdown) {
    const parsed = parseSection(section.markdown);
    const useTree = hasValidStructure(parsed);
    return (
      <div className="space-y-3">
        <div className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
          모델: <span className="font-mono">{section.modelId}</span>
          {section.elapsedMs != null && (
            <> · 소요: {(section.elapsedMs / 1000).toFixed(1)}s</>
          )}
          {section.usage?.total_tokens != null && (
            <> · 토큰: {section.usage.total_tokens.toLocaleString()}</>
          )}
        </div>
        <TruncationWarning finishReason={section.finishReason} />
        {useTree && onSave ? (
          <SectionTreeView markdown={section.markdown} onSave={onSave} />
        ) : (
          <MarkdownView
            markdown={section.markdown}
            editable={!!onSave}
            onSave={onSave}
          />
        )}
      </div>
    );
  }
  return null;
}

// ─── 공용 view 조각 ────────────────────────────────────────────────

function ProgressView({
  title,
  elapsedSec,
}: {
  title: string;
  elapsedSec: number;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="w-full max-w-md">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div className="animate-progress-slide h-full w-1/4 rounded-full bg-blue-500" />
        </div>
      </div>
      <div className="text-sm text-gray-700">
        {title}…{' '}
        <span className="font-mono tabular-nums">
          {formatElapsed(elapsedSec)}
        </span>
      </div>
      <p className="text-xs text-gray-500">
        평균 10~60초 정도. 응답이 짧으므로 timeout 거의 안 납니다.
      </p>
    </div>
  );
}

function ErrorView({ code, message }: { code: string; message: string }) {
  return (
    <div className="space-y-2">
      <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        <div className="font-medium">{code}</div>
        <div className="mt-1 whitespace-pre-wrap">{message}</div>
      </div>
      <p className="text-xs text-gray-500">
        VPN이 켜져 있는지, <span className="font-mono">.env</span>의{' '}
        <span className="font-mono">OPENAI_API_KEY</span> /{' '}
        <span className="font-mono">OPENAI_BASE_URL</span>이 사내 가이드대로
        설정됐는지 확인해주세요.
      </p>
    </div>
  );
}

function ResultView({
  state,
  onSave,
}: {
  state: OutlineStepState;
  onSave?: (next: string) => void;
}) {
  const readOnly = !onSave;
  return (
    <div className="space-y-3">
      <div className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
        모델: <span className="font-mono">{state.modelId}</span>
        {state.elapsedMs != null && (
          <> · 소요: {(state.elapsedMs / 1000).toFixed(1)}s</>
        )}
        {state.usage?.total_tokens != null && (
          <> · 토큰: {state.usage.total_tokens.toLocaleString()}</>
        )}
      </div>
      <TruncationWarning finishReason={state.finishReason} />
      {readOnly && (
        <div className="rounded border border-blue-200 bg-blue-50/60 px-3 py-2 text-xs text-blue-900">
          📋 <span className="font-semibold">참고 자료</span> — 이 단계의 분석
          결과는 다음 단계(Step 2)의 컨텍스트로 사용됩니다. 본 화면에서는
          편집되지 않고, 헤더의 [내보내기]로 다운로드할 수 있습니다.
        </div>
      )}
      <MarkdownView
        markdown={state.markdown ?? ''}
        editable={!readOnly}
        onSave={onSave}
      />
    </div>
  );
}

function TruncationWarning({ finishReason }: { finishReason: string | null }) {
  if (finishReason !== 'length') return null;
  return (
    <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      ⚠️ 모델 출력이 <span className="font-mono">max_tokens</span> 한도(8000)에
      닿아 도중에 잘렸습니다. 더 짧게 작성되도록 다시 시도하거나, max_tokens를
      늘려야 할 수 있어요.
    </div>
  );
}
