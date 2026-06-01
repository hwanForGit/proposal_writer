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

## 현재 진행 상태 (2026-06-01)

### 완료된 마일스톤
- **Phase 1** (M1~M8, M10, M11) — 파일 업로드·LLM 연동·트리 편집기·localStorage·UX
- **Phase 2** (Step 3 본문) — 중분류 단위 본문 작성, 이어쓰기, 편집
- **Phase 3** (M23~M27) — 통합 마크다운, DOCX/PDF 다운로드, 서식 검증 샘플, "한컴 HWPX 저장" 안내

### 보류 중
- **M9** (드래그 정렬, `@dnd-kit`) — 명시 요청 없으면 보류
- **HWPX 자동 변환** — Phase 3 out-of-scope. 사용자가 한컴 한글에서 DOCX 열어 다른 이름으로 저장 (안내는 ExportDialog 성공 박스 + README에)

### 미해결/검토 사항
- M26 검증 샘플(13개 마크다운 요소) **외형 검증을 사용자가 실제로 수행했는지** — 깨진 행 발견 시 `server/src/exporters/pdf.ts`의 CSS 또는 `docx.ts`의 pandoc 인자 조정
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
