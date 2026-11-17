export type StatutoryRule = { code: string; calculation_method: string; configuration: Record<string, unknown> };
export type KenyaPayrollResult = {
  gross: number; taxableIncome: number; paye: number; shif: number; nssf: number;
  nssfTierOne: number; nssfTierTwo: number; housingLevy: number;
  employeeStatutoryDeductions: number; employerNssf: number;
  employerNssfTierOne: number; employerNssfTierTwo: number;
  employerHousingLevy: number; nita: number; employerContributions: number;
  netBeforeOtherDeductions: number; warnings: string[];
  lines: Array<{ code: string; amount: number; side: 'employee'|'employer' }>;
};
/*
 * Exact arithmetic: statutory amounts are BigInt cents and rates are scaled integers.
 * Percentages are rounded half-up to the cent. The rule configuration is versioned
 * and snapshotted by PayrollService before this pure calculation is called.
 */
const RATE_SCALE = 1_000_000_000_000n;
const toCents = (kes: number): bigint => {
  if (!Number.isFinite(kes) || kes < 0) throw new Error('Statutory configuration amounts must be finite and non-negative.');
  return BigInt(Math.round(kes * 100));
};
const fromCents = (cents: bigint): number => Number(cents) / 100;
const toScaledRate = (rate: number, label: string): bigint => {
  if (!Number.isFinite(rate) || rate < 0) throw new Error(label + ' must be a finite non-negative rate.');
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

/** Pure monthly salaried-employee statutory calculation. Incomplete rule packs are rejected. */
export function calculateKenyaMonthlyPayroll(grossInput: number, sourceRules: StatutoryRule[]): KenyaPayrollResult {
  if (!Number.isFinite(grossInput) || grossInput < 0) throw new Error('Gross earnings must be a finite non-negative amount.');
  const gross = toCents(grossInput);
  const rules = new Map<string, StatutoryRule>(sourceRules.map(rule => [rule.code, rule] as const));
  const payeCfg = config(rules, 'PAYE');
  const shifCfg = config(rules, 'SHIF');
  const nssfCfg = config(rules, 'NSSF');
  const ahlCfg = config(rules, 'AHL');
  const nitaCfg = config(rules, 'NITA');
  const bands = payeCfg.annualBands as Array<{ upTo: number | null; rate: number }> | undefined;
  if (!Array.isArray(bands) || !bands.length || !bands.every(b => typeof b.rate === 'number' && b.rate >= 0 && (b.upTo === null || (typeof b.upTo === 'number' && b.upTo >= 0)))) {
    throw new Error('PAYE annual tax bands are incomplete or invalid.');
  }
  const shifRate = Number(shifCfg.rate);
  const shifMinimum = Number(shifCfg.minimumMonthly ?? 0);
  const nssfRate = Number(nssfCfg.employeeRate);
  const employerNssfRate = Number(nssfCfg.employerRate);
  const nssfLower = Number(nssfCfg.lowerEarningsLimit);
  const nssfUpper = Number(nssfCfg.upperEarningsLimit);
  const ahlRate = Number(ahlCfg.employeeRate);
  const employerAhlRate = Number(ahlCfg.employerRate);
  const nitaAmount = Number(nitaCfg.amount);
  if (![shifRate, shifMinimum, nssfRate, employerNssfRate, nssfLower, nssfUpper, ahlRate, employerAhlRate, nitaAmount].every(Number.isFinite)
    || [shifRate, shifMinimum, nssfRate, employerNssfRate, ahlRate, employerAhlRate, nitaAmount].some(v => v < 0)
    || nssfLower < 0 || nssfUpper <= 0 || nssfLower > nssfUpper) {
    throw new Error('One or more statutory rates, minimums or limits are invalid.');
  }

  // SHIF for salaried contributors is 2.75% of gross salary/wage, subject to the configured monthly minimum.
  const shifPercentage = percentOf(gross, toScaledRate(shifRate, 'SHIF rate'));
  const shif = gross === 0n ? 0n : maxBig(shifPercentage, toCents(shifMinimum));

  // NSSF Year 4: Tier I applies up to the LEL; Tier II applies to pensionable pay above
  // the LEL and up to the UEL. Separate line items are retained for payslips/reconciliation.
  const lowerLimit = toCents(nssfLower);
  const upperLimit = toCents(nssfUpper);
  const tierOneBase = minBig(gross, lowerLimit);
  const tierTwoBase = minBig(maxBig(gross - lowerLimit, 0n), upperLimit - lowerLimit);
  const employeeRate = toScaledRate(nssfRate, 'NSSF employee rate');
  const employerRate = toScaledRate(employerNssfRate, 'NSSF employer rate');
  const nssfTierOne = percentOf(tierOneBase, employeeRate);
  const nssfTierTwo = percentOf(tierTwoBase, employeeRate);
  const employerNssfTierOne = percentOf(tierOneBase, employerRate);
  const employerNssfTierTwo = percentOf(tierTwoBase, employerRate);
  const nssf = nssfTierOne + nssfTierTwo;
  const employerNssf = employerNssfTierOne + employerNssfTierTwo;

  const housingLevy = percentOf(gross, toScaledRate(ahlRate, 'AHL employee rate'));
  const employerHousingLevy = percentOf(gross, toScaledRate(employerAhlRate, 'AHL employer rate'));
  const allowableCfg = config(rules, 'PAYE_ALLOWABLE_DEDUCTIONS');
  const components = allowableCfg.components as Array<{ code: string; capMonthly: number | null }> | undefined;
  if (!Array.isArray(components)) throw new Error('PAYE allowable deduction configuration is missing.');
  const nssfCap = components.find(c => c.code === 'REGISTERED_PENSION_AND_NSSF')?.capMonthly;
  const pensionDeduction = nssfCap === null || nssfCap === undefined ? nssf : minBig(nssf, toCents(Number(nssfCap)));
  const taxableIncome = maxBig(0n, gross - shif - housingLevy - pensionDeduction);
  const annualTaxable = taxableIncome * 12n;

  // Annual thresholds are applied to annualized monthly taxable pay; monthly relief is
  // deducted after tax is calculated, with the final monthly amount rounded once.
  let lower = 0n;
  let annualTaxScaled = 0n;
  for (const band of bands) {
    const upper = band.upTo === null ? null : toCents(band.upTo);
    const ceiling = upper === null ? annualTaxable : minBig(annualTaxable, upper);
    const taxableInBand = maxBig(0n, ceiling - lower);
    annualTaxScaled += taxableInBand * toScaledRate(band.rate, 'PAYE band rate');
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
  warnings.push('PAYE_CALCULATION_ASSUMES_FULL_MONTHLY_RESIDENT_EMPLOYMENT_AND_STANDARD_RELIEF');
  return {
    gross: fromCents(gross), taxableIncome: fromCents(taxableIncome), paye: fromCents(paye),
    shif: fromCents(shif), nssf: fromCents(nssf), nssfTierOne: fromCents(nssfTierOne),
    nssfTierTwo: fromCents(nssfTierTwo), housingLevy: fromCents(housingLevy),
    employeeStatutoryDeductions: fromCents(employeeStatutoryDeductions),
    employerNssf: fromCents(employerNssf), employerNssfTierOne: fromCents(employerNssfTierOne),
    employerNssfTierTwo: fromCents(employerNssfTierTwo), employerHousingLevy: fromCents(employerHousingLevy),
    nita: fromCents(nita), employerContributions: fromCents(employerContributions),
    netBeforeOtherDeductions: fromCents(netBeforeOtherDeductions), warnings,
    lines: [
      { code: 'PAYE', amount: fromCents(paye), side: 'employee' },
      { code: 'SHIF', amount: fromCents(shif), side: 'employee' },
      { code: 'NSSF_TIER_I', amount: fromCents(nssfTierOne), side: 'employee' },
      { code: 'NSSF_TIER_II', amount: fromCents(nssfTierTwo), side: 'employee' },
      { code: 'AHL', amount: fromCents(housingLevy), side: 'employee' },
      { code: 'NSSF_EMPLOYER_TIER_I', amount: fromCents(employerNssfTierOne), side: 'employer' },
      { code: 'NSSF_EMPLOYER_TIER_II', amount: fromCents(employerNssfTierTwo), side: 'employer' },
      { code: 'AHL_EMPLOYER', amount: fromCents(employerHousingLevy), side: 'employer' },
      { code: 'NITA', amount: fromCents(nita), side: 'employer' },
    ],
  };
}
