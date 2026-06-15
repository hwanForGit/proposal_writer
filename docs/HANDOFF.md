# HANDOFF — Claude 세션 이어가기 가이드

이 파일은 새 세션·새 머신에서 Claude가 컨텍스트를 빠르게 복원하기 위한 노트입니다. 사람이 읽어도 OK.

## 한 줄로 시작하기

새 세션을 열어 첫 메시지로:
```
docs/HANDOFF.md 읽고 이어서 진행하자
```
또는 구체적으로:
```
검증 샘플 보정 진행 / Phase 4 (배포) 시작 / M9 (드래그 정렬) 진행 / 새 기능 [...]
```
Claude가 README.md → 이 파일 → `docs/prd_*_spec.md` → `git log` 순으로 읽어 컨텍스트를 복원합니다.

---

## 현재 진행 상태 (2026-06-15)

### 완료된 마일스톤
- **Phase 1** (M1~M8, M10, M11) — 파일 업로드·LLM 연동·트리 편집기·localStorage·UX
- **Phase 2** (Step 3 본문) — 중분류 단위 본문 작성, 이어쓰기, 편집
- **Phase 3** (M23~M27) — 통합 마크다운, DOCX/PDF 다운로드, 서식 검증 샘플, "한컴 HWPX 저장" 안내

### 2026-06-12~15 세션 (다음 세션 이어가기용) ★
이번 세션 주요 작업(대부분 commit 됨 — `git log` 확인, 마지막 커밋 `d28ab1b` 이후 분량/DOCX 추가 작업 commit 예정):
1. **사업비 계산 탭 대규모 확장** (commit `e4744c2`, `b054c65`)
   - 금액 단위 선택(원/천원/만원/백만원, `amountUnit`), 입력 Enter/blur 지연 적용(`MoneyInput`/`NumInput`, 노란 테두리 안내), 전체 UI slate/indigo 모던 정비.
   - **잠금 기반 자동계산 solver**(`Member.salaryLocked/monthsLocked/locked`): 고정값 불변, 미고정만 투입률→참여개월→연봉 순 조정. 잔여 자동 인력 추가(`auto`, 행잠금하면 유지).
   - **작성 연봉 vs 사업계획서 연봉**(`grossSalary.ts` `calculateGrossSalary` = 4대보험 9.5%+퇴직 8.33%, Vitest `npm test`). `salaryMode` 토글. persist labor **v11**.
   - **사업비 총괄표**(`features/budget/store.ts` + `BudgetTable`): 대/중분류, 정부출연금·민간(현금·현물·소계)·합계·구성비, 출처별 예산/사용/잔여, CSV/엑셀/MD 내보내기.
   - 정부출연금 인건비 한도 = 총사업비×N% − **자부담금 전체(pc.selfFund)**.
2. **본문 생성 안정화** (commit `d28ab1b`)
   - 경과 타이머 `startedAt` 기준(섹션 이동에도 0초 초기화 안 됨), 504 시 목표 분량 0.6배씩 4회 재시도, max_tokens를 회차 목표 자수에 비례(과도 생성 억제)+잘리면 매끄럽게 끝날 때까지 이어쓰기, Step2 프롬프트에 공고·양식 세부목차/지침 준수 원칙.
   - 다운로드: 가이드를 앰버 인용블록으로 분리 + 본문 라벨/구분선, **'본문만' 다운로드 범위** 신설.
3. **(마지막 미커밋분)** DOCX 글씨크기(대15/중13/소11/본문10pt)+묶음 간격 — `docx.ts` jszip 후처리(pandoc 검증 완료). `proceedToStep3`가 **페이지 배분 자동 생성**(목표 페이지 설정 시 본문 생성 전 보장).

