# Proposal Writer — Phase 1 기획서

> 원본: [`/prd_1.md`](../prd_1.md)
> 이 문서는 Phase 1 개발을 위한 상세 사양서입니다. Phase 2 이후 사양은 `prd_2_spec.md`로 이어집니다.

---

## 1. Phase 1 한 줄 목표

**사업 공고/양식 문서**와 **회사 정보 문서**를 업로드하면, LLM이 두 자료를 종합하여 **사업계획서/제안서의 작성 아웃라인(목차 트리)** 을 생성하고, 사용자가 트리를 인라인 편집·저장할 수 있는 SPA를 만든다.

---

## 2. 범위 (Scope)

### 2.1 In-scope (Phase 1에서 한다)
- 두 개의 파일 업로드 섹션 (공고/양식, 회사 정보)
- 다중 파일 업로드 (드래그앤드롭, 파일 선택)
- 지원 포맷: **PDF, DOCX, HWP, HWPX, XLSX, PPTX, TXT, MD**
- 업로드된 파일의 텍스트 추출 (서버 측)
- Claude API를 통한 아웃라인(대/중/소분류 트리) 생성
- 아웃라인 트리의 **시각화 + 인라인 편집** (제목 수정, 노드 추가/삭제, 자식 추가, 드래그로 순서 변경)
- 아웃라인 JSON 로컬 저장 (브라우저 `localStorage`) — Phase 1은 로그인/DB 없음
- 아웃라인 JSON 파일 내보내기 (다운로드)

### 2.2 Out-of-scope (Phase 1에서 하지 않는다 — Phase 2+로 미룸)
- 본문 자동 작성 (아웃라인 → 실제 제안서 본문 채우기)
- 사용자 계정/인증, 협업, 영구 서버 저장
- DOCX/PDF로 최종 결과물 내보내기
- 파일 OCR (이미지 PDF는 텍스트가 추출되는 만큼만 사용)
- 버전 관리/히스토리

---

## 3. 사용자 흐름

```
[1] 공고/양식 파일 업로드   →  [3] "아웃라인 생성" 클릭  →  [4] 트리 뷰에 결과 표시
[2] 회사 정보 파일 업로드   ↗                              ↓
                                                          [5] 인라인 편집
                                                          ↓
                                                          [6] 저장 (localStorage) / JSON 내보내기
```

---

## 4. 화면 사양

### 4.1 단일 페이지 레이아웃
경로: `/` (HomePage 대체) — 한 페이지 SPA로 시작.

```
┌─────────────────────────────────────────────────────────────┐
│  Header: Proposal Writer                                    │
├──────────────────────────────┬──────────────────────────────┤
│  [Section A]                 │  [Outline Panel]             │
│  공고·양식 파일               │  ┌────────────────────────┐ │
│   ┌──────────────────────┐   │  │ ▶ 1. 사업 개요         │ │
│   │ Drop files here      │   │  │   ▶ 1.1 추진 배경      │ │
│   │ (PDF, DOCX, HWP...)  │   │  │   ▶ 1.2 사업 목적      │ │
│   └──────────────────────┘   │  │ ▶ 2. 추진 전략         │ │
│   • announcement_v3.pdf      │  │   ...                   │ │
│   • template.hwpx (×)        │  └────────────────────────┘ │
│                              │                              │
│  [Section B]                 │  [Generate Outline] ⟳        │
│  회사 정보 파일               │  [Save] [Export JSON]        │
│   ┌──────────────────────┐   │                              │
│   │ Drop files here      │   │                              │
│   └──────────────────────┘   │                              │
│   • company_profile.pdf      │                              │
│   • revenue_2024.xlsx        │                              │
└──────────────────────────────┴──────────────────────────────┘
```

### 4.2 컴포넌트 단위
- `FileDropzone` — 업로드 영역. 카테고리(announcement / company)를 prop으로 받음
- `FileList` — 업로드된 파일 리스트, 삭제 가능
- `OutlinePanel` — 우측 아웃라인 패널 컨테이너
- `OutlineTree` — 트리 렌더링 + 키보드/마우스 편집
- `OutlineNodeItem` — 단일 노드 (제목, 토글, 액션 버튼)
- `GenerateButton` — LLM 호출 트리거 + 로딩/에러 상태

---

## 5. 기능 요구사항 (상세)

