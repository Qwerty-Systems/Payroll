/**
 * Pure overtime pay calculation. No database, network or clock access.
 *
 * Overtime multipliers are tenant policy and are never assumed: if the tenant has not
 * configured one, approved overtime is NOT paid and a blocking warning is emitted so the
 * run cannot be finalized with silently missing pay. Likewise a base hourly rate is only
 * derived for pay bases where the conversion is unambiguous from tenant settings.
 */
import type { PayBasis } from './contract-earnings';

export interface OvertimePolicy {
  /** Pay multiplier applied to the base hourly rate, e.g. 1.5. Must be configured by the tenant. */
  multiplier?: number | null;
  /**
   * Hourly-paid workers only: true when approved attendance minutes already include the
   * overtime hours at the plain rate, so only the premium (multiplier - 1) is added.
   */
  attendanceIncludesOvertime?: boolean;
}

export interface OvertimeInput {
  payBasis: PayBasis;
  rate: number;
  /** Sum of approved overtime-request minutes inside the worker's contract window. */
  approvedMinutes: number;
  policy: OvertimePolicy;
  standardHoursPerDay: number;
  standardDaysPerMonth: number;
}

export interface OvertimeResult {
  amount: number;
  hours: number;
  baseHourlyRate: number | null;
  multiplier: number | null;
  premiumOnly: boolean;
  warnings: string[];
}

export const MIN_OVERTIME_MULTIPLIER = 1;
export const MAX_OVERTIME_MULTIPLIER = 4;

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function isValidMultiplier(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && value >= MIN_OVERTIME_MULTIPLIER && value <= MAX_OVERTIME_MULTIPLIER;
}

/** Base hourly rate, or null when the pay basis has no unambiguous hourly equivalent. */
export function baseHourlyRate(
  payBasis: PayBasis, rate: number, standardHoursPerDay: number, standardDaysPerMonth: number,
): number | null {
  switch (payBasis) {
    case 'hourly': return rate;
    case 'daily': return rate / standardHoursPerDay;
    case 'monthly': return rate / (standardDaysPerMonth * standardHoursPerDay);
    default: return null; // weekly / per_unit: no tenant setting defines the divisor
  }
}

export function calculateOvertimePay(input: OvertimeInput): OvertimeResult {
  if (!Number.isFinite(input.rate) || input.rate < 0) throw new Error('Contract rate must be a finite non-negative amount.');
  if (!Number.isFinite(input.approvedMinutes) || input.approvedMinutes < 0) throw new Error('Approved overtime minutes must be finite and non-negative.');
  if (!(input.standardHoursPerDay > 0) || !(input.standardDaysPerMonth > 0)) throw new Error('Standard hours per day and days per month must be positive.');

  const none: OvertimeResult = { amount: 0, hours: 0, baseHourlyRate: null, multiplier: null, premiumOnly: false, warnings: [] };
  if (input.approvedMinutes === 0) return none;

  const hours = input.approvedMinutes / 60;
  const warnings: string[] = [];
  const multiplier = input.policy.multiplier;
  if (!isValidMultiplier(multiplier)) warnings.push('OVERTIME_POLICY_MULTIPLIER_NOT_CONFIGURED');

  const hourly = baseHourlyRate(input.payBasis, input.rate, input.standardHoursPerDay, input.standardDaysPerMonth);
  if (hourly === null) warnings.push('OVERTIME_BASE_RATE_UNSUPPORTED_FOR_PAY_BASIS');

  if (warnings.length > 0 || hourly === null || !isValidMultiplier(multiplier)) {
    return { ...none, hours, warnings };
  }

  const premiumOnly = input.payBasis === 'hourly' && input.policy.attendanceIncludesOvertime === true;
  const effective = premiumOnly ? multiplier - 1 : multiplier;
  // Single rounding of the whole expression, never of intermediate figures.
  const amount = money(input.rate * input.approvedMinutes * effective
    / (input.payBasis === 'hourly' ? 60
      : input.payBasis === 'daily' ? 60 * input.standardHoursPerDay
        : 60 * input.standardHoursPerDay * input.standardDaysPerMonth));
  return { amount, hours, baseHourlyRate: Math.round(hourly * 10000) / 10000, multiplier, premiumOnly, warnings };
}

/**
 * Approved timesheet overtime is informational only: pay comes solely from approved overtime
 * requests (which carry the approved-minute cap). A date where the timesheet claims more
 * overtime than was approved is surfaced for review rather than paid.
 */
export function timesheetOvertimeReviewWarnings(unreconciledDates: number): string[] {
  return unreconciledDates > 0 ? ['TIMESHEET_OVERTIME_EXCEEDS_APPROVED_REQUESTS'] : [];
}
