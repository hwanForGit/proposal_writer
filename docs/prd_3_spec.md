# Proposal Writer — Phase 3 기획서

> 원본: [`/docs/prd_3.md`](./prd_3.md)
> 선행 문서: [`/docs/prd_1_spec.md`](./prd_1_spec.md), [`/docs/prd_2_spec.md`](./prd_2_spec.md)
> Phase 3는 Phase 1·2 완료(Step 1·2·3 본문 작성 완료)를 전제로 한다.

---

## 1. Phase 3 한 줄 목표

Step 1·2·3까지 완성된 사업계획서 본문을, **화면에 표시된 마크다운 서식(글머리 기호·강조·표·인용·헤딩 등)을 그대로 보존한 채** 국비 사업 제출용 **HWPX(가능 시) / DOCX / PDF** 파일로 다운로드 받을 수 있게 한다.

> **★ 1순위 제약 (사용자 요구)**
> 어떤 포맷이든 다운로드 결과물이 화면 출력 형태를 **충실히 반영**해야 함:
> 글머리 기호, **굵게**, *기울임*, `코드`, > 인용, 표, 헤딩 위계, 이모지(📝 🔍 🎯 등), 구분선

---

## 2. 범위 (Scope)

### 2.1 In-scope
- 단일 통합 문서 생성: Step 1 + Step 2 + Step 3 모든 결과 합본
- **표지 메타 입력 UI** (사업명·신청기관·작성자·작성일·연락처 등, 선택)
- **DOCX 다운로드** (1차 안정 목표 — 한컴 한글에서 열어 HWPX 저장 가능)
- **PDF 다운로드** (미리보기·공유용)
- **HWPX 다운로드** (가능 옵션 중 채택. §6 참조)
- 모든 포맷에서 §5.5 서식 매핑 표 100% 보존
- 다운로드 진행 상태 표시 + 에러 처리

### 2.2 Out-of-scope (Phase 3+로 미룸)
- **HWP(구버전 바이너리) 직접 생성** — 외부 도구로 안정적 생성 불가 (사용자가 한컴에서 다른이름저장으로 만들도록 안내)
- 시각화 추천(`💡 표 삽입 권장`) 텍스트를 실제 차트·이미지로 변환 (Phase 3.5에서 검토)
- 사용자 계정/협업/저장소 — Phase 4
- 워터마크·전자서명 — 별도

---

## 3. 사용자 흐름

```
Step 3 모든 본문 완료 (또는 일부 완료)
      ↓
헤더의 [최종 결과물 내보내기] 버튼 활성화 (현재 [내보내기 ▾] 확장)
      ↓
[표지 정보 입력] 모달 (선택 — 빈 채로도 진행 가능)
  - 사업명, 신청기관, 작성자, 작성일, 연락처 …
      ↓
[포맷 선택]: DOCX / HWPX / PDF
      ↓
서버가 통합 마크다운을 만들고 선택 포맷으로 변환 → 다운로드
      ↓
사용자가 한컴 한글에서 열어 미세 조정 (HWPX/DOCX 케이스)
```

---

## 4. 화면 사양

### 4.1 헤더 [내보내기 ▾] 메뉴 확장
기존 메뉴:
```
내보내기 ▾
├─ Markdown (.md)
└─ JSON (.json)
```
확장:
```
내보내기 ▾
├─ 📝 사업계획서 (HWPX) — 한컴 호환
├─ 📝 사업계획서 (DOCX) — Word 호환
├─ 📝 사업계획서 (PDF) — 미리보기
├─ ──────────
├─ Markdown (.md) — 원본
└─ JSON (.json) — 백업/복원
```

### 4.2 표지 정보 입력 모달 (선택)
사업계획서·HWPX·DOCX·PDF 셋 중 하나 클릭 시 표지 입력 다이얼로그가 한 번 뜸 (다시 안 뜨도록 "다음에 묻지 않기" 옵션):

| 항목 | 예시 | 필수 |
|------|------|------|
| 사업명 | "2026년 디지털 혁신 지원사업" | 선택 |
| 신청기관 | "(주)인프랩" | 선택 |
| 작성자 | "홍길동" | 선택 |
| 작성일 | (오늘 날짜 기본값) | 선택 |
| 연락처 | "010-..." | 선택 |
| Step 1 본문 포함 여부 | 체크박스 | 기본 OFF |

