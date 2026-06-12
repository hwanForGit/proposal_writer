// 급여총액(사업계획서 연봉) 계산
//   작성 연봉(annualSalary)에 사업주부담 4대보험·퇴직급여충당금을 더해 추정.
//   R&D 사업계획서 작성 단계의 추정용. 과대계상 방지를 위해 보수적 요율 적용.
//
//   급여총액 = 연봉 + 사업주부담 4대보험 + 퇴직급여충당금
//   - 퇴직급여충당금 = 연봉 × 8.33%
//   - 사업주부담 4대보험 = 연봉 × 9.5%(보수적 기본값, 업종·기업별 변동 가능)
//   모든 금액은 원 단위 반올림.

export const RETIREMENT_RATE = 0.0833; // 퇴직급여충당금 요율
export const EMPLOYER_INSURANCE_RATE = 0.095; // 사업주부담 4대보험 요율(보수적 기본값)

export interface GrossSalary {
  annualSalary: number; // 작성 연봉(입력값, 원 단위 반올림)
  retirementReserve: number; // 퇴직급여충당금
  employerInsurance: number; // 사업주부담 4대보험
  grossSalary: number; // 급여총액(= 사업계획서 연봉)
}

export function calculateGrossSalary(annualSalary: number): GrossSalary {
  const base = Math.round(Number(annualSalary) || 0);
  const retirementReserve = Math.round(base * RETIREMENT_RATE);
  const employerInsurance = Math.round(base * EMPLOYER_INSURANCE_RATE);
  const grossSalary = base + retirementReserve + employerInsurance;
  return {
    annualSalary: base,
    retirementReserve,
    employerInsurance,
    grossSalary,
  };
}
