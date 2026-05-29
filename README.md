# proposal_writer

사업 공고·양식과 회사 정보를 업로드하면, 사내 LLM Gateway를 활용해 **사업계획서/제안서 아웃라인을 자동으로 작성**해주는 도구.

```
[파일 업로드]  →  [Step 1: 사전 분석]  →  [Step 2: 영역별 아웃라인]  →  [Step 3: 본문 작성*]
공고/양식         벤치마킹 보고서          대분류 1, 2, 3… 순차            (Phase 2 예정)
회사 정보         사업 수주 핵심 전략      중분류·소분류 트리 편집
```

\* Step 3 (본문 자동 작성)은 Phase 2에서 추가 예정 — `docs/prd_2_spec.md` 참조

## 사전 준비

- **Node.js 20+** / npm
- **사내 망 접근권**: 회사 이메일 + VPN (사내 LLM Gateway 호출에 필요)
- 가이드 문서: [LLM EndPoint 설정 가이드](https://inflab.atlassian.net/wiki/spaces/DO/pages/2739896334/LLM+EndPoint)

## 설치

```bash
git clone git@github.com:hwanForGit/proposal_writer.git
cd proposal_writer
npm install           # 프론트
cd server && npm install   # 서버
cd ..
```

## 환경 설정

```bash
cp server/.env.example server/.env
```

`server/.env` 편집 (로컬 개발 기준):

```env
OPENAI_API_KEY=<회사 이메일>      # 예: shhwang@inflab.com
OPENAI_BASE_URL=https://ai-gateway.devinflab.com/v1
OPENAI_MODEL=claude-4.5-sonnet    # 또는 gemini-2.5-pro / claude-4.5-haiku 등
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

## 실행

**한 번에 띄우기 (권장)**:
```bash
npm run dev:all
```
`concurrently`로 프론트(5173)와 백엔드(3001)를 같은 터미널에 띄움. 로그는 `web` / `api` 접두사로 구분됨. Ctrl+C 한 번에 둘 다 종료.

**따로 띄우기 (백엔드 로그를 자세히 보고 싶을 때)**:
```bash
# 터미널 1 — 프론트엔드
npm run dev

# 터미널 2 — 백엔드
npm run dev:server     # 또는 cd server && npm run dev
```

VPN이 켜져 있어야 LLM 호출이 됩니다. 브라우저에서 http://localhost:5173 열어 확인.

## 사용 흐름

1. **파일 업로드**
   - 좌측 첫 섹션 = 공고·양식 (PDF, DOCX, HWPX, XLSX, PPTX, TXT, MD)
   - 좌측 두 번째 섹션 = 회사 정보 (선택 — 없어도 진행 가능)
   - HWP(구버전 바이너리)는 지원 X → HWPX 또는 PDF로 변환 필요
2. **Step 1 시작** → 벤치마킹 분석 보고서 + 사업 수주 핵심 전략 자동 생성
3. **다음 → Step 2** → 양식의 대분류 N개를 순회하며 각 영역의 중분류·소분류를 생성
4. **편집** — 트리 카드에서 인라인 제목 편집, 소분류 추가/삭제, 중분류 추가
5. **내보내기** — Markdown(.md) 또는 JSON(.json) 다운로드
6. 페이지 새로고침해도 작업 결과는 `localStorage`에 자동 보존됨

## 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev:all` | 프론트 + 백엔드 동시 기동 (concurrently) |
| `npm run dev` | 프론트엔드만 (Vite) |
| `npm run dev:server` | 백엔드만 (tsx watch) |
| `npm run build` | 프론트 타입체크 + 프로덕션 빌드 |
| `npm run lint` | ESLint |
| `npm run format` | Prettier 자동 포맷 |
| `cd server && npm run typecheck` | 서버 타입체크 |
| `cd server && npm run build` | 서버 컴파일 → `dist/` |

## 디렉토리 구조

```
proposal_writer/
├── prompts/                          # 사내 LLM에 전송되는 프롬프트 (.md)
│   ├── outline_step1.md              # Step 1: 사전 분석
│   ├── outline_step2_sections.md     # Step 2-A: 대분류 목록
│   ├── outline_step2_section.md      # Step 2-B: 한 영역의 트리
│   └── body_phase2.md                # Phase 2: 본문 작성
├── docs/                             # 사양 문서
│   ├── prd_1.md / prd_1_spec.md
│   └── prd_2.md / prd_2_spec.md
├── src/                              # 프론트엔드
│   ├── features/
│   │   ├── upload/                   # 파일 업로드 UI
│   │   ├── outline/                  # 트리 편집기, 마크다운 뷰
│   │   └── workspace/                # 상태 store (zustand + persist)
│   ├── lib/api.ts                    # 서버 API 클라이언트
│   ├── pages/WorkspacePage.tsx
│   └── ...
└── server/                           # Express + TypeScript
    └── src/
        ├── routes/
        │   ├── files.ts              # POST /api/files/parse
        │   └── outline.ts            # POST /api/outline/step1, step2/...
        ├── parsers/                  # 포맷별 텍스트 추출
        ├── llm/
        │   ├── client.ts             # OpenAI SDK 래퍼 (사내 Gateway)
        │   └── prompts.ts            # 프롬프트 로더 + 변수 치환
        └── middleware/error-handler.ts
```

## 프롬프트 운영

`prompts/*.md` 파일은 **서버가 매 호출마다 디스크에서 읽음**. 출력 내용을 튜닝하려면 코드 수정·재배포 없이 해당 파일만 편집하면 됩니다.

변수 치환은 `{{변수명}}` 형태. 변수 목록은 `docs/prd_1_spec.md §5.3` 참조.

## 트러블슈팅

| 증상 | 원인 / 해결 |
|------|-------------|
| `504 upstream request timeout` | VPN 미연결, 또는 입력/출력이 너무 큼 → 더 빠른 모델(`claude-4.5-haiku`/`gemini-2.5-flash`)로 교체 |
| `502 Premature close` | 사내 게이트웨이가 stream 도중 끊김 → `stream:false`로 호출 중 (이미 적용). 다시 시도 |
| 한글 파일명 깨짐 | macOS NFD를 latin1로 잘못 디코딩한 결과 — 서버에서 자동 복구 |
| 트리 파싱 실패 | 마크다운 그대로(textarea) 편집 모드로 fallback. 양식이 비표준이면 발생 가능 |
| HWP(구버전) 업로드 거부 | Phase 1 미지원. 한글 프로그램에서 HWPX 또는 PDF로 변환 |
| LLM 응답 잘림 (노란 경고) | `max_tokens` 한도 도달. 모델·프롬프트 측 분량 가이드 강화 또는 더 큰 한도 |

## 사양 문서

- [Phase 1 사양](docs/prd_1_spec.md) — 파일 업로드 ~ 아웃라인 편집까지
- [Phase 2 사양](docs/prd_2_spec.md) — 본문 자동 작성 (예정)

## 로드맵

- [x] M1~M7: 파일 업로드 + 파싱 + 사내 LLM 연동 + 3-Step 분할 흐름
- [x] M8: 트리 구조 편집기 (중분류·소분류 add/remove/edit, 가이드 read-only)
- [x] M10: localStorage 자동 저장 + Markdown/JSON 내보내기
- [x] M11: 에러/빈 상태 UI 정리 + README
- [ ] Step 3 / Phase 2: 본문 자동 작성
- [ ] Phase 3: DOCX/HWPX/PDF 최종 내보내기