표지 정보는 store에 저장 → 다음 번 다운로드에 재사용.

### 4.3 다운로드 진행 표시
- 모달 또는 toast 형태로 "변환 중… N초 경과"
- HWPX는 변환 서비스 호출 시간 ↑ (수 초 ~ 수십 초 예상)
- 실패 시 명확한 에러 메시지 + 재시도 버튼

---

## 5. 기능 요구사항 (상세)

### 5.1 [최종 결과물 내보내기] 활성 조건
- Step 1 결과 있음(권장) **또는** Step 2 sections 있음 **또는** Step 3 bodies 있음
- 일부만 있어도 그 부분만 포함하여 출력 (사용자 자유)
- 아무것도 없으면 메뉴 비활성

### 5.2 통합 마크다운 생성 (Phase 3 1차 출력 소스)
모든 포맷은 **통합 마크다운**을 거쳐 변환된다 (단일 변환 소스 → 포맷별 일관성).

```markdown
# {사업명}
{신청기관} · {작성자} · {작성일}

---

## 1장. 사전 분석 (선택)
{step1.markdown}

---

## 2장. 사업계획서

### 1. {대분류 1 제목}
{step2 sections[0].markdown — 트리 구조의 마크다운 그대로}

#### 1.1 {중분류 1.1 제목}
{step3 bodies[0].markdown — 본문}

#### 1.2 {중분류 1.2 제목}
{step3 bodies[1].markdown}

### 2. {대분류 2 제목}
...

---

## 부록. 출처 리스트
{Step 3 본문의 [부록] 섹션들 자동 취합}
```

직렬화 함수: `src/features/outline/exportOutline.ts`의 기존 `exportOutlineAsMarkdown`을 확장하여 위 통합 마크다운을 만든다.

### 5.3 표지 메타 입력
- store에 `coverMeta: { projectName, organization, author, date, contact, includeStep1 }` 슬롯 추가
- 통합 마크다운 생성 시 상단에 표지 블록으로 삽입
- localStorage에 persist (다음 세션에도 재사용)

### 5.4 포맷별 변환 사양

#### DOCX (가장 안정적, 1차 채택)
- 라이브러리 후보 (택1, M24에서 결정):
  - **`pandoc`** (서버 binary) — 마크다운 → DOCX 가장 안정, 표·인용·헤딩 위계 자동 매핑
  - **`docx` (npm)** — JS로 직접 DOCX 빌드. pandoc 없이 가능하지만 마크다운 파싱 직접
- 권장: **pandoc** (`apt install pandoc` 또는 Docker 이미지에 포함)
- 폰트: 기본 맑은 고딕 (한국어 문서 표준)

#### PDF
- 라이브러리: **`puppeteer`** (headless Chromium으로 HTML → PDF)
- 흐름: 통합 마크다운 → react-markdown(서버 SSR) 또는 `markdown-it`로 HTML → puppeteer로 PDF
- CSS는 화면의 `.markdown-body` 스타일 재활용 (서식 일치)

#### HWPX (옵션, §6의 채택안에 따름)
- 옵션 A — **사내 변환 서비스 호출** (가용 시 1순위): DOCX → HWPX
- 옵션 B — **LibreOffice headless**: 서버에 LibreOffice 설치, `libreoffice --headless --convert-to hwpx`
  - 한국어 폰트 환경 필수 (`fonts-noto-cjk` 등)
  - 변환 시간 5~30초
- 옵션 C — **HWPX 직접 생성**: 라이브러리(`hwp.js` 등) 한계로 표·이미지 깨질 가능성 ↑ → 비추, fallback만
- 옵션 D — **사용자에게 DOCX만 주고 한컴 한글에서 직접 HWPX 저장하도록 안내** (Phase 3 1차에서는 이 길로 가도 무방)

### 5.5 서식 매핑 표 (★ 핵심 — 모든 포맷에서 보존)

