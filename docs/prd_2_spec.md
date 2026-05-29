# Proposal Writer — Phase 2 기획서

> 원본: [`/docs/prd_2.md`](./prd_2.md)
> 선행 문서: [`/docs/prd_1_spec.md`](./prd_1_spec.md)
> Phase 2는 Phase 1 완료(아웃라인 확정)를 전제로 한다.

---

## 1. Phase 2 한 줄 목표

Phase 1에서 확정된 **아웃라인 트리의 각 리프 섹션**에 대해, 회사 정보 + 공고/양식 원문 + **실시간 웹 검색 결과**를 종합해서 **평가위원을 설득하는 본문 초안(마크다운)** 을 자동 생성하고, 사용자가 화면에서 조회·편집·저장할 수 있도록 한다.

---

## 2. 범위 (Scope)

### 2.1 In-scope (Phase 2에서 한다)
- 아웃라인 화면에 **"다음"** 버튼 추가 → `/draft` 화면으로 전환
- 아웃라인 위에 1회 호출되는 **전략 요약 단계** (발주처 니즈 / 자사 매칭 승부수 / 벤치마킹 포인트)
- 리프 노드별 **본문 자동 작성** (LLM 호출 + 웹 검색)
- 본문 출력 포맷: prd_2.md의 [Output Format] 그대로 (핵심 요약, 소제목 1·2, 비교 표, 시각화 추천, 부록 출처)
- 본문 화면: 좌측 트리(축소된 아웃라인) + 우측 본문 패널 (마크다운 렌더 + 편집 모드)
- 본문 인라인 편집 (마크다운 textarea + 라이브 미리보기)
- 노드별 본문을 outline JSON에 머지하여 **단일 문서(`OutlineDocument` 확장형)** 로 저장
- 호출 진행 상태 표시 (per-node `idle | generating | drafted | error`)

### 2.2 Out-of-scope (Phase 3+로 미룸)
- 최종 결과물 다운로드 (DOCX/HWPX/PDF) — **Phase 3**
- 시각 자료(표 외) 자동 생성 — Phase 2는 텍스트 "시각화 추천"만
- 본문 일괄 재생성/부분 재생성의 정교한 옵션 — Phase 2는 노드 단위 재생성만
- 사용자 계정/협업 — Phase 4

---

## 3. 사용자 흐름

```
Phase 1 종료: 아웃라인 트리 확정
        ↓
[다음] 버튼 클릭
        ↓
[전략 요약 생성] (전체 입력 자료 → 발주처 니즈/승부수/벤치마킹 1회 호출, 캐시됨)
        ↓
[리프 노드 N개 병렬 본문 생성]  ─── 각 노드: LLM + 웹 검색
        ↓
완료된 본문은 트리에 표시됨 (drafted ✓ 마크)
        ↓
사용자가 노드 클릭 → 우측 패널에서 조회 → "편집" 모드 → 수정 → 저장
        ↓
저장: localStorage (outline + bodies 통합 문서)
```

---

## 4. 화면 사양

### 4.1 새 화면: `/draft`

```
┌───────────────────────────────────────────────────────────────────┐
│ Header: Proposal Writer · [← 아웃라인으로]    [📊 12.3k tok · $0.45]│
├──────────────────────────┬────────────────────────────────────────┤
│ [Outline (compact)]      │ [Body Panel]                            │
│ ▼ 1. 사업 개요            │ # 📝 1.1 추진 배경 및 필요성 상세 초안   │
│   ✓ 1.1 추진 배경…        │                                         │
│   ⏳ 1.2 사업 목적         │ **[핵심 요약 메시지]**                  │
│ ▼ 2. 추진 전략            │ > AI 기반 ... 평가위원을 설득하는 한 줄  │
│   ✓ 2.1 핵심 추진 전략    │                                         │
│   … 2.2 단계별 일정       │ **1. 외부 데이터 기반 현황…**           │
│ …                         │  - …                                    │
│                           │  * 출처: 통계청, 2025                    │
│ [Generate All]  [Stop]    │                                         │
│ progress: 7/12            │ [편집] [재생성] [복사]                  │
└──────────────────────────┴────────────────────────────────────────┘
```

