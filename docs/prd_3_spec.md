# Proposal Writer — Phase 3 기획서

> 원본: [`/docs/prd_3.md`](./prd_3.md)
> 선행 문서: [`/docs/prd_1_spec.md`](./prd_1_spec.md), [`/docs/prd_2_spec.md`](./prd_2_spec.md)
> Phase 3는 Phase 1·2 완료(Step 1·2·3 본문 작성 완료)를 전제로 한다.

---

## 1. Phase 3 한 줄 목표

Step 1·2·3까지 완성된 사업계획서 본문을 **화면 마크다운 서식(글머리 기호·강조·표·인용·헤딩 등)을 그대로 보존한 채** **DOCX / PDF** 파일로 다운로드 받을 수 있게 한다. **HWPX 변환은 한컴 한글에 위임**(사용자가 DOCX를 열어 다른 이름으로 저장).

> **★ 1순위 제약 (사용자 요구)**
> 어떤 포맷이든 다운로드 결과물이 화면 출력 형태를 **충실히 반영**해야 함:
> 글머리 기호, **굵게**, *기울임*, `코드`, > 인용, 표, 헤딩 위계, 이모지(📝 🔍 🎯 💡 📌 ⚠️ ✓ 등), 구분선, 링크

---

## 2. 범위 (Scope)

### 2.1 In-scope
- 단일 통합 문서 생성: Step 1 + Step 2 + Step 3 모든 결과 합본
- **표지 메타 입력 UI** (사업명·신청기관·작성자·작성일·연락처 등, 선택)
- **DOCX 다운로드** (1차 목표 — 한컴 한글에서 열어 HWPX 저장 가능)
- **PDF 다운로드** (미리보기·공유용)
- 모든 포맷에서 §5.5 서식 매핑 표 100% 보존
- 다운로드 진행 상태 표시 + 에러 처리

### 2.2 Out-of-scope
- **HWP / HWPX 직접 생성** — 외부 도구로 안정적 생성 불가, 라이브러리 한계로 표·이미지 깨짐 잦음. 사용자가 한컴 한글에서 직접 저장하도록 안내만.
- 시각화 추천(`💡 표 삽입 권장`) 텍스트를 실제 차트·이미지로 변환 — Phase 3.5에서 검토
- 사용자 계정/협업/저장소 — Phase 4
- 워터마크·전자서명·한컴 자동화(COM) — 별도

---

## 3. 사용자 흐름

```
Step 3 모든 본문 완료 (또는 일부 완료)
      ↓
헤더 [내보내기 ▾]에서 DOCX 또는 PDF 선택
      ↓
[표지 정보 입력] 모달 (선택 — 빈 채로도 진행 가능)
  - 사업명, 신청기관, 작성자, 작성일, 연락처 …
      ↓
서버에서 통합 마크다운 → 선택 포맷 변환 → 다운로드
      ↓
(HWPX가 필요하면) 사용자가 한컴 한글에서 DOCX 열어 다른 이름으로 저장
```

---

## 4. 화면 사양

### 4.1 헤더 [내보내기 ▾] 메뉴 확장
기존:
```
내보내기 ▾
├─ Markdown (.md)
└─ JSON (.json)
```
확장:
```
내보내기 ▾
├─ 📝 사업계획서 (DOCX) — Word 호환 · 한컴에서 HWPX로 저장 가능
├─ 📝 사업계획서 (PDF) — 미리보기·공유용
├─ ──────────
├─ Markdown (.md) — 원본
└─ JSON (.json) — 백업/복원
```

### 4.2 표지 정보 입력 모달 (선택)
DOCX·PDF 선택 시 한 번 뜸 ("다음에 묻지 않기" 옵션):

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
- DOCX 5초 이내, PDF 15초 이내 예상
- 실패 시 명확한 에러 메시지 + 재시도 버튼

---

## 5. 기능 요구사항 (상세)

### 5.1 [내보내기] 활성 조건
- Step 1 결과 있음 **또는** Step 2 sections 있음 **또는** Step 3 bodies 있음
- 일부만 있어도 그 부분만 포함하여 출력
- 아무것도 없으면 DOCX·PDF 항목 비활성

