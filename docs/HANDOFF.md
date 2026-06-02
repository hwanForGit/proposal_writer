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

## 현재 진행 상태 (2026-06-02)

### 완료된 마일스톤
- **Phase 1** (M1~M8, M10, M11) — 파일 업로드·LLM 연동·트리 편집기·localStorage·UX
- **Phase 2** (Step 3 본문) — 중분류 단위 본문 작성, 이어쓰기, 편집
- **Phase 3** (M23~M27) — 통합 마크다운, DOCX/PDF 다운로드, 서식 검증 샘플, "한컴 HWPX 저장" 안내

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

### 보류 중
- **M9** (드래그 정렬, `@dnd-kit`) — 명시 요청 없으면 보류
- **HWPX 자동 변환** — Phase 3 out-of-scope. 사용자가 한컴 한글에서 DOCX 열어 다른 이름으로 저장 (안내는 ExportDialog 성공 박스 + README에)

### 진행 중 이슈 (다른 PC에서 이어 진단 필요)
- **hsh:5174 파일 첨부 실패** — Tailscale 통해 `http://hsh:5174`로 접속은 되는데 (사용자 PC + 외부 PC 모두), 파일 첨부 단계에서 실패. `http://localhost:5174`에서는 정상.
  - 다음 진단 단계: 브라우저 F12 → Console / Network 탭에서 `/api/files/parse` 요청의 status·응답 본문 확인. drag&drop이냐 파일 선택이냐 등 증상 명확화.
  - 가설 1: vite proxy의 multipart forwarding이 호스트명 기반 접근에서 깨지는 케이스. 가설 2: secure context 관련(File System Access API 등). 가설 3: 서버 CORS Origin 검사 (현재 `cors({ origin: 'http://localhost:5173' })`만 허용).
  - 5173 포트에 옛 vite 좀비 프로세스가 떠 있을 수 있음 — 새 PC에서는 무관.

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
