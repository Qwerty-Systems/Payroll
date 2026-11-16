export type StatutoryRule = { code: string; calculation_method: string; configuration: Record<string, unknown> };
export type KenyaPayrollResult = {
  gross: number; taxableIncome: number; paye: number; shif: number; nssf: number; housingLevy: number;
  employeeStatutoryDeductions: number; employerNssf: number; employerHousingLevy: number; nita: number;
  employerContributions: number; netBeforeOtherDeductions: number; warnings: string[]; lines: Array<{ code: string; amount: number; side: 'employee'|'employer' }>;
};
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const config = (rules: Map<string, StatutoryRule>, code: string) => {
  const rule = rules.get(code);
  if (!rule) throw new Error('Missing effective statutory rule: ' + code);
  return rule.configuration;
};

/** Pure monthly salaried-employee statutory calculation. It intentionally rejects unsupported or incomplete rule packs. */
export function calculateKenyaMonthlyPayroll(grossInput: number, sourceRules: StatutoryRule[]): KenyaPayrollResult {
  if (!Number.isFinite(grossInput) || grossInput < 0) throw new Error('Gross earnings must be a finite non-negative amount.');
  const gross = money(grossInput);
  const rules = new Map(sourceRules.map(rule => [rule.code, rule]));
  const payeCfg = config(rules,'PAYE');
  const shifCfg = config(rules,'SHIF');
  const nssfCfg = config(rules,'NSSF');
  const ahlCfg = config(rules,'AHL');
  const nitaCfg = config(rules,'NITA');
  const bands = payeCfg.annualBands as Array<{ upTo: number | null; rate: number }> | undefined;
  if (!Array.isArray(bands) || !bands.length || !bands.every(b => typeof b.rate === 'number' && b.rate >= 0 && (b.upTo === null || typeof b.upTo === 'number'))) throw new Error('PAYE annual tax bands are incomplete or invalid.');
  const shifRate = Number(shifCfg.rate);
  const nssfRate = Number(nssfCfg.employeeRate);
  const employerNssfRate = Number(nssfCfg.employerRate);
  const nssfUpper = Number(nssfCfg.upperEarningsLimit);
  const ahlRate = Number(ahlCfg.employeeRate);
  const employerAhlRate = Number(ahlCfg.employerRate);
  const nitaAmount = Number(nitaCfg.amount);
  if (![shifRate,nssfRate,employerNssfRate,nssfUpper,ahlRate,employerAhlRate,nitaAmount].every(Number.isFinite) || [shifRate,nssfRate,employerNssfRate,ahlRate,employerAhlRate,nitaAmount].some(v => v < 0) || nssfUpper <= 0) throw new Error('One or more statutory rates or limits are invalid.');

  const shif = money(gross * shifRate);
  const nssf = money(Math.min(gross,nssfUpper) * nssfRate);
  const employerNssf = money(Math.min(gross,nssfUpper) * employerNssfRate);
  const housingLevy = money(gross * ahlRate);
  const employerHousingLevy = money(gross * employerAhlRate);
  const allowableCfg = config(rules,'PAYE_ALLOWABLE_DEDUCTIONS');
  const components = allowableCfg.components as Array<{code:string;capMonthly:number|null}> | undefined;
  if (!Array.isArray(components)) throw new Error('PAYE allowable deduction configuration is missing.');
  const nssfCap = components.find(c => c.code === 'REGISTERED_PENSION_AND_NSSF')?.capMonthly;
  const pensionDeduction = nssfCap === null || nssfCap === undefined ? nssf : Math.min(nssf,Number(nssfCap));
  const taxableIncome = money(Math.max(0,gross - shif - housingLevy - pensionDeduction));
  const annualTaxable = taxableIncome * 12;
  let lower = 0; let annualTax = 0;
  for (const band of bands) {
    const upper = band.upTo === null ? Number.POSITIVE_INFINITY : band.upTo;
    const taxableInBand = Math.max(0,Math.min(annualTaxable,upper)-lower);
    annualTax += taxableInBand * band.rate;
    lower = upper;
    if (annualTaxable <= upper) break;
  }
  const monthlyRelief = Number(payeCfg.monthlyPersonalRelief ?? 0);
  const paye = money(Math.max(0,annualTax / 12 - monthlyRelief));
  const nita = money(nitaAmount);
  const employeeStatutoryDeductions = money(paye + shif + nssf + housingLevy);
  const employerContributions = money(employerNssf + employerHousingLevy + nita);
  const netBeforeOtherDeductions = money(gross - employeeStatutoryDeductions);
  const warnings: string[] = [];
  if (netBeforeOtherDeductions < 0) warnings.push('NET_PAY_NEGATIVE');
  if (payeCfg.annualBands && (payeCfg.annualBands as unknown[]).length) warnings.push('PAYE_CALCULATION_ASSUMES_FULL_MONTHLY_RESIDENT_EMPLOYMENT_AND_STANDARD_RELIEF');
  return {
    gross,taxableIncome,paye,shif,nssf,housingLevy,employeeStatutoryDeductions,employerNssf,employerHousingLevy,nita,employerContributions,netBeforeOtherDeductions,warnings,
    lines:[
      {code:'PAYE',amount:paye,side:'employee'},{code:'SHIF',amount:shif,side:'employee'},{code:'NSSF',amount:nssf,side:'employee'},
      {code:'AHL',amount:housingLevy,side:'employee'},{code:'NSSF_EMPLOYER',amount:employerNssf,side:'employer'},
      {code:'AHL_EMPLOYER',amount:employerHousingLevy,side:'employer'},{code:'NITA',amount:nita,side:'employer'},
    ],
  };
}
