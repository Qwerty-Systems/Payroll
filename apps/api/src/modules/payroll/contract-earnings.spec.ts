import { calculateContractEarnings } from './contract-earnings';

describe('calculateContractEarnings',()=>{
  const base={periodStart:'2026-11-01',periodEnd:'2026-11-30',contractStart:'2026-11-01',rate:1000};
  it('calculates a fixed monthly salary for a full payroll month',()=>expect(calculateContractEarnings({...base,payBasis:'monthly'})).toMatchObject({amount:1000,quantity:1,unit:'month'}));
  it('blocks a partial-month salaried contract instead of guessing a proration rule',()=>{
    const result=calculateContractEarnings({...base,contractStart:'2026-11-16',payBasis:'monthly'});
    expect(result.amount).toBe(0);
    expect(result.warnings).toContain('MONTHLY_CONTRACT_PARTIAL_PERIOD_REQUIRES_REVIEW');
  });
  it('calculates weekly salary for covered calendar days',()=>expect(calculateContractEarnings({...base,payBasis:'weekly'}).amount).toBe(4285.71));
  it('calculates daily wages from approved days only',()=>expect(calculateContractEarnings({...base,payBasis:'daily',approvedDays:8}).amount).toBe(8000));
  it('calculates hourly wages from approved minutes only',()=>expect(calculateContractEarnings({...base,payBasis:'hourly',approvedMinutes:4800}).amount).toBe(80000));
  it('calculates piecework from approved output quantities only',()=>expect(calculateContractEarnings({...base,payBasis:'per_unit',approvedUnits:12}).amount).toBe(12000));
  it('returns zero and a warning when no approved unit quantity exists',()=>expect(calculateContractEarnings({...base,payBasis:'per_unit'}).warnings).toContain('NO_APPROVED_EARNING_UNITS'));
  it('rejects negative rates',()=>expect(()=>calculateContractEarnings({...base,payBasis:'daily',rate:-1})).toThrow('Contract rate'));
});