- **좌측**: Phase 1의 OutlineTree를 재사용. 노드별 상태 아이콘 (대기⏸ / 생성중⏳ / 완료✓ / 오류⚠) 추가
- **우측**: 선택된 노드의 본문 마크다운 렌더링. 상단에 [편집]/[재생성]/[복사] 버튼
- **편집 모드**: textarea + 미리보기 분할 (또는 토글)
- **하단 컨트롤**: "전체 생성" (idle 노드들 일괄), "정지", 진행도

### 4.2 컴포넌트 단위 (추가)
- `DraftPage` — `/draft` 라우트 컨테이너
- `DraftOutlineTree` — Phase 1 OutlineTree에 상태 아이콘만 추가한 변형 (또는 prop으로 분기)
- `BodyPanel` — 선택된 노드 본문 렌더/편집/액션 + 자료 매칭 토글 사이드
- `MarkdownView` — react-markdown 래퍼 (GFM 활성화, 코드/표/볼드 등)
- `MarkdownEditor` — textarea + 미리보기 분할
- `SourceReferenceList` — 노드별 회사 자료 토글 UI (자동 매칭 결과 표시 + 포함/제외)
- `GenerationProgress` — 진행도 바, 정지 버튼
- `StrategyBanner` — 화면 상단에 전략 요약(접힘) 표시 + [재생성] 버튼
- `UsageBadge` — 헤더 우상단 누적 사용량/비용 표시 (호버 시 호출별 내역)
- `CostConfirmDialog` — 생성/재생성 직전 예상 비용 확인

---

## 5. 기능 요구사항 (상세)

### 5.1 "다음" 버튼 활성 조건 (Phase 1 화면)
- 아웃라인이 1개 이상 존재
- 모든 파일이 `parsed` 상태 (uploading/error 없음)
- 활성 시 `/draft`로 라우팅

### 5.2 전략 요약 + 자사 자료 매칭 (1회 호출)
- 입력: 공고/양식 텍스트 전체 + 회사 정보 텍스트 전체 + 확정된 아웃라인 JSON
- 출력 (구조화):
  ```ts
  interface ProposalStrategy {
    funderNeeds: string;        // 발주처 니즈
    differentiators: string;    // 자사 매칭 승부수
    benchmarks: string;         // 벤치마킹 포인트
    nodeReferences: Record<string, string[]>; // nodeId → companyFileIds (자동 매칭)
  }
  ```
- **노드별 자사 자료 매칭(자동)** 도 같은 호출에서 함께 받아 LLM 호출을 2회로 쪼개지 않는다 (캐시 효율).
- 캐시: 시스템 프롬프트 + 입력 자료를 **prompt cache 블록**으로 분리 → 본문 호출 N회에 재사용
- **재생성 정책**: 세션 동안 자동 1회. 사용자가 StrategyBanner의 **[재생성] 버튼**을 누르면 다시 호출 (확인 다이얼로그 거침)
- 위치: `/draft` 진입 후 자동 1회. 결과는 store에 저장 후 노드별 호출의 입력으로 사용

### 5.3 노드 단위 본문 생성

#### 호출 단위
- **리프 노드만** 호출 대상 (자식이 없는 노드)
- 대/중분류 노드는 자식 노드들의 본문이 채워지면 자동으로 "completed"로 표시 (직접 호출 X)
- 단, 아웃라인 깊이가 얕아 대분류가 곧 리프인 경우는 호출 대상

#### 동시성
- 최대 동시 4개 (rate limit과 사용자 체감 속도의 균형)
- 큐 기반: 대기열 → 4개 워커가 가져가서 실행
- "정지" 버튼은 새 호출 막고 진행 중인 건 끝까지

#### 입력 구성 (프롬프트 파일 외부화)
- **시스템 프롬프트는 별도 파일에서 런타임 로드**:
  - 위치: `prompts/body_phase2.md` (repo root)
  - 원본: prd_2.md의 `[System Role]` ~ `(본문 작성 시 활용한 외부 검색 데이터의 원본 링크 및 출처 명시…)` 전체
  - 로더: `server/src/llm/prompts.ts`의 `loadAndRenderPrompt(name, vars)` — Phase 1과 공유
  - **운영 의의**: 프롬프트 파일만 수정해도 다음 호출부터 출력 반영. 코드 재배포 불필요.
