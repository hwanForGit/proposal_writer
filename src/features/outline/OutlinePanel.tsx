import { useEffect, useMemo, useState } from 'react';
import {
  CHARS_PER_PAGE,
  isTruncated,
  useWorkspaceStore,
} from '@/features/workspace/store';
import type {
  BodyState,
  OutlineStepState,
  PageAllocationState,
  SectionState,
  Step2State,
  Step3State,
} from '@/features/workspace/store';
import MarkdownView from './MarkdownView';
import SectionTreeView from './SectionTreeView';
import OutlineCompactTree from './OutlineCompactTree';
import { hasValidStructure, parseSection } from './sectionTree';
import {
  exportOutlineAsJson,
  exportOutlineAsMarkdown,
} from './exportOutline';
import ExportDialog from '@/features/export/ExportDialog';

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
  const retryCurrentBody = useWorkspaceStore((s) => s.retryCurrentBody);
  const continueCurrentBody = useWorkspaceStore((s) => s.continueCurrentBody);
  const setBodyMarkdown = useWorkspaceStore((s) => s.setBodyMarkdown);
  const nextBody = useWorkspaceStore((s) => s.nextBody);
  const setCurrentStep = useWorkspaceStore((s) => s.setCurrentStep);
  const setCurrentSectionIndex = useWorkspaceStore(
    (s) => s.setCurrentSectionIndex,
  );
  const setCurrentBodyIndex = useWorkspaceStore((s) => s.setCurrentBodyIndex);
  const runAll = useWorkspaceStore((s) => s.runAll);
  const stopAutoRun = useWorkspaceStore((s) => s.stopAutoRun);
  const autoRunActive = useWorkspaceStore((s) => s.autoRunActive);
  const autoRunStop = useWorkspaceStore((s) => s.autoRunStop);
  const pendingContinue = useWorkspaceStore((s) => s.pendingContinue);
  const resolveContinue = useWorkspaceStore((s) => s.resolveContinue);
  const pageLimit = useWorkspaceStore((s) => s.pageLimit);
  const setPageLimit = useWorkspaceStore((s) => s.setPageLimit);
  const pageAllocation = useWorkspaceStore((s) => s.pageAllocation);
  const generatePageAllocation = useWorkspaceStore(
    (s) => s.generatePageAllocation,
  );
  const resetAll = useWorkspaceStore((s) => s.resetAll);

  const pageByKey = useMemo(() => {
    const m = new Map<string, number>();
    if (pageAllocation.status === 'ready') {
      for (const it of pageAllocation.items) m.set(it.key, it.pages);
    }
    return m;
  }, [pageAllocation]);

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

  const { step1, step2, step3, currentStep } = outline;
  const currentSection = step2.sections[step2.currentSectionIndex];
  const currentBody = step3.bodies[step3.currentBodyIndex];
  const isStep1Generating = step1.status === 'generating';
  const isStep2Busy =
    step2.status === 'fetching-sections' ||
    currentSection?.status === 'generating';
  const isStep3Busy = currentBody?.status === 'generating';

  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    const busy = isStep1Generating || isStep2Busy || isStep3Busy;
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
  }, [isStep1Generating, isStep2Busy, isStep3Busy]);

  const hasAnything =
    step1.markdown != null || step2.sections.some((s) => s.markdown);

  const onExportJson = () => exportOutlineAsJson(outline);
  const onExportMd = () => exportOutlineAsMarkdown(outline);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

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
            <Stepper
              currentStep={currentStep}
              step1={step1}
              step2={step2}
              step3={step3}
              onJump={setCurrentStep}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasAnything && (
              <ResetButton
                onReset={() => {
                  if (
                    window.confirm(
                      '아웃라인 작업과 업로드한 파일을 모두 지웁니다. 계속할까요?',
                    )
                  )
                    resetAll();
                }}
              />
            )}
            {hasAnything && (
              <ExportMenu
                onJson={onExportJson}
                onMarkdown={onExportMd}
                onOpenDialog={() => setExportDialogOpen(true)}
              />
            )}
            {autoRunActive ? (
              <AutoRunIndicator
                stopRequested={autoRunStop}
                onStop={stopAutoRun}
              />
            ) : (
              <>
                {canGenerate && step2.status !== 'all-done' && (
                  <RunToOutlineButton onClick={() => runAll('step2')} />
                )}
                {canGenerate && step3.status !== 'all-done' && (
                  <RunAllButton
                    onClick={() => runAll('step3')}
                    started={hasAnything}
                  />
                )}
                <HeaderActions
                  currentStep={currentStep}
                  canGenerate={canGenerate}
                  step1={step1}
                  step2={step2}
                  step3={step3}
                  currentSection={currentSection}
                  currentBody={currentBody}
                  onStartStep1={generateStep1}
                  onProceedToStep2={proceedToStep2}
                  onRetryStep2Sections={retryStep2Sections}
                  onRetryCurrentSection={retryCurrentSection}
                  onNextSection={nextSection}
                  onProceedToStep3={proceedToStep3}
                  onRetryCurrentBody={retryCurrentBody}
                  onNextBody={nextBody}
                />
              </>
            )}
          </div>
        </div>
      </header>

      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
      />

      {pendingContinue && (
        <ContinueModal
          midTitle={pendingContinue.midTitle}
          onContinue={() => resolveContinue(true)}
          onStop={() => resolveContinue(false)}
        />
      )}

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
            onJumpSection={setCurrentSectionIndex}
            pageLimit={pageLimit}
            onSetPageLimit={setPageLimit}
            pageAllocation={pageAllocation}
            onGenerateAllocation={generatePageAllocation}
            pageByKey={pageByKey}
          />
        )}
        {currentStep === 3 && (
          <Step3View
            step3={step3}
            elapsedSec={elapsedSec}
            onContinueBody={continueCurrentBody}
            onSaveBody={(md) => setBodyMarkdown(step3.currentBodyIndex, md)}
            onJumpBody={setCurrentBodyIndex}
            pageByKey={pageByKey}
          />
        )}
      </div>
    </div>
  );
}

