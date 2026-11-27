import { BadRequestException, ConflictException } from '@nestjs/common';
import { PayrollPostFinalizationService } from './payroll-post-finalization.service';

const tenantId = '123e4567-e89b-42d3-a456-426614174000';
const actorId = '123e4567-e89b-42d3-a456-426614174001';
const runId = '123e4567-e89b-42d3-a456-426614174002';

function serviceFor(query: jest.Mock) {
  const manager = { query };
  const tenantDb = {
    run: jest.fn(async (_tenant: string, work: (m: typeof manager) => Promise<unknown>) => work(manager)),
  };
  return new PayrollPostFinalizationService(tenantDb as never);
}

describe('Payroll post-finalization controls', () => {
  it('rejects correction creation for a non-finalized payroll run', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: runId, status: 'calculated' }]);
    const service = serviceFor(query);
    await expect(service.createCorrection(tenantId, actorId, runId, 'adjustment', 'Correct an approved allowance', [
      { workerId: actorId, code: 'ALLOWANCE', description: 'Allowance adjustment', earningsDelta: 100, netPayDelta: 100 },
    ])).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('requires adjustment lines to balance net pay', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: runId, status: 'finalized' }])
      .mockResolvedValueOnce([]);
    const service = serviceFor(query);
    await expect(service.createCorrection(tenantId, actorId, runId, 'adjustment', 'Correct an approved allowance', [
      { workerId: actorId, code: 'ALLOWANCE', description: 'Allowance adjustment', earningsDelta: 100, employeeDeductionDelta: 0, netPayDelta: 80 },
    ])).rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('builds reversal lines from the immutable finalized payroll items', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: runId, status: 'finalized' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ worker_id: actorId, earnings: '1000.00', employee_deductions: '250.00', employer_contributions: '100.00', net_pay: '750.00' }])
      .mockResolvedValueOnce([{ n: 1 }])
      .mockResolvedValueOnce([{ id: '123e4567-e89b-42d3-a456-426614174003', correctionNumber: 1, status: 'draft' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const service = serviceFor(query);
    await service.createCorrection(tenantId, actorId, runId, 'reversal', 'Reverse the finalized payroll in full', []);
    const insert = query.mock.calls.find((call: unknown[]) => String(call[0]).includes('INSERT INTO payroll_correction_items'));
    expect(insert).toBeDefined();
    expect(insert?.[1]).toEqual([tenantId, '123e4567-e89b-42d3-a456-426614174003', actorId, 'FULL_PAYROLL_REVERSAL', 'Reversal of finalized payroll run', -1000, -250, -100, -750]);
  });
  it('normalizes signed correction balances into a non-negative balanced journal', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: runId, status: 'finalized', totals: {}, period_code: '2026-11' }])
      .mockResolvedValueOnce([{ calculation_snapshot: { earnings: { grossPay: 1000 }, statutory: { employeeStatutoryDeductions: 250, employerContributions: 100 }, netPay: 750 } }])
      .mockResolvedValueOnce([{ earnings_delta: '-100', employee_deductions_delta: '-20', employer_contributions_delta: '-10', net_pay_delta: '-80' }]);
    const service = serviceFor(query);
    const result = await service.generalLedgerExport(tenantId, runId);
    expect(result.totals).toEqual({ debit: 990, credit: 990 });
    expect(result.journal.every(line => line.debit >= 0 && line.credit >= 0)).toBe(true);
    expect(result.journal.find(line => line.account === 'Payroll expense')).toEqual({ account: 'Payroll expense', debit: 900, credit: 0 });
    expect(result.journal.find(line => line.account === 'Net salaries payable')).toEqual({ account: 'Net salaries payable', debit: 0, credit: 670 });
  });

});
