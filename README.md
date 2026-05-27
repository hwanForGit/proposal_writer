# proposal_writer

Vite + React 19 + TypeScript + Tailwind CSS 4 + React Router 기반 프로젝트.

## 시작하기

```bash
npm install
npm run dev
```

기본 포트: `http://localhost:5173`

## 스크립트

| 명령              | 설명                          |
| ----------------- | ----------------------------- |
| `npm run dev`     | 개발 서버 실행                |
| `npm run build`   | 타입 체크 후 프로덕션 빌드    |
| `npm run preview` | 빌드 결과 로컬에서 미리보기   |
| `npm run lint`    | ESLint 검사                   |
| `npm run lint:fix`| ESLint 자동 수정              |
| `npm run format`  | Prettier 자동 포맷            |

## 디렉토리 구조

```
src/
├── main.tsx              # 앱 엔트리
├── routes/               # React Router 설정
├── pages/                # 라우트별 페이지 컴포넌트
├── components/
│   └── layout/           # 레이아웃 컴포넌트
├── hooks/                # 커스텀 훅
├── lib/                  # 유틸리티/외부 클라이언트
├── types/                # 공용 타입
└── styles/               # 전역 스타일 (Tailwind 진입점)
```

경로 alias: `@/` → `src/`