// ─── Reset button ──────────────────────────────────────────────────

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
      title="아웃라인 + 파일 모두 초기화"
    >
      초기화
    </button>
  );
}

// ─── Export menu ───────────────────────────────────────────────────

function ExportMenu({
  onJson,
  onMarkdown,
  onOpenDialog,
}: {
  onJson: () => void;
  onMarkdown: () => void;
  onOpenDialog: () => void;
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
        <div className="absolute right-0 z-10 mt-1 w-60 rounded border border-gray-200 bg-white py-1 shadow-md">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onOpenDialog();
              setOpen(false);
            }}
            className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs font-medium text-gray-800 hover:bg-gray-50"
          >
            📝 사업계획서 다운로드…
            <div className="mt-0.5 text-[10px] font-normal text-gray-500">
              표지 포함 · DOCX / PDF / Markdown
            </div>
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onMarkdown();
              setOpen(false);
            }}
            className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
          >
            Markdown (.md) — 원본
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
            JSON (.json) — 백업/복원
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Run-all (한 번에 끝까지) ──────────────────────────────────────

function RunToOutlineButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
      title="Step 1(사전 분석)과 Step 2(대분류·중분류 아웃라인 구조)까지만 자동으로 생성하고, 본문 작성 직전에 멈춥니다."
    >
      📑 아웃라인까지 자동
    </button>
  );
}

function RunAllButton({
  onClick,
  started,
}: {
  onClick: () => void;
  started: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
      title="Step 1부터 마지막 본문까지 자동으로 진행합니다. 본문이 분량 한도로 끊기면 이어쓸지 물어봅니다."
    >
      🚀 {started ? '이어서 끝까지 자동' : '한 번에 끝까지 작성'}
    </button>
  );
}

function AutoRunIndicator({
  stopRequested,
  onStop,
}: {
  stopRequested: boolean;
  onStop: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
        <span className="inline-block size-2 animate-pulse rounded-full bg-indigo-500" />
        {stopRequested ? '정지 중… (현재 작업 완료 후 멈춤)' : '자동 진행 중…'}
      </span>
      {!stopRequested && (
        <button
          type="button"
          onClick={onStop}
          className="rounded border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
        >
          정지
        </button>
      )}
    </div>
  );
}

// ─── 자동 진행 중 이어쓰기 확인 모달 ───────────────────────────────