### ⚠️ 미해결/검증 필요 (다음 세션 우선)
- **본문 페이지 수 과다** — 30p 목표인데 130p→90p로 줄었으나 아직 초과. 원인 추정: (a) 페이지 배분 미적용(→자동생성으로 해결됨, **재생성 후 검증 필요**), (b) 'full' 다운로드는 가이드가 ~절반(→'본문만' 사용), (c) `CHARS_PER_PAGE`(현 1300, `workspace/store.ts`) 실제 렌더 밀도와 불일치 가능. **다음 세션: 본문 재생성 → '본문만' 다운로드 → 백엔드 로그 `output=N자` & 실제 페이지수로 `CHARS_PER_PAGE` 캘리브레이션.**
- 서버 `exporters/pdf.ts`의 `waitUntil:'networkidle0'` 타입에러(기존, tsx 런타임 무관) — 정리 가능.

### 2026-06-11 추가 작업 (★ commit 대기 중일 수 있음 — git log 확인)
- **좌측 사이드바 탭 뷰** — `RootLayout`을 좌측 사이드바로 개편. 탭: **[계획서 작성]**(`/` = 기존 `WorkspacePage`) / **[사업비 계산]**(`/labor-cost` = `LaborCostPage`). 두 기능 독립. (`routes/index.tsx`, `RootLayout.tsx`, `pages/LaborCostPage.tsx`)
- **사업비 계산 탭 (신규 기능 전체)** — 제안서 작성과 별개. 산출 후 복사해서 계획서에 붙여넣는 용도.
  - **상태 store 2개**: `src/features/labor/store.ts`(용역비/인건비, persist `proposal_writer.labor.v1` v9), `src/features/projectCost/store.ts`(총사업비, persist `proposal_writer.projectcost.v1`). 클립보드: `src/lib/clipboard.ts`(비-secure context 폴백).
  - **① 총 사업비 섹션**: 정부지원금 + 자부담 비율(%, **총사업비 대비**) → 자부담금·총사업비 자동(`총사업비 = 정부지원금 ÷ (1−자부담비율)`). 자부담금 중 현금 비율(%) → 현금/현물 자동.
  - **② 용역비(인건비) 계산**: `인건비 = 연봉총액(or 월단가) × 투입률 × (참여개월÷12)`. 단가 기준 **연봉/월단가 토글**. 금액 입력 **천 단위 콤마 자동**(`MoneyInput`). 산출 인건비 **천원 단위 내림**(`floorTo`).
  - **사업 기간(개월)** 입력 — 참여개월 자동 조정 상한.
  - **지출 출처 예산**(현물/정부출연금/현금) — `💰 총 사업비에서 가져오기` 버튼으로 채움(편집 가능). 패널은 출처별 **예산·배정 합계·잔여/초과** 요약.
  - **정부출연금 인건비 한도 = 총사업비의 N%** 입력(0=미사용). 사용 시 정부출연금 예산 = `max(0, 총사업비×N% − 자부담 현물)` 자동(읽기전용). 페이지 `useEffect`로 총사업비/현물 변동 시 동기화.
  - **인력 행**: 성명/역할(+행 전체 고정 `🔒`), 연봉(+고정 체크), 참여개월(+고정 체크), 투입률(고정값 또는 **범위=최대 상한선만**), **출처 드롭다운**(현물/정부/현금).
  - **⚙️ 자동 계산하기 = 잠금 인지 맞춤 solver (2026-06-12 전면 재작성, 사용자 요청)** — 핵심 모델 변경:
    - **고정(잠금)된 값은 절대 안 바꾸고, 고정 안 한 값만 줄여** 출처 예산에 맞춤. 각 차원의 **입력값이 상한**, 그 이하로만 축소.
    - **잠금 단위 3개**: `Member.salaryLocked`(연봉), `Member.monthsLocked`(개월), 투입률은 기존 `mode` 고정/범위(고정=잠금). + **행 전체 잠금** `Member.locked`(연봉·개월·투입률 전부 불변, 자동계산 제외). UI는 `LockCheck` 체크박스.
    - **한 인력에서 조정 우선순위(자유 차원 중 1개만)**: 투입률(범위) → 참여개월 → 연봉총액.
    - bucket(현물→정부→현금) ① 상한값으로 통째 FFD 배정 → ② 남는 예산은 **자유 차원이 있는 '가장 작은' 미배정 1명**을 경계로 `fitBoundary`가 정확 소진.
    - **`fitBoundary` = 투입률→참여개월→연봉 순 차례 축소(2026-06-12, 사용자 요청)** — 자유 차원을 우선순위대로 '산출 ≥ B 유지하는 최소'까지 줄임. 투입률은 정수%, 연봉은 연속이라 보통 1,000원 미만까지 맞춰짐 → **`costAdjust`(음수)는 최후·1,000원 미만 잔차만**. (연봉 자유면 costAdjust≈0; 연봉 고정 등 불가피할 때만 정수율 한계의 소액.)
    - **잔여 자동 채움 유지**: 위로도 출처 예산이 남으면 임의 인력(`auto:true`, 밴드 연봉·만월)을 큰 단가부터 생성. 마지막 1명은 `fitBoundary` 재사용(밴드 연봉 유지·투입률↓·연봉 미세조정 → costAdjust≈0). 표에 `자동` 뱃지. **재계산 때 (행 잠금 안 한) auto 인력은 버리고 재생성** — 필터 `!m.auto || m.locked`. 🔒 잠그면 유지.
    - **🔒 행 잠금(`locked`) 인력은 자동계산이 전혀 안 건드림** — pre-pass에서 `memberCost`(costAdjust 포함)만큼 자기 출처 예산을 선차감하고 `done` 처리, `updated`에서 원본 그대로 반환(`return m`). 자유 차원 없는(전부 고정) 미배정 인력은 입력값 그대로(초과 표시), 자유 차원 있는 미배정은 산출 0(제외).
    - `assign` 값 = `{source, salary, months, rate, costAdjust}`. 자동 생성 seq는 잠금 유지된 auto 수에서 이어쓰기.
  - **전역 최소 참여개월(`minMonths`)** — 자동계산이 개월을 줄일 때의 전 인력 공통 하한(`지출 출처 예산` 헤더, 사업 기간 옆 입력).
  - **투입률 정수% 강제** — UI 투입률/최대율 입력 `Math.round`+`step=1`. 자동계산 산출 투입률도 올림 정수%.
  - persist v5→**v9** (v6 per-member minMonths 폐기 → v7 전역 minMonths → v8 잠금 필드 추가 → v9 auto 복구).
  - **작성/사업계획서 연봉(2026-06-12)** — `Member.salary`=**작성 연봉**(입력값, base). **사업계획서 연봉**=급여총액=작성연봉+4대보험(9.5%)+퇴직충당금(8.33%), `src/features/labor/grossSalary.ts`의 `calculateGrossSalary`(원 반올림, Vitest 테스트 `grossSalary.test.ts`, `npm test`). 인력 표에 **사업계획서 연봉 컬럼**(자동, 읽기전용) 신설. store `salaryMode`('written'|'plan', 기본 plan)로 인건비 계산에 쓸 연봉 선택 — `effectiveSalary`/`unitCost`/`memberCost`/`totalCost`/`sourceSums`에 `mode` 인자 추가, autoCalculate는 `grossOf`로 base→급여총액 환산(salary 차원 보정에 grossMul 근사+실측). UI `인건비 기준` 토글 + 활성 연봉 칸 indigo 강조. persist v10→**v11**. (Vitest devDep 추가, `test` 스크립트.)
  - **입력 지연 적용(2026-06-12)** — 숫자·금액 입력은 실시간 반영이 아니라 **Enter/blur 시 적용**. `MoneyInput`·`NumInput` 모두 로컬 draft를 들고 있다가 Enter(또는 칸 밖 클릭)에 commit(값이 실제 바뀐 경우만 → setSource* 부작용 방지), Esc는 취소. 입력 중엔 **노란 테두리(ring-amber)** + 툴팁으로 "적용 대기" 표시, 최상단에 안내 배너 상시 노출. 이름 등 텍스트 입력은 기존대로 실시간.
  - **금액 표시 단위(2026-06-12)** — store `amountUnit`(`won`/`thousand`/`tenK`/`million`, `UNIT_META`). 최상단 버튼으로 선택. `useUnit`/`useFmtWon` 훅으로 표시(`fmtWon`)와 입력(`MoneyInput`) 모두 단위 환산(저장은 항상 원, 표시·입력은 정수 환산·내보내기도 단위 반영). persist v9→**v10**. 긴 금액 줄바꿈 방지로 표시 셀에 `whitespace-nowrap`.
  - **사업비 총괄표 다운로드**: CSV(UTF-8 BOM)/엑셀(TSV)/Markdown, 단위 머리말 포함. 총괄표 footer에 출처별 사용 합계·총사업비(예산)·잔여(녹색/초과 빨강) 표시, 합계부 컬럼명 반복.
  - **결과 복사**: Markdown 표 / 엑셀(탭 구분).
  - 참고 문서: `docs/[별표 2]…`, `docs/별첨3…` PDF (국가연구개발사업 비목별 계상기준 — 인건비 산식 근거).
  - **미해결/다음 후보**: FFD는 여전히 휴리스틱(정수 개월·천원 내림으로 소액 잔여 가능, 전역 최적 아님). 연구수당/간접비 비목 / 참여개월 0.5단위 정밀화는 보류.