### 5.1 파일 업로드
- 드래그앤드롭 + 파일 선택기 둘 다 지원
- 다중 선택 허용
- 클라이언트 검증: MIME/확장자, 단일 파일 ≤ 20MB, 총합 ≤ 100MB
- 같은 이름의 파일 재업로드 시 사용자에게 confirm
- 업로드 즉시 서버로 보내 텍스트 추출 → 추출된 텍스트 길이/페이지 수만 클라이언트에 반환

### 5.2 파일 텍스트 추출 (서버)
| 포맷 | 라이브러리 후보 | 비고 |
|------|----------------|------|
| PDF  | `pdf-parse` 또는 `pdfjs-dist` | 텍스트 PDF만. 이미지 PDF는 비어있을 수 있음 |
| DOCX | `mammoth` | 텍스트만 추출 (스타일 무시) |
| XLSX | `xlsx` (SheetJS) | 시트별 텍스트로 직렬화 |
| PPTX | `officeparser` 또는 직접 unzip + XML 파싱 | 슬라이드 텍스트만 |
| HWPX | `hwp.js` | OOXML 유사 구조 |
| HWP  | `hwp.js` (best-effort) | 구버전 바이너리. 추출 실패 시 사용자에게 HWPX 변환 안내 |
| TXT/MD | `fs.readFile(utf-8)` | 그대로 |

> 구현 시점에 각 라이브러리 안정성 검증 필요. 실패 케이스는 명확한 에러 메시지로 사용자에게 반환.

### 5.3 아웃라인 생성 (LLM) — 3-Step 분할 흐름

> 큰 입력에서 게이트웨이 504/502가 빈번해, prd_1.md의 단일 호출을 **사용자 확인 단계가 있는 3-Step**으로 분할. prd_1.md 원본 프롬프트는 source of truth로 보존하되, 운영에서는 step별 변형 프롬프트를 사용.

**인프라**:
- 모델 라우팅: 사내 **Envoy AI Gateway** (OpenAI Chat Completions 호환). `openai` SDK 사용. 가이드: inflab.atlassian.net/wiki/spaces/DO/pages/2739896334
- `OPENAI_API_KEY` = 사용자 이메일 (로컬) 또는 서비스 이름 (k8s). `OPENAI_BASE_URL`은 환경별 게이트웨이 URL.
- 모델은 `OPENAI_MODEL` env. 기본 `claude-4.5-sonnet`. `.env` 한 줄로 Claude/Gemini/GPT 교체 가능.

**프롬프트 외부화**:
- 모든 프롬프트는 `prompts/` 디렉토리의 `.md` 파일로 외부 관리.
- 매 호출마다 디스크에서 읽어 변수 치환 (`server/src/llm/prompts.ts#loadAndRenderPrompt`). 파일만 수정해도 다음 호출부터 즉시 반영.

#### Step 1 — 사전 분석
- 프롬프트: `prompts/outline_step1.md`
- 엔드포인트: `POST /api/outline/step1`
- 입력: announcement·company 파일 텍스트
- 출력: 마크다운 prose
  - 🔍 벤치마킹 분석 보고서
  - 🎯 사업 수주 핵심 전략 (Executive Summary)
- 출력 짧음 (1~2k자), 빠름 (10~30초)
- 사용자가 보고 [다음: Step 2] 클릭

#### Step 2-A — 대분류 목록 추출
- 프롬프트: `prompts/outline_step2_sections.md`
- 엔드포인트: `POST /api/outline/step2/sections`
- 입력: announcement·company 파일 + Step 1 markdown
- 출력: `[대분류 N] 제목` 한 줄씩 (서버에서 정규식 파싱하여 `{index, title}[]` 반환)
- 출력 짧음, 빠름

#### Step 2-B — 영역별 상세 (대분류 N회 반복)
- 프롬프트: `prompts/outline_step2_section.md`
- 엔드포인트: `POST /api/outline/step2/section`
- 입력: 자료들 + Step 1 markdown + 전체 대분류 목록 + `currentSection`(제목)
- 출력: 해당 대분류 한 영역의 중분류·소분류 + 각 노드의 "포함될 자사 소스 및 벤치마킹 적용안"
- 출력 적당 (500~2000자/영역), 빠름 (20~60초)
- 사용자가 보고 [다음: 대분류 N+1] 클릭하면 다음 영역. 마지막 영역에서 [Step 3로] 클릭.