function ContinueModal({
  midTitle,
  onContinue,
  onStop,
}: {
  midTitle: string;
  onContinue: () => void;
  onStop: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">
              본문이 분량 한도로 끊겼습니다
            </h3>
            <p className="mt-1 text-xs text-gray-600">
              <span className="font-medium text-gray-800">“{midTitle}”</span>{' '}
              본문이 <span className="font-mono">max_tokens</span> 한도에 닿아
              도중에 끊겼습니다. 이어서 마저 작성할까요?
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onStop}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            아니오 (여기서 멈춤)
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
          >
            예, 이어쓰고 계속
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Header actions ────────────────────────────────────────────────

interface HeaderActionsProps {
  currentStep: 1 | 2 | 3;
  canGenerate: boolean;
  step1: OutlineStepState;
  step2: Step2State;
  step3: Step3State;
  currentSection: SectionState | undefined;
  currentBody: BodyState | undefined;
  onStartStep1: () => void;
  onProceedToStep2: () => void;
  onRetryStep2Sections: () => void;
  onRetryCurrentSection: () => void;
  onNextSection: () => void;
  onProceedToStep3: () => void;
  onRetryCurrentBody: () => void;
  onNextBody: () => void;
}

function HeaderActions(p: HeaderActionsProps) {
  if (p.currentStep === 1) {
    const isGen = p.step1.status === 'generating';
    const isReady = p.step1.status === 'ready';
    return (
      <div className="flex shrink-0 gap-2">
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

  if (p.currentStep === 3) {
    if (p.step3.status === 'error') return null;
    if (p.step3.status === 'all-done') {
      return (
        <div className="flex shrink-0 gap-2">
          <span className="rounded bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
            ✓ 본문 작성 완료
          </span>
        </div>
      );
    }
    const body = p.currentBody;
    if (!body) return null;
    const isLast = p.step3.currentBodyIndex === p.step3.bodies.length - 1;
    if (body.status === 'generating') {
      return (
        <div className="flex shrink-0 gap-2">
          <span className="rounded bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
            본문 생성 중…
          </span>
        </div>
      );
    }
    if (body.status === 'error') {
      return (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={p.onRetryCurrentBody}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            다시 시도
          </button>
        </div>
      );
    }
    if (body.status === 'ready') {
      return (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={p.onNextBody}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            {isLast ? '본문 완료' : '다음 중분류'}
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
  step3: Step3State;
  onJump: (step: 1 | 2 | 3) => void;
}

function Stepper({ currentStep, step1, step2, step3, onJump }: StepperProps) {
  const step1Done = step1.status === 'ready';
  const step2HasData = step2.sections.length > 0;
  const step2Done = step2.status === 'all-done';
  const step3HasData = step3.bodies.length > 0;
  const step3Done = step3.status === 'all-done';
  const items: {
    num: 1 | 2 | 3;
    label: string;
    done: boolean;
    canJump: boolean;
  }[] = [
    { num: 1, label: '사전 분석', done: step1Done, canJump: step1Done },
    {
      num: 2,
      label: '아웃라인 구조',
      done: step2Done,
      canJump: step2HasData,
    },
    { num: 3, label: '본문 작성', done: step3Done, canJump: step3HasData },
  ];
  return (
    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
      {items.map((it, i) => {
        const isCurrent = it.num === currentStep;
        const clickable = it.canJump && !isCurrent;
        return (
          <div key={it.num} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => clickable && onJump(it.num)}
              disabled={!clickable}
              className={`flex items-center gap-1.5 rounded px-1 py-0.5 ${
                clickable
                  ? 'cursor-pointer hover:bg-gray-100'
                  : 'cursor-default'
              }`}
              title={
                clickable
                  ? `${it.label}으로 이동`
                  : isCurrent
                    ? '현재 단계'
                    : '아직 진행 안 됨'
              }
            >
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
              <span
                className={
                  isCurrent
                    ? 'font-medium text-gray-900'
                    : clickable
                      ? 'text-gray-700'
                      : ''
                }
              >
                {it.label}
              </span>
            </button>
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
  onJumpSection?: (index: number) => void;
  pageLimit: number | null;
  onSetPageLimit: (pages: number | null) => void;
  pageAllocation: PageAllocationState;
  onGenerateAllocation: () => void;
  pageByKey: Map<string, number>;
}

function Step2View({
  step2,
  step1Markdown,
  elapsedSec,
  onSaveSection,
  onJumpSection,
  pageLimit,
  onSetPageLimit,
  pageAllocation,
  onGenerateAllocation,
  pageByKey,
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

  // 대분류별 페이지 합계 (배분 결과가 있을 때)
  const sectionPageTotals = new Map<number, number>();
  if (pageAllocation.status === 'ready') {
    for (const it of pageAllocation.items) {
      sectionPageTotals.set(
        it.mainIndex,
        (sectionPageTotals.get(it.mainIndex) ?? 0) + it.pages,
      );
    }
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
              pages={sectionPageTotals.get(s.index)}
              onClick={
                s.status !== 'pending' && onJumpSection
                  ? () => onJumpSection(idx)
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      {/* 페이지 배분 패널 */}
      <AllocationPanel
        sections={step2.sections}
        pageLimit={pageLimit}
        onSetPageLimit={onSetPageLimit}
        pageAllocation={pageAllocation}
        onGenerate={onGenerateAllocation}
      />

      {/* 현재 대분류 본문 */}
      <CurrentSectionView
        section={step2.sections[step2.currentSectionIndex]!}
        elapsedSec={elapsedSec}
        onSave={onSaveSection}
      />

      {/* 전체 구조 트리 — 노드 제목만 들여쓰기로, 한 눈에 컴팩트하게 */}
      <OutlineCompactTree
        sections={step2.sections}
        currentSectionIndex={step2.currentSectionIndex}
        onJumpSection={onJumpSection}
        pageByKey={pageByKey}
      />
    </div>
  );
}

// ─── 페이지 배분 패널 ───────────────────────────────────────────────

function fmtPages(p: number): string {
  return Number.isInteger(p) ? `${p}` : p.toFixed(1);
}

function AllocationPanel({
  sections,
  pageLimit,
  onSetPageLimit,
  pageAllocation,
  onGenerate,
}: {
  sections: SectionState[];
  pageLimit: number | null;
  onSetPageLimit: (pages: number | null) => void;
  pageAllocation: PageAllocationState;
  onGenerate: () => void;
}) {
  const allReady =
    sections.length > 0 && sections.every((s) => s.status === 'ready');
  const generating = pageAllocation.status === 'generating';
  const total = pageAllocation.items.reduce((sum, it) => sum + it.pages, 0);

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-indigo-900">📐 페이지 배분</span>
        <span className="text-indigo-700">목표</span>
        <input
          type="number"
          min={1}
          max={300}
          value={pageLimit ?? ''}
          onChange={(e) => {
            const v = e.target.value.trim();
            onSetPageLimit(v === '' ? null : Number(v));
          }}
          placeholder="예: 20"
          className="w-20 rounded border border-indigo-300 px-2 py-1 text-right text-xs focus:border-indigo-500 focus:outline-none"
        />
        <span className="text-indigo-700">페이지</span>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!allReady || !pageLimit || generating}
          className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          title={
            !allReady
              ? '모든 대분류가 생성된 뒤 배분할 수 있습니다.'
              : '중요도·강점 기반으로 중분류별 페이지를 배분합니다.'
          }
        >
          {generating ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              배분 계산 중…
            </span>
          ) : pageAllocation.status === 'ready' ? (
            '다시 배분'
          ) : (
            '페이지 배분'
          )}
        </button>
      </div>

      {generating && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-indigo-700">
          <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
          중요도·강점을 분석해 중분류별 페이지를 배분하는 중… (보통 10~30초)
        </div>
      )}

      {!allReady && (
        <p className="mt-1.5 text-[11px] text-indigo-700/80">
          모든 대분류가 생성되면 배분할 수 있어요. (현재{' '}
          {sections.filter((s) => s.status === 'ready').length}/{sections.length})
        </p>
      )}

      {pageAllocation.status === 'error' && pageAllocation.error && (
        <p className="mt-1.5 text-[11px] text-red-600">
          {pageAllocation.error.message}
        </p>
      )}

      {pageAllocation.status === 'ready' && (
        <p className="mt-1.5 text-[11px] text-indigo-800">
          ✓ {pageAllocation.items.length}개 중분류에 총 ≈{fmtPages(total)}페이지
          배분됨. 아래 구조 트리에서 중분류별 장수를 확인하세요. 이 배분대로 본문
          분량이 조절됩니다.
        </p>
      )}
    </div>
  );
}

function SectionBadge({
  section,
  isCurrent,
  pages,
  onClick,
}: {
  section: SectionState;
  isCurrent: boolean;
  pages?: number;
  onClick?: () => void;
}) {
  const style =
    section.status === 'ready'
      ? 'bg-green-100 text-green-800 border-green-200'
      : section.status === 'generating'
        ? 'bg-blue-100 text-blue-800 border-blue-300'
        : section.status === 'error'
          ? 'bg-red-100 text-red-800 border-red-200'
          : 'bg-gray-100 text-gray-600 border-gray-200';
  const cursor = onClick ? 'cursor-pointer hover:brightness-95' : '';
  const label = `${section.index}. ${section.title.length > 15 ? section.title.slice(0, 15) + '…' : section.title}`;
  const pageTag =
    pages != null && pages > 0 ? (
      <span className="ml-1 font-semibold text-indigo-700">
        ≈{fmtPages(pages)}p
      </span>
    ) : null;
  const cls = `rounded border px-2 py-0.5 text-[10px] ${style} ${
    isCurrent ? 'ring-2 ring-blue-400' : ''
  }`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cls} ${cursor}`}
        title={`대분류 ${section.index}: ${section.title} (클릭하여 이동)`}
      >
        {label}
        {pageTag}
      </button>
    );
  }
  return (
    <span className={cls} title={`대분류 ${section.index}: ${section.title}`}>
      {label}
      {pageTag}
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
    const parsed = parseSection(section.markdown, section.title);
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
          {section.markdown && (
            <> · 출력 {section.markdown.length.toLocaleString()}자</>
          )}
        </div>
        <TruncationWarning finishReason={section.finishReason} />
        {useTree && onSave ? (
          <SectionTreeView
            markdown={section.markdown}
            fallbackTitle={section.title}
            onSave={onSave}
          />
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
        {state.markdown != null && (
          <> · 출력 {state.markdown.length.toLocaleString()}자</>
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

// ─── Step 3 View — 본문 작성 ────────────────────────────────────────

interface Step3ViewProps {
  step3: Step3State;
  elapsedSec: number;
  onContinueBody?: () => void;
  onSaveBody?: (next: string) => void;
  onJumpBody?: (index: number) => void;
  pageByKey: Map<string, number>;
}

function Step3View({
  step3,
  elapsedSec,
  onContinueBody,
  onSaveBody,
  onJumpBody,
  pageByKey,
}: Step3ViewProps) {
  if (step3.status === 'error' && step3.error) {
    return <ErrorView code={step3.error.code} message={step3.error.message} />;
  }
  if (step3.bodies.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        본문을 작성할 중분류가 없습니다. Step 2를 먼저 완료해주세요.
      </div>
    );
  }

  const current = step3.bodies[step3.currentBodyIndex]!;
  const currentTargetPages = pageByKey.get(
    `${current.ref.mainIndex}-${current.ref.midIndex}`,
  );

  return (
    <div className="space-y-4">
      {/* 진행 현황 */}
      <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
        <div className="mb-2 font-medium">
          본문 진행 {step3.currentBodyIndex + 1} / {step3.bodies.length} (중분류
          단위)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {step3.bodies.map((b, idx) => (
            <BodyBadge
              key={b.id}
              body={b}
              isCurrent={idx === step3.currentBodyIndex}
              pages={pageByKey.get(`${b.ref.mainIndex}-${b.ref.midIndex}`)}
              onClick={
                b.status !== 'pending' && onJumpBody
                  ? () => onJumpBody(idx)
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      {/* 현재 중분류 정보 */}
      <div className="rounded border border-blue-200 bg-blue-50/40 px-3 py-2">
        <div className="text-xs text-blue-700">
          📌 현재 작성 중: {current.ref.mainTitle}
        </div>
        <div className="mt-0.5 text-sm font-semibold text-blue-900">
          {current.ref.midTitle}
        </div>
      </div>

      {/* 본문 표시 */}
      <CurrentBodyView
        body={current}
        elapsedSec={elapsedSec}
        onContinue={onContinueBody}
        onSave={onSaveBody}
        targetPages={currentTargetPages}
      />
    </div>
  );
}

function BodyBadge({
  body,
  isCurrent,
  pages,
  onClick,
}: {
  body: BodyState;
  isCurrent: boolean;
  pages?: number;
  onClick?: () => void;
}) {
  const style =
    body.status === 'ready'
      ? 'bg-green-100 text-green-800 border-green-200'
      : body.status === 'generating'
        ? 'bg-blue-100 text-blue-800 border-blue-300'
        : body.status === 'error'
          ? 'bg-red-100 text-red-800 border-red-200'
          : 'bg-gray-100 text-gray-600 border-gray-200';
  const shortTitle = body.ref.midTitle
    .replace(/^\[중분류[^\]]*\]\s*/, '')
    .slice(0, 14);
  const label = `${body.ref.mainIndex}.${body.ref.midIndex + 1} ${shortTitle}${body.ref.midTitle.length > 14 ? '…' : ''}`;
  const pageTag =
    pages != null && pages > 0 ? (
      <span className="ml-1 font-semibold text-indigo-700">
        ≈{fmtPages(pages)}p
      </span>
    ) : null;
  const baseClass = `rounded border px-2 py-0.5 text-[10px] ${style} ${
    isCurrent ? 'ring-2 ring-blue-400' : ''
  }`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClass} cursor-pointer hover:brightness-95`}
        title={`${body.ref.mainTitle} > ${body.ref.midTitle} (클릭하여 이동)`}
      >
        {label}
        {pageTag}
      </button>
    );
  }
  return (
    <span
      className={baseClass}
      title={`${body.ref.mainTitle} > ${body.ref.midTitle}`}
    >
      {label}
      {pageTag}
    </span>
  );
}

function CurrentBodyView({
  body,
  elapsedSec,
  onContinue,
  onSave,
  targetPages,
}: {
  body: BodyState;
  elapsedSec: number;
  onContinue?: () => void;
  onSave?: (next: string) => void;
  targetPages?: number;
}) {
  if (body.status === 'pending') {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-gray-400">
        시작 준비 중…
      </div>
    );
  }
  // generating + 기존 markdown 없음 → 초기 생성 진행 표시
  if (body.status === 'generating' && !body.markdown) {
    return (
      <ProgressView
        title={`본문 생성 중: ${body.ref.midTitle}`}
        elapsedSec={elapsedSec}
      />
    );
  }
  if (body.status === 'error' && body.error) {
    return <ErrorView code={body.error.code} message={body.error.message} />;
  }
  if (body.markdown) {
    const truncated = isTruncated(body.finishReason);
    const isContinuing = body.status === 'generating'; // markdown 있는데 generating == 이어쓰기 중
    return (
      <div className="space-y-3">
        <div className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
          모델: <span className="font-mono">{body.modelId}</span>
          {body.elapsedMs != null && (
            <> · 누적 소요: {(body.elapsedMs / 1000).toFixed(1)}s</>
          )}
          {body.usage?.total_tokens != null && (
            <> · 토큰(마지막): {body.usage.total_tokens.toLocaleString()}</>
          )}
          <> · 출력 {body.markdown.length.toLocaleString()}자</>
          {targetPages != null && targetPages > 0 && (
            <span className="ml-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600">
              목표 ≈{fmtPages(targetPages)}p (~
              {Math.round(targetPages * CHARS_PER_PAGE).toLocaleString()}자)
            </span>
          )}
        </div>
        {isContinuing && (
          <div className="flex items-center gap-2 rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">
            <span className="inline-block size-2 animate-pulse rounded-full bg-blue-500" />
            이어쓰기 생성 중…{' '}
            <span className="font-mono tabular-nums">
              {formatElapsed(elapsedSec)}
            </span>
          </div>
        )}
        {truncated && !isContinuing && targetPages == null && (
          <BodyTruncationNotice
            markdown={body.markdown}
            onContinue={onContinue}
          />
        )}
        <MarkdownView
          markdown={body.markdown}
          editable={!!onSave && !isContinuing}
          onSave={onSave}
        />
      </div>
    );
  }
  return null;
}

function BodyTruncationNotice({
  markdown,
  onContinue,
}: {
  markdown: string;
  onContinue?: () => void;
}) {
  const tail = markdown
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-120);
  return (
    <div className="space-y-2 rounded border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
      <div>
        ⚠️ <span className="font-semibold">본문이 도중에 끊겼습니다</span>{' '}
        (max_tokens 한도). 마지막 단락이 미완성일 가능성이 큽니다.
      </div>
      <div className="rounded border border-amber-200 bg-white/60 px-2 py-1.5 font-mono text-[11px] text-amber-800">
        <span className="text-amber-600">…</span>
        {tail}
        <span className="ml-0.5 text-amber-600">▮</span>
      </div>
      {onContinue && (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onContinue}
            className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
          >
            이어서 작성
          </button>
          <span className="self-center text-[11px] text-amber-700">
            안 누르면 그대로 둡니다 — 직접 편집하거나 [다음 중분류]로 넘어가도
            돼요.
          </span>
        </div>
      )}
    </div>
  );
}

function TruncationWarning({ finishReason }: { finishReason: string | null }) {
  if (!isTruncated(finishReason)) return null;
  return (
    <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      ⚠️ 모델 출력이 <span className="font-mono">max_tokens</span> 한도에 닿아
      도중에 잘렸습니다. [이어서 작성]으로 마저 쓰거나, 더 짧게 작성되도록 다시
      시도할 수 있어요.
    </div>
  );
}
