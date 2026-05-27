import type { OutlineNode } from './types';

export const DUMMY_OUTLINE: OutlineNode[] = [
  {
    id: '1',
    title: '1. 사업 개요',
    source: 'template',
    children: [
      {
        id: '1.1',
        title: '1.1 추진 배경 및 필요성',
        source: 'template',
        children: [],
      },
      {
        id: '1.2',
        title: '1.2 사업 목적',
        source: 'template',
        children: [],
      },
    ],
  },
  {
    id: '2',
    title: '2. 사업 추진 전략',
    source: 'announcement',
    description: '공고문 §3 평가 항목에서 강조됨',
    children: [
      {
        id: '2.1',
        title: '2.1 핵심 추진 전략',
        source: 'derived',
        description: '회사의 강점(AI 모델 운영 경험)을 차별화 포인트로 기술',
        children: [],
      },
      {
        id: '2.2',
        title: '2.2 단계별 추진 일정',
        source: 'template',
        children: [],
      },
    ],
  },
  {
    id: '3',
    title: '3. 기술 개발 내용',
    source: 'announcement',
    description: '공고가 요구하는 기술 사양 반영 필요',
    children: [
      {
        id: '3.1',
        title: '3.1 보유 기술 및 역량',
        source: 'derived',
        description: '회사 기술 자료의 핵심 역량 3가지를 매칭',
        children: [],
      },
      {
        id: '3.2',
        title: '3.2 개발 범위',
        source: 'template',
        children: [
          {
            id: '3.2.1',
            title: '3.2.1 핵심 기능',
            source: 'derived',
            children: [],
          },
          {
            id: '3.2.2',
            title: '3.2.2 차별점',
            source: 'derived',
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: '4',
    title: '4. 기대효과',
    source: 'template',
    children: [
      {
        id: '4.1',
        title: '4.1 정량적 효과',
        source: 'template',
        description: '매출 자료 기반 수치 제시',
        children: [],
      },
      {
        id: '4.2',
        title: '4.2 정성적 효과',
        source: 'template',
        children: [],
      },
    ],
  },
];
