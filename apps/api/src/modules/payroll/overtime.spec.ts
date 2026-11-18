import { baseHourlyRate, calculateOvertimePay, isValidMultiplier, timesheetOvertimeReviewWarnings } from './overtime';

describe('calculateOvertimePay', () => {
  const base = { standardHoursPerDay: 8, standardDaysPerMonth: 26, policy: { multiplier: 1.5 } };

  it('pays nothing and warns nothing when no overtime was approved', () => {
    expect(calculateOvertimePay({ ...base, payBasis: 'monthly', rate: 52000, approvedMinutes: 0, policy: {} }))
      .toMatchObject({ amount: 0, hours: 0, warnings: [] });
  });

  it('derives the monthly hourly rate from tenant standard days and hours', () => {
    // 52,000 / (26 * 8) = 250/hr; 4h * 250 * 1.5 = 1,500
    const r = calculateOvertimePay({ ...base, payBasis: 'monthly', rate: 52000, approvedMinutes: 240 });
    expect(r).toMatchObject({ amount: 1500, hours: 4, baseHourlyRate: 250, multiplier: 1.5, premiumOnly: false, warnings: [] });
  });

  it('derives the daily hourly rate from standard hours per day', () => {
    // 2,000 / 8 = 250/hr; 2h * 250 * 1.5 = 750
    expect(calculateOvertimePay({ ...base, payBasis: 'daily', rate: 2000, approvedMinutes: 120 }).amount).toBe(750);
  });

  it('applies the multiplier directly to an hourly rate', () => {
    expect(calculateOvertimePay({ ...base, payBasis: 'hourly', rate: 300, approvedMinutes: 90 }).amount).toBe(675);
  });

  it('pays only the premium for hourly workers whose attendance already includes overtime', () => {
    const r = calculateOvertimePay({ ...base, payBasis: 'hourly', rate: 300, approvedMinutes: 120, policy: { multiplier: 1.5, attendanceIncludesOvertime: true } });
    expect(r).toMatchObject({ amount: 300, premiumOnly: true }); // 2h * 300 * 0.5
  });

  it('ignores attendanceIncludesOvertime for non-hourly bases (attendance does not drive their pay)', () => {
    const r = calculateOvertimePay({ ...base, payBasis: 'daily', rate: 2000, approvedMinutes: 120, policy: { multiplier: 1.5, attendanceIncludesOvertime: true } });
    expect(r).toMatchObject({ amount: 750, premiumOnly: false });
  });

  it('refuses to guess a multiplier: approved overtime is unpaid and blocks via warning', () => {
    const r = calculateOvertimePay({ ...base, payBasis: 'hourly', rate: 300, approvedMinutes: 60, policy: {} });
    expect(r.amount).toBe(0);
    expect(r.hours).toBe(1);
    expect(r.warnings).toContain('OVERTIME_POLICY_MULTIPLIER_NOT_CONFIGURED');
  });

  it.each([0.5, 4.01, NaN, Infinity, null])('rejects out-of-range multiplier %s', m => {
    const r = calculateOvertimePay({ ...base, payBasis: 'hourly', rate: 300, approvedMinutes: 60, policy: { multiplier: m as number | null } });
    expect(r.amount).toBe(0);
    expect(r.warnings).toContain('OVERTIME_POLICY_MULTIPLIER_NOT_CONFIGURED');
  });

  it.each(['weekly', 'per_unit'] as const)('does not derive an hourly rate for %s pay', basis => {
    const r = calculateOvertimePay({ ...base, payBasis: basis, rate: 1000, approvedMinutes: 60 });
    expect(r.amount).toBe(0);
    expect(r.warnings).toContain('OVERTIME_BASE_RATE_UNSUPPORTED_FOR_PAY_BASIS');
  });

  it('reports both problems when policy and pay basis are both unusable', () => {
    const r = calculateOvertimePay({ ...base, payBasis: 'weekly', rate: 1000, approvedMinutes: 60, policy: {} });
    expect(r.warnings).toEqual(['OVERTIME_POLICY_MULTIPLIER_NOT_CONFIGURED', 'OVERTIME_BASE_RATE_UNSUPPORTED_FOR_PAY_BASIS']);
  });

  it('rounds once over the whole expression (half-up), not per intermediate figure', () => {
    // Exact: 31,000 * 31 * 1.5 / (60 * 8 * 26) = 115.5048... -> 115.50.
    // Rounding the hourly rate to 149.04 first would wrongly give 115.51.
    expect(calculateOvertimePay({ ...base, payBasis: 'monthly', rate: 31000, approvedMinutes: 31 }).amount).toBe(115.5);
    // Exact 92.1519... -> 92.15 (rate-first rounding would give 92.14).
    expect(calculateOvertimePay({ ...base, payBasis: 'monthly', rate: 33333, approvedMinutes: 23 }).amount).toBe(92.15);
  });

  it('rejects invalid inputs instead of producing NaN pay', () => {
    expect(() => calculateOvertimePay({ ...base, payBasis: 'hourly', rate: -1, approvedMinutes: 60 })).toThrow('rate');
    expect(() => calculateOvertimePay({ ...base, payBasis: 'hourly', rate: 1, approvedMinutes: -5 })).toThrow('minutes');
    expect(() => calculateOvertimePay({ ...base, payBasis: 'hourly', rate: 1, approvedMinutes: 5, standardHoursPerDay: 0 })).toThrow('positive');
  });
});

describe('overtime helpers', () => {
  it('validates multiplier bounds inclusively', () => {
    expect([1, 1.5, 2, 4].every(isValidMultiplier)).toBe(true);
    expect([0.99, 4.01, '1.5', undefined].some(isValidMultiplier)).toBe(false);
  });
  it('returns null base rate for unsupported bases', () => {
    expect(baseHourlyRate('weekly', 1, 8, 26)).toBeNull();
    expect(baseHourlyRate('per_unit', 1, 8, 26)).toBeNull();
  });
  it('flags unreconciled timesheet overtime for review only when present', () => {
    expect(timesheetOvertimeReviewWarnings(0)).toEqual([]);
    expect(timesheetOvertimeReviewWarnings(2)).toEqual(['TIMESHEET_OVERTIME_EXCEEDS_APPROVED_REQUESTS']);
  });
});