### 2026-06-02 추가 작업 (commit 됨)
1. **Step 2 첫 대분류 파서 보정** — 사용자 보고: "1. 제안개요"가 빈 `[]`로 표시되고 트리에 `##`/`###` 마커가 노출되는 이슈. LLM이 첫 호출에서 가끔 `[1. 제안개요]` 헤더를 비우거나 `[중분류 X.Y]` 대신 마크다운 헤딩(`## 1.1 ...`)을 출력하는 경우 대비.
   - `src/features/outline/sectionTree.ts`: `stripFormat`이 leading `#+` 제거, `parseSection(md, fallbackTitle?)`로 빈 sectionTitle을 외부 title로 채움, H2/H3 헤딩 fallback 인식 (H2 = 첫 occurence면 sectionTitle, 이후는 mid / H3+ = 직전 mid의 sub)
   - 호출자 4곳에서 `section.title`을 fallback으로 전달 (OutlinePanel, SectionTreeView, OutlineCompactTree, workspace/store의 `proceedToStep3`)
2. **다운로드 스코프 3-way 확장** — ExportDialog `includeBody: boolean` → `scope: 'full' | 'outline-with-guide' | 'titles-only'`.
   - `titles-only` = 제목 트리만 (가이드·본문 제외, 회람용). 마커 정리: `[중분류 1.1] 사업 배경` → `1.1 사업 배경`.
   - 파일명 suffix: `-outline`, `-titles`, 또는 무.