### 5.2 통합 마크다운 생성 (모든 포맷의 단일 변환 소스)

```markdown
# {사업명}
{신청기관} · {작성자} · {작성일}

---

## 1장. 사전 분석 (선택)
{step1.markdown}

---

## 2장. 사업계획서

### 1. {대분류 1 제목}
{step2.sections[0].markdown — 트리 구조의 마크다운 그대로}

#### 1.1 {중분류 1.1 제목}
{step3.bodies[0].markdown — 본문}

#### 1.2 {중분류 1.2 제목}
{step3.bodies[1].markdown}

### 2. {대분류 2 제목}
...

---

## 부록. 출처 리스트
{Step 3 본문의 [부록] 섹션들 자동 취합}
```

기존 `exportOutlineAsMarkdown` 확장. DOCX·PDF는 이 통합 마크다운을 변환한다.

### 5.3 표지 메타 입력
- store에 `coverMeta: { projectName, organization, author, date, contact, includeStep1 }` 슬롯 추가
- 통합 마크다운 생성 시 상단에 표지 블록으로 삽입
- localStorage에 persist (다음 세션에도 재사용)

### 5.4 포맷별 변환 사양

#### DOCX (1차 채택)
- 라이브러리 후보 (M24에서 결정):
  - **`pandoc`** (서버 binary, **권장**) — 마크다운 → DOCX 가장 안정. 표·인용·헤딩 위계·이모지 자동 매핑
  - **`docx` (npm)** — pandoc 없이 JS로 DOCX 빌드. 마크다운 파서(`markdown-it` 등)와 조합 필요
- 폰트: 기본 맑은 고딕 (한국어 문서 표준)
- 화면 `.markdown-body` CSS와 동등한 스타일 매핑 (§5.5)

#### PDF
- 라이브러리: **`puppeteer`** (headless Chromium으로 HTML → PDF)
- 흐름: 통합 마크다운 → `markdown-it`로 HTML 생성 → 화면의 `.markdown-body` CSS를 inline으로 임베드 → puppeteer로 PDF
- **장점**: 화면 CSS를 그대로 가져다 쓰므로 외형 100% 일치 보장

### 5.5 서식 매핑 표 (★ 핵심 — 모든 포맷에서 보존)

| 마크다운 요소 | 화면 (현재) | DOCX | PDF |
|---|---|---|---|
| `# H1` | 헤딩 1, 굵게, 크게 | Heading 1 스타일 | h1 크게 굵게 |
| `## H2` | 헤딩 2 | Heading 2 | h2 |
| `### H3` | 헤딩 3 | Heading 3 | h3 |
| `**bold**` | 굵게 | Run bold | bold |
| `*italic*` | 기울임 | Run italic | italic |
| `` `code` `` | 모노 + 회색 배경 | Mono Run | mono + bg |
| ` ```code blocks``` ` | 박스 (회색) | Code Block 스타일 | code block |
| `> quote` | 좌측 라인, 회색 | Quote 스타일 | indent + 좌측선 |
| `- bullet` | 디스크 글머리 | Bullet list (●) | bullet |
| `1. ordered` | 숫자 | Ordered list | ordered |
| 중첩 list | 들여쓰기 | 들여쓰기 list | 들여쓰기 |
| 표 `\|...\|` | HTML table + 테두리 | DOCX table + 테두리 | table + 테두리 |
| `---` 수평선 | 가로선 | Page break or Line | hr |
| 이모지 (📝 🔍 🎯 💡 📌 ⚠️ ✓ 등) | 유니코드 | 유니코드 (폰트 의존) | 유니코드 |
| 링크 `[txt](url)` | 파랑 밑줄 | 하이퍼링크 (파랑) | 파랑 밑줄 |

**검증 방법**: M27에서 위 표의 모든 요소를 포함한 **검증 샘플 문서** 1개를 DOCX·PDF로 받아 Word / PDF 뷰어로 비교.

---

## 6. 기술 스펙

