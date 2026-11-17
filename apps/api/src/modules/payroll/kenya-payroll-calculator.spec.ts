import { calculateKenyaMonthlyPayroll, type StatutoryRule } from './kenya-payroll-calculator';

const rules: StatutoryRule[] = [
  {code:'PAYE',calculation_method:'progressive_annualized',configuration:{annualBands:[{upTo:288000,rate:0.1},{upTo:388000,rate:0.25},{upTo:6000000,rate:0.3},{upTo:9600000,rate:0.325},{upTo:null,rate:0.35}],monthlyPersonalRelief:2400}},
  {code:'SHIF',calculation_method:'percentage_with_minimum',configuration:{rate:0.0275,minimumMonthly:300,base:'gross_salary_or_wage'}},
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
    expect(result.nssfTierOne).toBe(540);
    expect(result.nssfTierTwo).toBe(5460);
    expect(result.housingLevy).toBe(1500);
    expect(result.taxableIncome).toBe(89750);
    expect(result.paye).toBe(19308.33);
    expect(result.netBeforeOtherDeductions).toBe(70441.67);
    expect(result.employerContributions).toBe(7550);
    expect(result.lines.find(line=>line.code==='NSSF_TIER_I')?.amount).toBe(540);
  });
  it('applies the configured SHIF monthly minimum for low salaries',()=>{
    const result=calculateKenyaMonthlyPayroll(10000,rules);
    expect(result.shif).toBe(300);
  });
  it('does not charge SHIF on a zero-pay record',()=>{
    expect(calculateKenyaMonthlyPayroll(0,rules).shif).toBe(0);
  });
  it('calculates NSSF Tier I and Tier II at the 2026 Year 4 limits',()=>{
    const below=calculateKenyaMonthlyPayroll(5000,rules);
    expect(below.nssfTierOne).toBe(300);
    expect(below.nssfTierTwo).toBe(0);
    const atLel=calculateKenyaMonthlyPayroll(9000,rules);
    expect(atLel.nssfTierOne).toBe(540);
    expect(atLel.nssfTierTwo).toBe(0);
    const aboveLel=calculateKenyaMonthlyPayroll(10000,rules);
    expect(aboveLel.nssfTierOne).toBe(540);
    expect(aboveLel.nssfTierTwo).toBe(60);
  });
  it('caps NSSF pensionable earnings at the Year 4 upper limit',()=>{
    const result=calculateKenyaMonthlyPayroll(200000,rules);
    expect(result.nssf).toBe(6480);
    expect(result.employerNssf).toBe(6480);
    expect(result.employerNssfTierOne).toBe(540);
    expect(result.employerNssfTierTwo).toBe(5940);
  });
  it('returns zero employee deductions when gross earnings are zero',()=>{
    const result=calculateKenyaMonthlyPayroll(0,rules);
    expect(result.netBeforeOtherDeductions).toBe(0);
    expect(result.employeeStatutoryDeductions).toBe(0);
  });
  it('rejects negative earnings',()=>expect(()=>calculateKenyaMonthlyPayroll(-1,rules)).toThrow('Gross earnings'));
  it('rejects a missing statutory rule',()=>expect(()=>calculateKenyaMonthlyPayroll(10000,rules.filter(r=>r.code!=='SHIF'))).toThrow('SHIF'));
  it('rounds half-up to the exact cent where binary floating point rounds down (regression)',()=>{
    expect(calculateKenyaMonthlyPayroll(341070,rules).shif).toBe(9379.43);
    expect(calculateKenyaMonthlyPayroll(11000.5,rules).housingLevy).toBe(165.01);
  });
  it('matches an independent exact-integer reference for SHIF and AHL across many salaries',()=>{
    const ref=(cents:bigint,num:bigint,den:bigint)=>{const n=cents*num;const q=n/den;return (n%den)*2n>=den?q+1n:q;};
    let seed=12345;const rand=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
    for(let i=0;i<20000;i++){
      const cents=BigInt(Math.floor(rand()*60_000_000)+1);
      const r=calculateKenyaMonthlyPayroll(Number(cents)/100,rules);
      const percentage=ref(cents,275n,10000n);
      const minimum=30000n;
      expect(Math.round(r.shif*100)).toBe(Number(cents===0n?0n:(percentage>minimum?percentage:minimum)));
      expect(Math.round(r.housingLevy*100)).toBe(Number(ref(cents,15n,1000n)));
    }
  });
  it('keeps components consistent: gross minus employee deductions equals net',()=>{
    for(const g of [1,8999.99,9000,24000.5,32333,108000,250000.25,1_000_000]){
      const r=calculateKenyaMonthlyPayroll(g,rules);
      expect(Math.round(r.netBeforeOtherDeductions*100)).toBe(Math.round(r.gross*100)-Math.round(r.employeeStatutoryDeductions*100));
      expect(Math.round(r.employeeStatutoryDeductions*100)).toBe(Math.round(r.paye*100)+Math.round(r.shif*100)+Math.round(r.nssf*100)+Math.round(r.housingLevy*100));
    }
  });
  it('rejects rates that cannot be represented exactly',()=>{
    const bad=rules.map(r=>r.code==='SHIF'?{...r,configuration:{...r.configuration,rate:0.0275000000000001}}:r);
    expect(()=>calculateKenyaMonthlyPayroll(1000,bad)).toThrow('decimal places');
  });
});