3. **Tailscale/mDNS 호스트명 허용** — `vite.config.ts`에 `server.allowedHosts: ['hsh', '.ts.net', '.local']`. `http://hsh:5173` (Tailscale MagicDNS), `*.ts.net` (FQDN), `*.local` (Bonjour) 다 통과.

### 2026-06-02 추가 작업 (2차 세션, commit 됨)
1. **자동 진행 기능** — 헤더에 `🚀 한 번에 끝까지 작성`(`runAll('step3')`)과 `📑 아웃라인까지 자동`(`runAll('step2')`). Step1→2(대분류 순회)→3(본문 순회)을 현재 위치에서 끝까지 자동.
   - `store.runAll(stopAfter)`: 오케스트레이터. `generateCurrentSection(i)`/`generateCurrentBody(i)`/`continueCurrentBody(i)`에 **명시적 인덱스** 추가해 화면 커서와 분리.
   - **진행 중 이동 안전** — `autoFollowView` 플래그: 기본은 화면이 생성 위치 따라가되, 사용자가 뱃지/스텝퍼로 직접 이동하면 false→머무름, 생성은 백그라운드 계속. (생성 순서가 화면 커서에 의존하지 않음)
   - **이어쓰기 인앱 모달** — 본문이 분량 한도(`isTruncated`=`length`||`max_tokens`)로 끊기면 pause→예/아니오 모달(`pendingContinue`/`resolveContinue`). `window.confirm`은 비동기 컨텍스트에서 브라우저가 무시(취소처리)해서 인앱 모달로 교체함.