- **변수 (사용자 원본 [Input Data] 기준 3개)**:
  - `{{proposal_strategy}}` ← §5.2 결과 (funderNeeds·differentiators·benchmarks) 직렬화
  - `{{target_section}}` ← 현재 노드 정보 (title, description, ancestry)
  - `{{assigned_company_sources}}` ← 사용자가 확정한 매칭 회사 자료 (자동 매칭 + 토글 후 결과)
- **Prompt caching**:
  - 프롬프트 파일의 `[System Role]` ~ `[Expert Writing Rules]` ~ `[Instructions]` (정적 부분)은 세션 동안 동일 → cache 적중
  - `{{proposal_strategy}}`도 세션 동안 동일 → 캐시 가능
  - `{{target_section}}` / `{{assigned_company_sources}}`만 노드별로 변동 → 캐시 prefix 종료점
  - 구체적인 캐시 블록 경계는 M14·M15 구현 시점에 LLM 프로바이더의 caching API에 맞춰 결정

#### 자사 자료 매칭 (자동 + 사용자 수정)
- §5.2의 `nodeReferences[nodeId]`를 기본값으로 사용 (LLM 자동 매칭).
- 노드 선택 시 BodyPanel 사이드에 **회사 자료 토글 리스트** 표시. 사용자가 파일 단위로 포함/제외 가능.
- 매칭 결과는 store에 보존(`NodeBody.companyFileIds`) → 본문 생성 호출에 사용 + localStorage 저장 대상.
- chunk 단위 부분 매칭은 Phase 2에서 다루지 않음 (파일 단위만).

#### 4단계 사고 과정 (prd_2.md 그대로)
1. **데이터 갭 분석 + 실시간 웹 검색** — 본 섹션의 논리 강화에 필요한 외부 데이터 식별 → 검색 실행
2. **스토리라인 구성** — 외부 데이터로 문제/기회 → 자사 정보로 해결책 (Problem→Solution)
3. **본문 초안 작성** — Writing Rules 적용 + 시각화 위치/내용 추천
4. **결과물 출력** — [Output Format] 준수

#### 출력 포맷 (prd_2.md 그대로 유지)
````markdown
# 📝 [섹션명] 상세 초안

**[핵심 요약 메시지]**
> (1~2줄 리드)

**1. (소제목 1 - 외부 데이터 기반 현황·문제·기회)**
- (두괄식 핵심 문장 — **볼드** 첫 줄)
- (구체 수치·통계)
  * 출처: [기관/보고서/연도]
- (시사점)

**(💡 시각화 추천: [차트/표 종류] 삽입을 권장합니다.)**

**2. (소제목 2 - 자사 역량·해결 방안)**
- (두괄식 핵심 문장)
- (자사 데이터 활용 서술)
- (경쟁사 대비 정량적 우위)

**[비교/요약 표]**
| 구분 | 기존 기술/시장 | 당사 제안 | 기대 효과 |
|---|---|---|---|
| ... | ... | ... | ... |

---
**🔎 [부록] 팩트체크 및 데이터 출처 리스트**
- [링크/기관/연도]
- [링크/기관/연도]
````

### 5.4 웹 검색 통합 (§6.2 참조)
- LLM이 검색 쿼리를 결정 → 서버가 검색 실행 → 결과를 LLM에 fed back
- 노드당 최대 검색 횟수: 5회 (비용/시간 통제)
- 검색 결과의 URL/제목/스니펫은 본문의 [부록] 섹션에 출처로 포함되도록 프롬프트에 명시

### 5.5 결과 표시 / 편집
- **렌더**: `react-markdown` + `remark-gfm` (표/링크/볼드/리스트 지원)
- **편집**:
  - 노드의 [편집] 클릭 → textarea로 전환 (현재 마크다운 원문 노출)
  - "라이브 미리보기" 토글 (split view)
  - "저장" → 노드 본문 갱신 + `editedAt` 기록
  - "취소" → 원본 복원
- **재생성**: 노드 단위로 재호출. 기존 본문은 1단계 히스토리만 보관 ("이전 본문으로 복원" 1회 가능)
- **복사**: 현재 마크다운 → 클립보드