#### Step 3 — 본문 작성 (Phase 2 본문)
- prd_2.md / prd_2_spec.md 참조.

**프롬프트 변수**:
| 프롬프트 | 변수 |
|----------|------|
| outline_step1 | `{{announcement_documents}}` `{{template_documents}}` `{{company_documents}}` |
| outline_step2_sections | 위 + `{{step1_markdown}}` |
| outline_step2_section | 위 + `{{all_sections}}` `{{current_section}}` |

**`template_documents` 처리**: 현 UI는 공고/양식을 단일 announcement 카테고리로 받음. 그래서 `template_documents`에는 텍스트를 다시 넣지 않고 "위 1번 자료에 양식 포함" 안내 문구만 채움 (입력 크기 2배 부풀림 방지 → 502 회피).

**stream 사용 안 함**: 사내 게이트웨이가 OpenAI streaming에서 Premature close 빈발. 현재는 모든 호출 `stream:false` + 짧은 출력 강제로 우회. 향후 스트리밍 지원이 안정화되면 영역별 호출에 도입 검토.

### 5.4 트리 표시/편집
- 라이브러리 후보: `@dnd-kit/core` + 자체 트리 컴포넌트 (가벼움) — Phase 1은 외부 트리 라이브러리 없이 자체 구현 권장
- 각 노드 액션: `편집(타이틀 인라인)`, `자식 추가`, `삭제`, `위/아래 이동`, `드래그로 순서 변경`
- 키보드: `Enter` 형제 추가, `Tab` 자식으로 들여쓰기, `Shift+Tab` 부모로, `Delete` 빈 노드 삭제
- 변경 시 상태는 메모리에 보관 → "저장" 클릭 시 `localStorage`에 직렬화

### 5.5 저장 / 내보내기
- 저장: `localStorage["proposal_writer.outline.v1"]` 단일 슬롯 (Phase 1은 1개만 보관)
- 내보내기: 현재 아웃라인을 JSON 파일로 다운로드 (`outline-YYYYMMDD-HHmm.json`)

---

## 6. 기술 스펙

### 6.1 Frontend (이미 세팅 완료)
- Vite 6 + React 19 + TypeScript 5.7
- Tailwind CSS 4
- React Router 7
- 상태 관리: **Zustand** 추가 권장 (아웃라인 트리 + 파일 리스트가 두 패널에서 공유됨)
- 데이터 패칭: **TanStack Query** 추가 권장 (아웃라인 생성 호출 + 캐싱/리트라이)

### 6.2 Backend
- 위치: `server/` 디렉토리 (모노레포 단일 패키지로 시작, 필요 시 분리)
- Node 20+ / Express 4 또는 5 / TypeScript
- multer로 multipart 업로드 수신
- 파일은 임시 디렉토리(`os.tmpdir()`)에 잠시 저장 후 텍스트 추출 → 즉시 삭제 (Phase 1은 영구 저장 X)
- 환경변수: `ANTHROPIC_API_KEY` (.env, .gitignore 처리)
- CORS: 개발용 `http://localhost:5173` 허용

### 6.3 디렉토리 구조 (변경/추가 예정)
```
proposal_writer/
├── src/                          # 기존 프론트
│   ├── features/
│   │   ├── upload/               # 파일 업로드 컴포넌트/훅
│   │   └── outline/              # 트리 렌더/편집/스토어
│   ├── lib/
│   │   ├── api.ts                # 서버 API 클라이언트
│   │   └── outline-schema.ts     # 타입 정의 (서버와 공유 후보)
│   └── ...
├── server/
│   ├── src/
│   │   ├── index.ts              # Express 부트스트랩
│   │   ├── routes/
│   │   │   ├── files.ts          # POST /api/files/parse
│   │   │   └── outline.ts        # POST /api/outline/generate
│   │   ├── parsers/              # 포맷별 추출 모듈
│   │   │   ├── pdf.ts
│   │   │   ├── docx.ts
│   │   │   ├── xlsx.ts
│   │   │   ├── pptx.ts
│   │   │   ├── hwp.ts
│   │   │   └── text.ts
│   │   └── llm/
│   │       ├── client.ts         # @anthropic-ai/sdk 래퍼
│   │       └── outline-prompt.ts # 시스템/유저 프롬프트 빌더
│   ├── package.json
│   └── tsconfig.json
└── docs/
    ├── prd_1_spec.md             # ← 이 문서
    └── (이후 prd_2_spec.md, ...)
```