2. **DOCX 버그픽스 2건** (`server/src/exporters/docx.ts`)
   - `---` 구분선이 pandoc에서 YAML 메타블록으로 오인돼 크래시 → 입력 포맷에 `markdown-yaml_metadata_block`.
   - **표 한글 세로 붕괴**(글자마다 줄바꿈) → LLM의 불균등 대시(`|:--|:------|`)를 pandoc이 1글자 폭 고정. 해결: `normalizeTableSeparators`(대시 균등화) + `--columns=1`(모든 표를 고정폭 pct5000으로). autofit(`tblW=auto`)은 CJK 최소폭=1글자라 오히려 붕괴 → 금지.
3. **페이지 배분 (M-A/M-B 완료, M-C 미구현)** — 사용자가 목표 총 페이지 입력 → 중요도·강점 기반 중분류별 페이지 배분.
   - `store.pageLimit` + `pageAllocation` (persist v5). `generatePageAllocation()`.
   - 서버 `POST /api/outline/page-allocation` + `prompts/page_allocation.md`: LLM이 가중치(1~10)+근거 JSON 출력 → 서버가 **최대잔여법으로 0.5단위 페이지, 합=목표** 정규화.
   - Step 2 화면 `📐 페이지 배분` 패널 + 트리에 중분류 `≈Np`·대분류 `합계 ≈Mp` 뱃지. 키=`${mainIndex}-${midIndex}`(body 좌표계와 동일).
   - **M-C(다음 할 일)**: 이 배정 장수를 본문 생성에 연결 — 목표자수=페이지×~1,800, 호출당 ~2p로 분할, 목표까지 자동 이어쓰기(`runAll` 연동, 504 회피).
4. **작성 전략·가이드 개조식화** — `outline_step1.md`/`outline_step2_section.md` Output Format을 번호 개조식(`1) … 2) …`)으로. `SectionTreeView.GuidanceBox`에 `splitItemized` 추가(파서가 합친 문자열을 번호 목록으로 분리 렌더). 기존 산문 가이드는 하위호환(문단 표시).
5. **본문 분량** — 늘렸다가 504 빈발로 **원복**(`BODY_MAX_TOKENS=5000`, 본문 2,500~3,500자). 504는 **게이트웨이 upstream 타임아웃(Envoy, 인프라 소관)** 이라 앱에서 못 늘림 — 우리 측 fetch/SDK 타임아웃은 더 길어 무관. 길이 원하면 빠른 모델(haiku/flash) 또는 이어쓰기 분할.

### 2026-06-04 추가 작업 (3차 세션, commit 됨)
1. **M-C: 페이지 배분 → 본문 생성 연결** — 배정 장수만큼 본문 자동 분할 생성.
   - `store`: `CHARS_PER_PAGE=1800`, `targetCharsForBody(body, items)`(키 `${mainIndex}-${midIndex}`). `generateCurrentBody`가 목표 있으면 초기 생성 후 **목표의 85%까지 이어쓰기 자동 반복**(호출당 ~2,200자, 증가<200자/maxChunks/autoRunStop로 중단). `continueCurrentBody`도 목표 전달.
   - `body.ts`: `targetChars` 수신 → 호출별 분량 지시(초기 ≤~3,200자, 이어쓰기 ≤~2,200자)로 504 회피. `runAll`은 목표 있는 본문엔 이어쓰기 모달 생략.
   - UI: Step2 대분류 진행 뱃지 `≈Np`(합계)·Step3 본문 뱃지 `≈Np`·본문 정보바 `목표 ≈Np`, 배분 중 로딩 스피너.