### 5.6 비용 가드 + 누적 사용량 표시
- **사전 확인 다이얼로그**:
  - "전체 생성" / 노드 [재생성] / 전략 [재생성] 클릭 시 표시
  - 표시 내용: 예상 호출 수, 캐시 적용 후 예상 입력 토큰, 예상 비용($) (모델 단가 × 토큰 산정)
  - 단가는 채택한 LLM 프로바이더 기준으로 `server/llm/pricing.ts` 상수로 관리
- **누적 사용량 Badge** (`UsageBadge`):
  - 화면 우상단 헤더에 고정
  - 표시: 누적 input/output 토큰, 캐시 read 토큰, 웹 검색 횟수, 누적 비용($)
  - 데이터 출처: 모든 API 응답의 `usage` 필드를 store에 누적
  - 호버 시 호출별 내역 미리보기 (펼침)
- 가드 정책: 차단은 없음. 사용자가 확인하면 진행. (월 사용량 hard cap은 Phase 4)

### 5.7 저장 (localStorage 키 버전업)
- 키: `proposal_writer.document.v1`
- 값:
  ```ts
  interface ProposalDocument {
    outline: OutlineNode[];           // Phase 1
    strategy: ProposalStrategy | null;
    bodies: Record<string, NodeBody>; // nodeId → 본문
    usageTotals: UsageTotals;
    savedAt: string;
  }

  interface NodeBody {
    nodeId: string;
    markdown: string;
    citations: Citation[];
    companyFileIds: string[];   // 사용자가 확정한 매칭 (자동 매칭 + 수정)
    generatedAt: string;
    editedAt?: string;
    previousMarkdown?: string;  // 1단계 undo
    modelId: string;
  }

  interface Citation {
    title: string;
    url: string;
    snippet?: string;
    publishedAt?: string;
  }

  interface UsageTotals {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    webSearches: number;
    estimatedUsd: number;
  }
  ```
- 저장 트리거: 본문 생성 완료, 편집 저장, 매칭 토글 변경, "전체 저장" 버튼

---

## 6. 기술 스펙

### 6.1 LLM 호출 설계
- M7에서 결정될 프로바이더를 따른다. Anthropic/Gemini 어느 쪽이든 아래 추상화 인터페이스 위에 구현:
  ```ts
  interface LlmProvider {
    generateStrategy(input: StrategyInput): Promise<ProposalStrategy>;
    generateNodeBody(input: NodeBodyInput): Promise<NodeBody>;
  }
  ```
- **Prompt caching 필수** — 캐시 블록: 시스템 프롬프트, 입력 자료, 전략 요약
- **구조화 출력**:
  - 전략 요약: tool use / responseSchema로 `ProposalStrategy` 강제
  - 본문: 마크다운 텍스트(자유 형식). 단, 부록 출처는 별도 구조화된 `citations[]`로 추출 (tool use)

### 6.2 웹 검색 통합 (옵션별)
| 옵션 | 방식 | 비용 | Pros / Cons |
|------|------|------|-------------|
| **A. Anthropic web search tool** | claude-* 모델에 server tool 등록 | $10 / 1k searches | 통합 단순. Anthropic 채택 시 자연스러움 |
| **B. Gemini grounding** | `tools: [googleSearch]` | 일정 호출량 무료 + 종량 | Gemini 채택 시 기본. 출처 추출 API 제공 |
| **C. 외부 search API** | LLM이 쿼리 생성 → 우리 서버가 Tavily/Brave 호출 → 결과 주입 | Tavily 月 1k 무료 / Brave 月 2k 무료 | 프로바이더 독립적. 추가 코드 |

M7에서 LLM이 정해진 후 같은 진영(A 또는 B)을 기본으로 채택. 필요 시 C로 폴백.

### 6.3 추가 의존성 (Phase 2)
- 프론트: `react-markdown`, `remark-gfm`
- 서버: 채택한 LLM SDK + (옵션 C 채택 시 `@tavily/core` 또는 직접 fetch)

