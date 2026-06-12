// Vitest(Jest 호환 API) 테스트.  실행: npm test
import { describe, it, expect } from 'vitest';
import {
  calculateGrossSalary,
  RETIREMENT_RATE,
  EMPLOYER_INSURANCE_RATE,
} from './grossSalary';

describe('calculateGrossSalary', () => {
  it('연봉 60,000,000원 예시', () => {
    const r = calculateGrossSalary(60_000_000);
    expect(r.annualSalary).toBe(60_000_000);
    expect(r.retirementReserve).toBe(4_998_000); // 60,000,000 × 8.33%
    expect(r.employerInsurance).toBe(5_700_000); // 60,000,000 × 9.5%
    expect(r.grossSalary).toBe(70_698_000); // 합계
  });

  it('급여총액 = 연봉 + 퇴직급여충당금 + 4대보험', () => {
    const r = calculateGrossSalary(48_500_000);
    expect(r.grossSalary).toBe(
      r.annualSalary + r.retirementReserve + r.employerInsurance,
    );
  });

  it('원 단위 반올림 처리', () => {
    const base = 33_333_333;
    const r = calculateGrossSalary(base);
    expect(r.retirementReserve).toBe(Math.round(base * RETIREMENT_RATE));
    expect(r.employerInsurance).toBe(Math.round(base * EMPLOYER_INSURANCE_RATE));
    // 정수만 반환
    expect(Number.isInteger(r.retirementReserve)).toBe(true);
    expect(Number.isInteger(r.employerInsurance)).toBe(true);
    expect(Number.isInteger(r.grossSalary)).toBe(true);
  });

  it('0원·비정상 입력은 0으로 처리', () => {
    expect(calculateGrossSalary(0)).toEqual({
      annualSalary: 0,
      retirementReserve: 0,
      employerInsurance: 0,
      grossSalary: 0,
    });
    expect(calculateGrossSalary(NaN).grossSalary).toBe(0);
  });
});
