import { calculateKenyaMonthlyPayroll, type StatutoryRule } from './kenya-payroll-calculator';

const rules: StatutoryRule[] = [
  {code:'PAYE',calculation_method:'progressive_annualized',configuration:{annualBands:[{upTo:288000,rate:0.1},{upTo:388000,rate:0.25},{upTo:6000000,rate:0.3},{upTo:9600000,rate:0.325},{upTo:null,rate:0.35}],monthlyPersonalRelief:2400}},
  {code:'SHIF',calculation_method:'percentage_with_minimum',configuration:{rate:0.0275,base:'gross_salary_or_wage'}},
  {code:'NSSF',calculation_method:'tiered_percentage',configuration:{employeeRate:0.06,employerRate:0.06,lowerEarningsLimit:9000,upperEarningsLimit:108000}},
  {code:'AHL',calculation_method:'percentage_of_gross_with_employer_match',configuration:{employeeRate:0.015,employerRate:0.015}},
  {code:'NITA',calculation_method:'fixed_per_employee_per_month',configuration:{amount:50}},
  {code:'PAYE_ALLOWABLE_DEDUCTIONS',calculation_method:'capped_components',configuration:{components:[{code:'SHIF',capMonthly:null},{code:'AHL',capMonthly:null},{code:'REGISTERED_PENSION_AND_NSSF',capMonthly:30000}]}}
];

describe('calculateKenyaMonthlyPayroll',()=>{
  it('calculates employee deductions and employer contributions for KES 100,000 gross',()=>{
    const result=calculateKenyaMonthlyPayroll(100000,rules);
    expect(result.shif).toBe(2750);
    expect(result.nssf).toBe(6000);
    expect(result.housingLevy).toBe(1500);
    expect(result.taxableIncome).toBe(89750);
    expect(result.paye).toBe(19308.33);
    expect(result.netBeforeOtherDeductions).toBe(70441.67);
    expect(result.employerContributions).toBe(7550);
  });
  it('caps NSSF pensionable earnings at the Year 4 upper limit',()=>{
    const result=calculateKenyaMonthlyPayroll(200000,rules);
    expect(result.nssf).toBe(6480);
    expect(result.employerNssf).toBe(6480);
  });
  it('returns zero employee deductions when gross earnings are zero',()=>{
    const result=calculateKenyaMonthlyPayroll(0,rules);
    expect(result.netBeforeOtherDeductions).toBe(0);
    expect(result.employeeStatutoryDeductions).toBe(0);
  });
  it('rejects negative earnings',()=>expect(()=>calculateKenyaMonthlyPayroll(-1,rules)).toThrow('Gross earnings'));
  it('rejects a missing statutory rule',()=>expect(()=>calculateKenyaMonthlyPayroll(10000,rules.filter(r=>r.code!=='SHIF'))).toThrow('SHIF'));
});