2. **파일 첨부 실패(비-secure context) 해결** — `crypto.randomUUID()`는 secure context 전용이라 `http://hsh`·`http://<ip>` 등 비-HTTPS에서 throw → 첨부 실패였음. `src/lib/id.ts`의 `genId()`(폴백 포함)로 교체(`useFileUpload`, `sectionTree`). **localhost만 secure context라 그동안 로컬에선 됐던 것.**
3. **접속/포트 정리** — `vite.config`에 `strictPort:true`(포트 점유 시 조용히 5174로 안 밀림) + `allowedHosts`에 `lattes-macbook` 추가. dev:all 좀비가 여러 개 떠 5173/5174 충돌하던 것 정리.
   - **중요: `hsh`는 옛 머신 이름.** 현재 개발 머신 = **`lattes-macbook`** (Tailscale IP **100.80.201.4**). 외부/모바일 접속 주소: `http://100.80.201.4:5173`(가장 확실) 또는 `http://lattes-macbook.<tailnet>.ts.net:5173`. 짧은 이름 `lattes-macbook:5173`은 allowedHosts 반영 위해 dev:all 재시작 후.
4. **HWP 미지원 정리** — `.hwp` 제대로 안 돼서 `ACCEPTED_EXTENSIONS`와 서버 `.hwp` 분기/안내문구 제거. HWPX는 지원 유지.

### 보류 중
- **M9** (드래그 정렬, `@dnd-kit`) — 명시 요청 없으면 보류
- **HWPX 자동 변환** — Phase 3 out-of-scope. 사용자가 한컴 한글에서 DOCX 열어 다른 이름으로 저장 (안내는 ExportDialog 성공 박스 + README에)

### 진행 중 이슈
- **(해결됨) 비-secure context 파일 첨부 실패** — 3차 세션에서 원인 규명·수정 완료. 원인은 `crypto.randomUUID()`(secure context 전용)였고 `genId()`로 교체. 가설 중 "secure context"가 정답이었음(vite proxy/CORS 아님 — 프록시 경유 same-origin이라 무관).
- **(참고) 프록시 맨 500 = 백엔드 재시작** — 편집 중 `tsx watch`가 백엔드를 재시작하면 진행 중 요청이 끊겨 vite 프록시가 비-JSON 500(`UNKNOWN_ERROR`/`Internal Server Error`)을 반환. 게이트웨이 정상 여부는 `POST /api/llm/ping`으로 즉시 확인 가능. 일시적이므로 재시도하면 됨.

### 미해결/검토 사항
- M26 검증 샘플(13개 마크다운 요소) — **표 한글 세로 붕괴는 2차 세션에서 수정 완료**. 남은 DOCX 외형 차이(화면 대비): ① 표 격자선(현재 헤더 밑줄만) ② 코드 회색 배경 ③ 인용문 좌측선 ④ 한글 기본 폰트(맑은 고딕). → pandoc **reference 문서**(`--reference-doc`)로 한 번에 교정 가능, 아직 미착수.
- **웹 검색 미연동** — Step1 "온라인 우수 사례"·페이지 배분 모두 실시간 검색 아님(모델 학습 지식 기반). 라이브 검색은 별도 큰 작업.
- Phase 4 (사내 배포) — 사용자가 의향 표시. 결정 사항: 인프라(k8s vs VM vs IP 공유), 인증(SSO/IP/토큰), 데이터 저장소(localStorage 유지 vs DB), 도메인+HTTPS, Docker 이미지

---

## 환경 설정 (새 PC에서)

### 1. 클론
```bash
git clone git@github-hwanforgit:hwanForGit/proposal_writer.git
cd proposal_writer
```
> SSH alias `github-hwanforgit`을 안 쓰면 `git@github.com:hwanForGit/proposal_writer.git`.

### 2. 의존성
```bash
npm install
cd server && npm install && cd ..
```
`server` 쪽 `npm install`에서 puppeteer가 Chromium(~100MB) 자동 다운로드.

### 3. pandoc 설치 (DOCX 변환용)
```bash
brew install pandoc          # macOS
# sudo apt install pandoc    # Linux
```

### 4. 환경변수
```bash
cp server/.env.example server/.env
```
`server/.env`에서 `OPENAI_API_KEY`에 **본인 회사 이메일** 입력 (예: `OPENAI_API_KEY=name@inflab.com`).

### 5. VPN
사내 LLM Gateway 호출에 VPN 필수.