| 마크다운 요소 | 화면 (현재) | DOCX | HWPX | PDF |
|---|---|---|---|---|
| `# H1` | 헤딩 1, 굵게, 크게 | Heading 1 스타일 | 제목 1 스타일 | h1 크게 굵게 |
| `## H2` | 헤딩 2 | Heading 2 | 제목 2 | h2 |
| `### H3` | 헤딩 3 | Heading 3 | 제목 3 | h3 |
| `**bold**` | 굵게 | Run bold | charPr bold | bold |
| `*italic*` | 기울임 | Run italic | charPr italic | italic |
| `` `code` `` | 모노 + 회색 배경 | Mono Run | charPr 폰트 + 배경 | mono + bg |
| ` ```code blocks``` ` | 박스 (회색) | Code Block 스타일 | 표(1셀, 회색) | code block |
| `> quote` | 좌측 라인, 회색 | Quote 스타일 | 들여쓰기 + 좌측 라인 | indent + 좌측선 |
| `- bullet` | 디스크 글머리 | Bullet list (●) | 글머리 (●) | bullet |
| `1. ordered` | 숫자 | Ordered list | 글머리 (숫자) | ordered |
| 중첩 list | 들여쓰기 | 들여쓰기 list | 들여쓰기 글머리 | 들여쓰기 |
| 표 `\|...\|` | HTML table + 테두리 | DOCX table + 테두리 | hp:tbl + 테두리 | table + 테두리 |
| `---` 수평선 | 가로선 | Page break or Line | 단락 + 가로선 | hr |
| 이모지 (📝 🔍 🎯 💡 📌 ⚠️ ✓ 등) | 유니코드 | 유니코드 (폰트 의존) | 유니코드 (폰트 의존) | 유니코드 |
| 링크 `[txt](url)` | 파랑 밑줄 | 하이퍼링크 (파랑) | 하이퍼링크 | 파랑 밑줄 |

**검증 방법**: M27에서 각 포맷마다 위 표의 모든 요소를 포함한 **검증 샘플 문서** 1개를 다운로드해 한컴 한글 / Word / PDF 뷰어 3개에서 비교.

---

## 6. 기술 스펙 — 라이브러리/인프라 선정

### 6.1 의사결정 트리 (M23 착수 전 확정)

```
사내 LibreOffice/한컴 변환 API 있나?
├─ 예 → 그걸 호출하여 HWPX 받기 (옵션 A) ★ 최우선 검토
└─ 아니오
    ├─ 서버에 LibreOffice 설치 OK?
    │   ├─ 예 → LibreOffice headless (옵션 B)
    │   └─ 아니오 → 옵션 D (DOCX만 + 한컴에서 직접 저장 안내)
    └─ HWPX 직접 생성 시도 (옵션 C) — fallback
```

DOCX·PDF는 모든 시나리오에서 동일하게 지원.

### 6.2 의존성 (서버, M24~M26)
- **`pandoc`**: 마크다운 → DOCX (apt install 또는 Docker)
  - 또는 `docx` (npm) — pandoc 없이 가능, 마크다운 파서 직접 (M24에서 비교 후 결정)
- **`puppeteer`**: PDF 변환 (headless Chromium)
- **`libreoffice`** (선택): HWPX 변환 (옵션 B 채택 시)
- **`markdown-it`** + `markdown-it-anchor`, `markdown-it-table`: HTML 생성 시 (PDF용)

### 6.3 변환 위치 — 서버 vs 클라이언트
- **서버**: pandoc, LibreOffice는 외부 binary라 서버 변환이 자연스러움
- **클라이언트**: 모든 마크다운 데이터가 이미 store에 있으니 클라이언트에서 일부 가능
  - DOCX: `docx` npm 라이브러리로 클라이언트에서도 가능
  - PDF: `puppeteer`는 서버 전용, `print()` API는 한계
  - HWPX: 클라이언트 어려움
- **권장**: 서버에 변환 라우트 추가 (`POST /api/export/:format`)

### 6.4 디렉토리 추가
```
prompts/                            # (변경 없음)
src/
└── features/
    └── export/
        ├── ExportDialog.tsx       # 표지 입력 + 포맷 선택 모달
        ├── exportTypes.ts         # CoverMeta, ExportFormat
        └── useExport.ts           # 다운로드 호출 훅

server/
└── src/
    ├── routes/
    │   └── export.ts             # POST /api/export/docx, /hwpx, /pdf
    └── exporters/
        ├── markdown.ts           # 통합 마크다운 빌드
        ├── docx.ts               # pandoc 또는 docx lib
        ├── pdf.ts                # puppeteer
        └── hwpx.ts               # LibreOffice 또는 사내 서비스 래퍼
```