### 6.4 Vite ↔ Express 연동
- 개발: Vite `server.proxy`로 `/api` → `http://localhost:3001` 프록시
- 프로덕션: Express가 `dist/`도 정적 서빙 (Phase 1 단순화)

---

## 7. 데이터 모델 / API 명세

### 7.1 API 엔드포인트

#### `POST /api/files/parse`
- Content-Type: `multipart/form-data`
- Form fields:
  - `category`: `"announcement" | "company"`
  - `files`: File[] (다중)
- Response (200): 다중 업로드 중 일부 실패 가능 → 성공 파일은 `files`, 실패는 `errors`에 per-file로 담는다.
  ```json
  {
    "files": [
      {
        "id": "uuid",
        "name": "announcement.pdf",
        "category": "announcement",
        "mimeType": "application/pdf",
        "size": 1234567,
        "textContent": "...",
        "extractedAt": "2026-05-27T05:00:00Z",
        "warnings": []
      }
    ],
    "errors": [
      { "fileName": "old.hwp", "code": "UNSUPPORTED_HWP", "message": "..." }
    ]
  }
  ```
- 요청 자체 실패(카테고리 누락, 파일 0개, 크기 초과 등)는 단일 에러 응답:
  ```json
  { "error": { "code": "INVALID_CATEGORY | NO_FILES | MULTER_LIMIT_FILE_SIZE | ...", "message": "..." } }
  ```

#### `POST /api/outline/step1`
- Body: `{ announcementFiles, companyFiles }` (각각 `ParsedFile[]`)
- Response: `{ markdown, modelId, generatedAt, finishReason, usage, elapsedMs, inputFileIds }`
- 출력 마크다운: 🔍 벤치마킹 + 🎯 Executive Summary

#### `POST /api/outline/step2/sections`
- Body: `{ announcementFiles, companyFiles, step1Markdown }`
- Response: `{ sections: [{ index, title }], markdown, modelId, generatedAt, usage, elapsedMs }`
- 서버가 LLM 응답에서 `[대분류 N] 제목` 패턴을 정규식 파싱해 `sections[]`로 반환

#### `POST /api/outline/step2/section`
- Body: `{ announcementFiles, companyFiles, step1Markdown, allSectionTitles, currentSection }`
- Response: `{ markdown, currentSection, modelId, generatedAt, finishReason, usage, elapsedMs }`
- 출력 마크다운: 해당 대분류 한 영역의 중분류·소분류 + 자사 소스 매핑

#### `POST /api/outline/generate` (레거시)
- 큰 입력에서 502 빈번. split 흐름 정착 후 제거 예정.

### 7.2 TypeScript 타입 (프론트/서버 공유)

```ts
export type FileCategory = 'announcement' | 'company';

export interface ParsedFile {
  id: string;
  name: string;
  category: FileCategory;
  mimeType: string;
  size: number;
  textContent: string;
  extractedAt: string;
  warnings?: string[];
}

export type OutlineSource = 'announcement' | 'template' | 'derived';

export interface OutlineNode {
  id: string;
  title: string;
  description?: string;
  source: OutlineSource;
  children: OutlineNode[];
}

export interface OutlineDocument {
  rootNodes: OutlineNode[];
  generatedAt: string;
  modelId: string;
  inputFileIds: string[];
}
```

---

## 8. 비기능 요구사항

| 항목 | 기준 |
|------|------|
| 단일 파일 크기 | ≤ 20MB |
| 총 업로드 합계 | ≤ 100MB |
| 파일 추출 타임아웃 | 파일당 30s |
| LLM 호출 타임아웃 | 120s (긴 입력 대비) |
| 동시 업로드 처리 | 서버 측 큐 불필요 (Phase 1 트래픽 가정 단일 사용자) |
| 에러 처리 | 모든 API 응답은 `{ error: { code, message, ... } }` 일관 포맷 |
| 시크릿 | `ANTHROPIC_API_KEY`는 서버 환경변수에서만 사용. 클라이언트로 절대 노출 X |
| 로깅 | 서버는 요청/응답 메타데이터만 로깅, 파일 내용은 기본 비로깅 (디버그 플래그 시에만) |

---

## 9. 마일스톤 / 작업 분할