### 6. 실행
```bash
npm run dev:all
```
- 프론트: http://localhost:5173
- 백엔드: http://localhost:3001
- 사내 망 다른 PC에서 접근: `http://<본인IP>:5173` (vite가 0.0.0.0 바인딩)

---

## 핵심 도메인 지식

### 3-Step 분할 흐름 (Phase 1·2)
- **Step 1 — 사전 분석** (`outline_step1.md` 프롬프트): 벤치마킹 + 사업 수주 핵심 전략. 짧은 호출, read-only.
- **Step 2 — 아웃라인 구조**:
  - 2-A: `outline_step2_sections.md` → 대분류 목록만 추출
  - 2-B: `outline_step2_section.md` → 대분류별 트리 (중분류·소분류 + 자사 매핑 가이드)
  - 사용자가 트리 편집기로 노드 add/remove/edit
- **Step 3 — 본문 작성** (`body_phase2.md`): 중분류 단위 본문, `finish=length`면 [이어서 작성] 다이얼로그

### 사내 LLM Gateway
- OpenAI 호환 API, `openai` npm SDK 사용
- `OPENAI_API_KEY` = 회사 이메일
- `OPENAI_BASE_URL` = `https://ai-gateway.devinflab.com/v1` (로컬)
- `OPENAI_MODEL` = `claude-4.5-sonnet` 기본 (`.env`로 교체 가능)
- 가이드: inflab.atlassian.net/wiki/spaces/DO/pages/2739896334
- 게이트웨이는 streaming에 약함 (502 Premature close 빈발) → 현재 모든 호출 `stream:false`

### 분량 가이드 (LLM timeout 회피)
- 한 호출 출력 ≤ ~3,500자 / max_tokens ≤ 5,000
- `BODY_MAX_TOKENS` env로 디버그 시 잘림 의도 유발 가능 (1500 정도)

### 프롬프트 외부화
- `prompts/*.md` 5개. 서버가 매 호출마다 디스크 read → 파일만 수정해도 즉시 반영.
- 변수 `{{var}}` 형태, 정의는 `docs/prd_1_spec.md §5.3` 및 `docs/prd_2_spec.md §5.3` 참조.

### 데이터 저장
- 사용자별 localStorage (`proposal_writer.outline.v1`), zustand persist v4
- outline + parsed files (textContent 포함) + coverMeta
- 서버 DB 없음

### 다운로드
- DOCX = pandoc (서버 binary)
- PDF = puppeteer + markdown-it + 화면 `.markdown-body` CSS 임베드
- HWPX는 한컴 한글에서 사용자가 직접

---

## 사용자 선호 / 작업 스타일 (관찰 기반)

- **차근차근 진행** — 한 마일스톤씩 끝나면 commit+push → 다음으로
- **commit/push는 명시 요청 시에만** — 자동으로 하지 말 것
- **빠른 fix보다 근본 원인 찾기** 선호 (예: 504 timeout 디버깅 때 단계적 추적)
- 한국어 응답
- 백엔드 로그를 직접 보는 걸 좋아함 — 디버깅 시 `[outline ...]` 라인 활용
- 프롬프트는 `prd_*.md`가 source of truth. 함부로 변형 X.

---

## 자주 쓰는 명령

```bash
npm run dev:all                   # 프론트 + 백엔드 동시
npm run dev                       # 프론트만
npm run dev:server                # 백엔드만 (로그 자세히 볼 때)
npm run build                     # 프론트 빌드
npm run lint                      # ESLint
cd server && npm run typecheck    # 서버 tsc
```

---

## 다음 세션 시작 예시 메시지

새 세션 첫 줄:
- `"docs/HANDOFF.md 읽고 이어서 진행하자"` — 가장 표준
- `"Phase 4 시작. DevOps 답변: k8s 절차 ..."` — 구체 정보 있을 때
- `"M9 드래그 정렬 진행"` — 특정 마일스톤
- `"PDF 검증 결과 표 테두리가 깨졌어, 보정해줘"` — 구체 보정
