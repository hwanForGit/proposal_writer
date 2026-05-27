import OutlineTree from './OutlineTree';
import { DUMMY_OUTLINE } from './dummy';

export default function OutlinePanel() {
  return (
    <div className="flex h-full min-h-[400px] flex-col rounded-lg border border-gray-200 bg-white">
      <header className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">아웃라인</h2>
            <p className="text-xs text-gray-500">
              미리보기 (M7에서 실제 LLM 생성 결과로 대체됩니다)
            </p>
          </div>
          <button
            type="button"
            disabled
            title="M7에서 활성화됩니다"
            className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white opacity-50"
          >
            아웃라인 생성
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-auto p-3">
        <OutlineTree nodes={DUMMY_OUTLINE} />
      </div>
    </div>
  );
}