### 6.4 디렉토리 추가
```
prompts/                            # 외부 관리 프롬프트 .md (repo root)
├── outline_phase1.md               # Phase 1 (이미 추가)
├── body_phase2.md                  # Phase 2 본문 생성 (이미 추가)
└── strategy_phase2.md              # Phase 2 전략 요약 (M14에서 추가)

src/
├── features/
│   ├── draft/
│   │   ├── DraftPage.tsx
│   │   ├── DraftOutlineTree.tsx
│   │   ├── BodyPanel.tsx
│   │   ├── MarkdownView.tsx
│   │   ├── MarkdownEditor.tsx
│   │   ├── GenerationProgress.tsx
│   │   ├── StrategyBanner.tsx
│   │   ├── store.ts            # draft 전용 store (bodies, strategy, progress)
│   │   ├── types.ts            # NodeBody, ProposalStrategy, Citation
│   │   └── useBodyGeneration.ts # 큐/동시성 관리 훅
│   └── ... (기존)
└── routes/index.tsx            # /draft 추가

server/
├── src/
│   ├── routes/
│   │   ├── strategy.ts         # POST /api/strategy/generate
│   │   └── body.ts             # POST /api/body/generate
│   ├── llm/
│   │   ├── prompts.ts          # 프롬프트 로더 (이미 추가, Phase 1·2 공유)
│   │   ├── provider.ts         # LlmProvider 인터페이스
│   │   └── anthropic.ts        # (혹은) gemini.ts
│   └── search/
│       └── client.ts           # 채택한 검색 옵션 래퍼
```

---

## 7. API 명세

### `POST /api/strategy/generate`
- Body:
  ```json
  {
    "announcementFiles": [/* ServerParsedFile[] */],
    "companyFiles":      [/* ServerParsedFile[] */],
    "outline":           [/* OutlineNode[] */]
  }
  ```
- Response:
  ```json
  {
    "strategy": {
      "funderNeeds": "...",
      "differentiators": "...",
      "benchmarks": "...",
      "nodeReferences": { "1.1": ["fileId-a"], "1.2": ["fileId-a", "fileId-b"] }
    },
    "usage": { "inputTokens": ..., "outputTokens": ..., "cacheReadTokens": ..., "cacheWriteTokens": ... }
  }
  ```
- 클라이언트는 응답의 `usage`를 `UsageTotals`에 즉시 누적 → UsageBadge 갱신.

### `POST /api/body/generate`
- Body (사용자 원본 프롬프트의 [Input Data] 3개와 1:1 매핑):
  ```json
  {
    "node": { "id": "1.1", "title": "...", "description": "...", "ancestry": ["1. 사업 개요"] },
    "strategy": {/* ProposalStrategy */},
    "assignedCompanySources": [
      { "name": "company_profile.pdf", "text": "..." },
      { "name": "revenue_2024.xlsx",   "text": "..." }
    ]
  }
  ```
- 서버는 위 3개 입력을 `prompts/body_phase2.md`의 3개 변수로 직렬화하여 채움:
  - `{{proposal_strategy}}` ← `strategy` 포맷팅
  - `{{target_section}}` ← `node` 포맷팅
  - `{{assigned_company_sources}}` ← 파일별 텍스트를 `[파일명]\n본문\n` 형태로 직렬화
- 사용자 토글 결과는 **클라이언트가 미리 필터링**한 후 `assignedCompanySources` 배열로 전송 (서버는 파일 corpus를 영구 보관 안 함, Phase 1 정책 동일).
- Response:
  ```json
  {
    "body": {
      "nodeId": "1.1",
      "markdown": "# 📝 ...",
      "citations": [{ "title": "...", "url": "https://...", "publishedAt": "2025" }],
      "generatedAt": "2026-05-27T...",
      "modelId": "claude-sonnet-4-6"
    },
    "usage": {...}
  }
  ```
- 검색 호출은 서버 내부에서 처리. 클라이언트는 한 번의 요청으로 완성된 본문을 받는다.
- 길어질 수 있으므로 타임아웃 **180s** (Phase 1 LLM 타임아웃 120s에서 상향).

---

## 8. 비기능 요구사항