### 6.1 의존성 (서버)
- **`pandoc`** (권장): apt install pandoc 또는 Docker 이미지에 포함. 마크다운 → DOCX
  - 대안: `docx` (npm) + `markdown-it` (M24에서 비교 후 결정)
- **`puppeteer`**: PDF 변환 (headless Chromium)
- **`markdown-it`** + `markdown-it-anchor`, 표·코드 하이라이트 플러그인: HTML 생성

### 6.2 변환 위치 — 서버 vs 클라이언트
- **서버 채택**: pandoc·puppeteer는 외부 binary라 서버 변환이 자연스러움
- 클라이언트는 store의 `outline` + `coverMeta`를 body로 POST → 서버가 변환 → binary 스트림 응답

### 6.3 디렉토리 추가
```
src/
└── features/
    └── export/
        ├── ExportDialog.tsx       # 표지 입력 + 포맷 선택 모달
        ├── exportTypes.ts         # CoverMeta, ExportFormat
        └── useExport.ts           # 다운로드 호출 훅

server/
└── src/
    ├── routes/
    │   └── export.ts             # POST /api/export/docx, /pdf
    └── exporters/
        ├── markdown.ts           # 통합 마크다운 빌드
        ├── docx.ts               # pandoc 또는 docx lib
        └── pdf.ts                # puppeteer
```

---

## 7. API 명세

### `POST /api/export/:format`
- `format`: `docx` | `pdf`
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
- 타임아웃: 60s

---

## 8. 비기능 요구사항

| 항목 | 기준 |
|------|------|
| 변환 시간 (DOCX) | < 5초 |
| 변환 시간 (PDF) | < 15초 (puppeteer 부팅 포함) |
| 출력 파일 크기 | 일반 사업계획서 ≤ 2MB |
| 동시 변환 | 단일 사용자 가정 — 큐 불필요 |
| 폰트 | 한국어 기본 (맑은 고딕 권장) |
| 보안 | 변환 후 임시 파일 즉시 삭제 |

---

## 9. 마일스톤 (M23~)

- [x] **M23** — 통합 마크다운 빌더 + 표지 메타 store 슬롯 + ExportDialog UI 골격
- [x] **M24** — DOCX 변환 (pandoc 채택) + `/api/export/docx`
- [x] **M25** — PDF 변환 (puppeteer + markdown-it + `.markdown-body` 스타일 임베드) + `/api/export/pdf`
- [x] **M26** — 서식 매핑 검증 샘플(§5.5 13요소) + Dialog 안 "🔧 서식 매핑 검증" 패널
- [x] **M27** — 다운로드 성공 안내(녹색 박스) · "한컴에서 HWPX로 저장" 안내 메시지 · README/spec 갱신

---

## 10. Phase 4+ 예고

- 사용자 계정, 프로젝트 영구 저장, 협업
- 평가 모드 (제출 전 자가 점검)
- 시각화 추천을 실제 표/차트로 자동 변환
- 한컴 한글 자동화(Windows + COM)로 HWP 직접 생성 검토

---

## 11. 미해결 결정사항

| # | 주제 | 기본값(임시) | 확인 필요 시점 |
|---|------|--------------|-----------------|
| 1 | DOCX 라이브러리 | **pandoc 우선**, 안 되면 `docx` npm | M24 |
| 2 | 시각화 추천(`💡` 텍스트) 처리 | 텍스트로만 둠 (실제 차트 X) | Phase 3.5 |
| 3 | 표지 메타 항목 | §4.2 기본 5개로 진행 | M23 |
| 4 | Step 1 본문 포함 여부 | 기본 OFF (사전 분석은 내부 참고용) | M23 — UI에서 체크박스 |
| 5 | 다운로드 후 자동 정리 | 임시 파일 즉시 삭제 | M27 |
| 6 | 변환 실패 시 fallback | 사용자에게 다른 포맷 권유 (예: PDF 실패 → DOCX 권유) | M27 |
| 7 | "한컴에서 HWPX 저장" 안내 위치 | 다운로드 완료 후 toast로 1회 안내 | M27 |