> 위에서 아래로, 각 단계는 독립적으로 PR 단위.

- [x] **M1** — 백엔드 스캐폴드: `server/` 생성, Express + TS 부트스트랩, `/api/health` 응답
- [x] **M2** — Vite proxy 연결 + 프론트의 `src/lib/api.ts` 클라이언트 골격
- [x] **M3** — 파일 업로드 UI (좌측 두 섹션, 드래그앤드롭, 리스트, 삭제)
- [x] **M4** — `/api/files/parse` 엔드포인트 + 포맷별 파서 (officeparser 통합 + HWPX 자체)
- [x] **M5** — 우측 아웃라인 패널 UI (정적 더미 트리는 후속에 갈음)
- [x] **M6** — Zustand 스토어 (파일/아웃라인 상태) + 서버 업로드 연결
- [x] **M7** — 사내 LLM Gateway(OpenAI 호환) 연동 + 3-Step 분할 흐름
  - [x] M7.1 — Step 1: 사전 분석 (`/api/outline/step1`)
  - [x] M7.2 — Step 2-A: 대분류 목록 추출 (`/api/outline/step2/sections`)
  - [x] M7.3 — Step 2-B: 영역별 상세 + 순회 UI (`/api/outline/step2/section`)
  - [ ] M7.4 — Step 3: Phase 2 본문 작성 (`prd_2_spec.md`로 이관)
- [ ] **M8** — 아웃라인 인라인 편집 (마크다운 textarea + 미리보기 또는 트리 편집기)
- [ ] **M9** — 드래그앤드롭 순서 변경 (`@dnd-kit`) — M8 결정에 따라 X 될 수도
- [ ] **M10** — localStorage 저장 + JSON 내보내기
- [ ] **M11** — 에러/로딩 상태 정리, 빈 상태 UI, README 업데이트

---

## 10. Phase 2 이후 예고 (가볍게)

- **Phase 2**: 아웃라인 → 본문 자동 작성 (노드별 LLM 호출, 회사 정보 활용)
- **Phase 3**: 결과물 DOCX/HWPX/PDF 내보내기, 스타일 템플릿 적용
- **Phase 4**: 사용자 계정, 프로젝트 저장, 협업
- **Phase 5**: 평가/리뷰 모드 (제출 전 자가 점검 — 공고 요구사항 충족도 체크)

각 Phase는 `docs/prd_N_spec.md` 형태로 별도 작성됩니다.

---

## 11. 미해결/추후 결정 사항

- HWP(구버전 바이너리) 파싱 실패 시 폴백 정책 — 사용자에게 변환 안내만 할지, 서버에서 변환 시도까지 할지
- 이미지 기반 PDF 처리 — Phase 1은 OCR 미포함. 빈 추출 결과를 어떻게 사용자에게 알릴지
- **아웃라인 인라인 편집** — 현재는 LLM 응답 마크다운을 `<pre>`로 표시만. 사용자가 트리 형태로 편집·재정렬·항목 추가/삭제하는 UX는 후속 마일스톤에서. 옵션:
  - 마크다운 textarea + 라이브 미리보기
  - 마크다운→JSON 트리 파싱 후 트리 편집기
- **웹 검색 인프라** — 프롬프트 Step A가 "실시간 우수 사례 검색"을 명시. 현재는 모델 학습 지식으로만 응답. 사내 게이트웨이의 web search tool 지원 여부 확인 후 통합. Phase 2 본문 생성과 같은 인프라 공유.
- **`announcement` 카테고리 분리** — prd_1.md/프롬프트는 [Input Data]에서 공고문과 양식을 두 변수로 분리하지만, 현재 UI는 단일 섹션이고 `template_documents` 변수에는 안내문만 채움. 업로드 섹션을 3개로 늘리는 것이 LLM 입력 명확도엔 좋으나 UX 부담 ↑ — 후속 검토.
- **재생성 옵션** — 현재는 Step별로 [다시 시도]만. 영역별 일부 재생성(예: 대분류 3번만 다시)은 이미 가능하나, 전체 흐름 리셋과의 관계 정리 필요.
- **사내 게이트웨이 streaming** — `stream:true` 요청 시 Premature close 빈발. 현재 모든 호출 비스트리밍. 추후 게이트웨이 측 안정화되면 영역별 호출에 stream 도입 (체감 속도 ↑).