| 항목 | 기준 |
|------|------|
| 본문 호출 타임아웃 | 180s (웹 검색 포함) |
| 동시 본문 호출 | 클라이언트가 큐로 통제, 최대 4 |
| 노드당 웹 검색 횟수 | 최대 5 |
| 본문 결과 캐시(클라) | localStorage에 즉시 저장 (중간 실패 시 부분 복구) |
| 비용 가시화 | API 응답의 `usage`를 GenerationProgress에 누적 표시 (선택, M14에서 추가) |
| 시크릿 | LLM/검색 API 키 모두 **서버 환경변수**, 클라이언트로 노출 금지 |
| 안전장치 | 사용자가 "정지" 시 진행 중인 호출은 끝내되 큐의 나머지 폐기 |

---

## 9. 마일스톤 (M12~)

> Phase 1이 M1~M11이었으므로 Phase 2는 M12부터 이어간다.

- [ ] **M12** — `/draft` 라우트 + 화면 골격 (좌측 트리, 우측 빈 패널)
- [ ] **M13** — `LlmProvider` 인터페이스 + 채택 프로바이더 구현 (M7 결정에 의존)
- [ ] **M14** — `POST /api/strategy/generate` (전략 + 노드별 자료 매칭) + StrategyBanner + [재생성] + UsageBadge 초기 누적
- [ ] **M15** — `POST /api/body/generate` (검색 미포함 1차) + 단일 노드 생성 흐름 + CostConfirmDialog
- [ ] **M16** — 웹 검색 통합 (§6.2 채택 옵션) + UsageBadge에 검색 횟수 누적
- [ ] **M17** — 클라이언트 큐(동시성 4) + 진행도 UI + "정지" + "전체 생성" 비용 다이얼로그
- [ ] **M18** — 본문 마크다운 렌더(`react-markdown` + `remark-gfm`) + `SourceReferenceList` (자료 토글)
- [ ] **M19** — 인라인 편집 모드(textarea + 미리보기) + 저장/취소
- [ ] **M20** — 노드 재생성 + 1단계 undo
- [ ] **M21** — localStorage 키 `proposal_writer.document.v1`로 통합 저장 + 복구 (`UsageTotals` 포함)
- [ ] **M22** — 에러/리트라이/타임아웃 정리, 빈 상태 UI

---

## 10. Phase 3 예고 (가볍게)

- 최종 결과물 **DOCX / HWPX / PDF 다운로드**
- 노드별 본문을 합쳐 단일 문서로 직렬화 (목차/스타일/페이지 번호)
- 시각화 추천 위치에 **실제 표/차트 자동 삽입**(검토)
- 회사 양식의 표지/머리말/꼬리말 적용

---

## 11. 확정된 결정사항 (2026-05-27)

| # | 주제 | 확정 |
|---|------|------|
| 1 | 본문 호출 대상 단위 | **리프 노드만** (대/중분류는 자식 본문 채워지면 completed) |
| 2 | 자사 핵심 정보 매칭 | **자동 + 사용자 수정 가능** — LLM이 노드별로 회사 파일을 자동 매핑, 사용자가 노드별 토글 UI로 파일 단위 포함/제외 |
| 3 | 본문 생성 순서 | **위→아래 큐 + 동시 4** |
| 4 | 편집 UI | **textarea + 라이브 미리보기** (분할) |
| 5 | 시각화 추천 처리 | Phase 2는 **텍스트 추천만** (Phase 3에서 자동 삽입 검토) |
| 6 | 전략 요약 캐싱 정책 | **세션 동안 1회 + 사용자 [재생성] 버튼**. 아웃라인 변경 시 자동 재호출은 하지 않음 |
| 7 | 비용 가드 | **사전 확인 다이얼로그 + 화면 상단 누적 사용량 Badge** (월 cap은 Phase 4) |

---

## 12. Phase 1 spec과 충돌하는 점

- Phase 1 §10에서 Phase 2를 "노드별 LLM 호출"로 한 줄 예고했는데, prd_2.md의 실제 사양은 **전략 요약 사전 호출 + 웹 검색**이 핵심이라 더 복잡함. 비용/타임아웃 산정도 상향.
- Phase 1의 저장 키 `proposal_writer.outline.v1`은 **M21에서 `proposal_writer.document.v1`로 이관**한다. 마이그레이션 함수가 1회 동작 (outline만 있는 경우 → bodies 빈 채로 변환).
