export type StatutoryRule = { code: string; calculation_method: string; configuration: Record<string, unknown> };
export type KenyaPayrollResult = {
  gross: number; taxableIncome: number; paye: number; shif: number; nssf: number; housingLevy: number;
  employeeStatutoryDeductions: number; employerNssf: number; employerHousingLevy: number; nita: number;
  employerContributions: number; netBeforeOtherDeductions: number; warnings: string[]; lines: Array<{ code: string; amount: number; side: 'employee'|'employer' }>;
};
/*
 * Exact arithmetic: amounts are BigInt cents and rates are scaled integers (RATE_SCALE), so no binary floating point
 * is involved in any statutory figure. Every percentage is rounded half-up to the cent exactly once.
 */
const RATE_SCALE = 1_000_000_000_000n; // rates carry up to 12 decimal places
const toCents = (kes: number): bigint => BigInt(Math.round(kes * 100));
const fromCents = (cents: bigint): number => Number(cents) / 100;
const toScaledRate = (rate: number, label: string): bigint => {
  const fixed = rate.toFixed(12);
  if (Number(fixed) !== rate) throw new Error(label + ' has more than 12 decimal places.');
  return BigInt(fixed.replace('.', ''));
};
/** Divides non-negative integers rounding half-up. */
const divRoundHalfUp = (numerator: bigint, denominator: bigint): bigint => (numerator * 2n + denominator) / (denominator * 2n);
const percentOf = (cents: bigint, scaledRate: bigint): bigint => divRoundHalfUp(cents * scaledRate, RATE_SCALE);
const minBig = (a: bigint, b: bigint): bigint => (a < b ? a : b);
const maxBig = (a: bigint, b: bigint): bigint => (a > b ? a : b);
const config = (rules: Map<string, StatutoryRule>, code: string) => {
  const rule = rules.get(code);
  if (!rule) throw new Error('Missing effective statutory rule: ' + code);
  return rule.configuration;
};

/** Pure monthly salaried-employee statutory calculation. It intentionally rejects unsupported or incomplete rule packs. */
export function calculateKenyaMonthlyPayroll(grossInput: number, sourceRules: StatutoryRule[]): KenyaPayrollResult {
  if (!Number.isFinite(grossInput) || grossInput < 0) throw new Error('Gross earnings must be a finite non-negative amount.');
  const gross = toCents(grossInput);
  const rules = new Map<string, StatutoryRule>(sourceRules.map(rule => [rule.code, rule] as const));
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

  const shif = percentOf(gross, toScaledRate(shifRate,'SHIF rate'));
  const pensionable = minBig(gross, toCents(nssfUpper));
  const nssf = percentOf(pensionable, toScaledRate(nssfRate,'NSSF employee rate'));
  const employerNssf = percentOf(pensionable, toScaledRate(employerNssfRate,'NSSF employer rate'));
  const housingLevy = percentOf(gross, toScaledRate(ahlRate,'AHL employee rate'));
  const employerHousingLevy = percentOf(gross, toScaledRate(employerAhlRate,'AHL employer rate'));
  const allowableCfg = config(rules,'PAYE_ALLOWABLE_DEDUCTIONS');
  const components = allowableCfg.components as Array<{code:string;capMonthly:number|null}> | undefined;
  if (!Array.isArray(components)) throw new Error('PAYE allowable deduction configuration is missing.');
  const nssfCap = components.find(c => c.code === 'REGISTERED_PENSION_AND_NSSF')?.capMonthly;
  const pensionDeduction = nssfCap === null || nssfCap === undefined ? nssf : minBig(nssf, toCents(Number(nssfCap)));
  const taxableIncome = maxBig(0n, gross - shif - housingLevy - pensionDeduction);
  const annualTaxable = taxableIncome * 12n;
  // Tax is accumulated unrounded (cents x RATE_SCALE) across bands and rounded once, after dividing by 12 and applying relief.
  let lower = 0n; let annualTaxScaled = 0n;
  for (const band of bands) {
    const upper = band.upTo === null ? null : toCents(band.upTo);
    const ceiling = upper === null ? annualTaxable : minBig(annualTaxable, upper);
    const taxableInBand = maxBig(0n, ceiling - lower);
    annualTaxScaled += taxableInBand * toScaledRate(band.rate,'PAYE band rate');
    if (upper === null || annualTaxable <= upper) break;
    lower = upper;
  }
  const monthlyReliefCents = toCents(Number(payeCfg.monthlyPersonalRelief ?? 0));
  const payeScaledNumerator = maxBig(0n, annualTaxScaled - monthlyReliefCents * 12n * RATE_SCALE);
  const paye = divRoundHalfUp(payeScaledNumerator, 12n * RATE_SCALE);
  const nita = toCents(nitaAmount);
  const employeeStatutoryDeductions = paye + shif + nssf + housingLevy;
  const employerContributions = employerNssf + employerHousingLevy + nita;
  const netBeforeOtherDeductions = gross - employeeStatutoryDeductions;
  const warnings: string[] = [];
  if (netBeforeOtherDeductions < 0n) warnings.push('NET_PAY_NEGATIVE');
  if (payeCfg.annualBands && (payeCfg.annualBands as unknown[]).length) warnings.push('PAYE_CALCULATION_ASSUMES_FULL_MONTHLY_RESIDENT_EMPLOYMENT_AND_STANDARD_RELIEF');
  return {
    gross: fromCents(gross), taxableIncome: fromCents(taxableIncome), paye: fromCents(paye), shif: fromCents(shif), nssf: fromCents(nssf),
    housingLevy: fromCents(housingLevy), employeeStatutoryDeductions: fromCents(employeeStatutoryDeductions), employerNssf: fromCents(employerNssf),
    employerHousingLevy: fromCents(employerHousingLevy), nita: fromCents(nita), employerContributions: fromCents(employerContributions),
    netBeforeOtherDeductions: fromCents(netBeforeOtherDeductions), warnings,
    lines:[
      {code:'PAYE',amount:fromCents(paye),side:'employee'},{code:'SHIF',amount:fromCents(shif),side:'employee'},{code:'NSSF',amount:fromCents(nssf),side:'employee'},
      {code:'AHL',amount:fromCents(housingLevy),side:'employee'},{code:'NSSF_EMPLOYER',amount:fromCents(employerNssf),side:'employer'},
      {code:'AHL_EMPLOYER',amount:fromCents(employerHousingLevy),side:'employer'},{code:'NITA',amount:fromCents(nita),side:'employer'},
    ],
  };
}
