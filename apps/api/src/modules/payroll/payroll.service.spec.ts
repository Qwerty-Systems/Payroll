import { ConflictException } from '@nestjs/common';
import { PayrollService } from './payroll.service';

describe('PayrollService payment batch safeguards', () => {
  const tenantId = '123e4567-e89b-42d3-a456-426614174000';
  const actorId = '123e4567-e89b-42d3-a456-426614174001';
  const runId = '123e4567-e89b-42d3-a456-426614174002';

  function serviceWithQuery(query: jest.Mock) {
    const manager = { query };
    const tenantDb = {
      run: jest.fn(async (_tenantId: string, work: (manager: typeof manager) => Promise<unknown>) => work(manager)),
    };
    return { service: new PayrollService(tenantDb as never), tenantDb };
  }

  it('rejects a second active batch for a finalized payroll run', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: runId, status: 'finalized' }])
      .mockResolvedValueOnce([{ id: 'existing-batch', status: 'approved' }]);
    const { service } = serviceWithQuery(query);

    await expect(service.createPaymentBatch(tenantId, actorId, runId, 'mpesa'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain("status NOT IN ('cancelled','failed')");
  });

  it('allows a replacement batch after the previous batch was cancelled or failed', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: runId, status: 'finalized' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ currency: 'KES' }])
      .mockResolvedValueOnce([{ worker_id: 'worker-1', net_pay: '1000.00' }])
      .mockResolvedValueOnce([{ id: 'new-batch', status: 'draft', paymentMethod: 'mpesa', currency: 'KES', totalAmount: '1000.00' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const { service } = serviceWithQuery(query);

    await expect(service.createPaymentBatch(tenantId, actorId, runId, 'mpesa'))
      .resolves.toMatchObject({ id: 'new-batch', status: 'draft' });
    expect(query).toHaveBeenCalledTimes(7);
  });
});