---

## 7. API 명세

### `POST /api/export/:format`
- `format`: `docx` | `pdf` | `hwpx`
- Body:
  ```json
  {
    "outline": {/* OutlineState (Step 1·2·3) */},
    "coverMeta": {
      "projectName": "...",
      "organization": "...",
      "author": "...",
      "date": "2026-06-01",
      "contact": "...",
      "includeStep1": false
    }
  }
  ```
- Response:
  - 성공: `Content-Type: application/octet-stream` (또는 각 포맷 MIME) + `Content-Disposition: attachment; filename="..."`로 binary 파일 스트림
  - 실패: 기존 에러 포맷 `{ error: { code, message } }`
- 타임아웃: 120s (HWPX의 LibreOffice 변환 여유 있게)

---

## 8. 비기능 요구사항

| 항목 | 기준 |
|------|------|
| 변환 시간 (DOCX) | < 5초 |
| 변환 시간 (PDF) | < 15초 (puppeteer 부팅 포함) |
| 변환 시간 (HWPX, LibreOffice) | < 30초 (10초 부팅 + 변환) |
| 출력 파일 크기 | 일반 사업계획서 ≤ 2MB (이미지 X 기준) |
| 동시 변환 | 단일 사용자 가정 — 큐 불필요 |
| 폰트 | DOCX/PDF는 한국어 기본 (맑은 고딕 권장). HWPX는 한컴 기본 폰트 |
| 보안 | 변환 후 임시 파일은 즉시 삭제. 저장하지 않음 |

---

## 9. 마일스톤 (M23~)

> Phase 2가 M22까지 정의됐으므로 Phase 3는 M23부터.

- [ ] **M23** — 통합 마크다운 빌더(`server/src/exporters/markdown.ts`) + 표지 메타 store 슬롯 + ExportDialog UI 골격
- [ ] **M24** — DOCX 변환 (pandoc vs `docx` 결정 후 구현) + `/api/export/docx`
- [ ] **M25** — PDF 변환 (puppeteer + markdown-it + `.markdown-body` 스타일 임베드) + `/api/export/pdf`
- [ ] **M26** — HWPX 변환 (§6.1 의사결정에 따라 사내 API 또는 LibreOffice 또는 옵션 D) + `/api/export/hwpx`
- [ ] **M27** — 서식 매핑 검증 샘플 다운로드 (§5.5의 모든 요소 포함) + Word/한컴/PDF 뷰어 3종 검증 + 발견된 깨짐 보정
- [ ] **M28** — 진행 표시 UI · 에러 처리 정리 · README/spec 갱신

---

## 10. Phase 4+ 예고

- 사용자 계정, 프로젝트 영구 저장, 협업
- 평가 모드 (제출 전 자가 점검)
- 시각화 추천을 실제 표/차트로 자동 변환
- 한컴 한글 자동화(Windows + COM) 검토 (HWP 직접 생성)

---

## 11. 미해결 결정사항

| # | 주제 | 기본값(임시) | 확인 필요 시점 |
|---|------|--------------|-----------------|
| 1 | **HWPX 변환 경로** | 사내 변환 서비스 가용성 확인 후 결정 | M26 착수 전 — **사용자가 DevOps 문의 필요** |
| 2 | DOCX 라이브러리 | pandoc 우선, 안 되면 `docx` npm | M24 |
| 3 | 시각화 추천(`💡` 텍스트) 처리 | 텍스트로만 둠 (실제 차트 X) | Phase 3.5 |
| 4 | 표지 메타 항목 | §4.2 기본 5개로 진행 | M23 |
| 5 | Step 1 본문 포함 여부 | 기본 OFF (사전 분석은 내부 참고용) | M23 — UI에서 체크박스 |
| 6 | 다운로드 후 자동 정리 | 임시 파일 즉시 삭제 | M28 |
| 7 | 변환 실패 시 fallback | 사용자에게 다른 포맷 권유(예: HWPX 실패 → DOCX 자동 권유) | M28 |
