import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OperationsService } from './operations.service';

describe('OperationsService worker contracts', () => {
  const tenantId = '123e4567-e89b-42d3-a456-426614174000';
  const actorId = '123e4567-e89b-42d3-a456-426614174001';
  const workerId = '123e4567-e89b-42d3-a456-426614174002';
  const contractId = '123e4567-e89b-42d3-a456-426614174003';

  function makeService(query: jest.Mock) {
    const transactionManager = { query };
    const tenantDb = {
      run: jest.fn(async (_tenantId: string, work: (manager: { query: jest.Mock }) => Promise<unknown>) => work(transactionManager)),
    };
    return { service: new OperationsService(tenantDb as never), tenantDb };
  }

  const dto = {
    engagementType: 'permanent',
    payBasis: 'monthly',
    rateAmount: 85000.25,
    currency: 'KES',
    effectiveFrom: '2026-11-01',
    terms: { leaveDaysPerYear: 21 },
  };

  it('creates a contract after locking the worker and checking date overlap', async () => {
    const created = { id: contractId, workerId, ...dto, effectiveTo: null };
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: workerId, status: 'active' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([created])
      .mockResolvedValueOnce([]);
    const { service } = makeService(query);

    await expect(service.createWorkerContract(tenantId, actorId, workerId, dto))
      .resolves.toMatchObject({ id: contractId, rateAmount: 85000.25 });
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(query.mock.calls[1][0]).toContain('COALESCE(effective_to');
    expect(query.mock.calls[3][0]).toContain('worker.contract.created');
  });

  it('rejects overlapping contracts before inserting a new contract', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: workerId, status: 'active' }])
      .mockResolvedValueOnce([{ id: 'existing-contract' }]);
    const { service } = makeService(query);

    await expect(service.createWorkerContract(tenantId, actorId, workerId, dto))
      .rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects an end date before the contract start date', () => {
    const query = jest.fn();
    const { service } = makeService(query);

    expect(() => service.createWorkerContract(tenantId, actorId, workerId, {
      ...dto,
      effectiveTo: '2026-10-31',
    })).toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns not found when the worker does not belong to this tenant', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const { service } = makeService(query);

    await expect(service.listWorkerContracts(tenantId, workerId))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});


describe('OperationsService CRUD', () => {
  const tenantId = '123e4567-e89b-42d3-a456-426614174000';
  const actorId = '123e4567-e89b-42d3-a456-426614174001';
  const workerId = '123e4567-e89b-42d3-a456-426614174002';

  function serviceFor(query: jest.Mock) {
    const tenantDb = { run: jest.fn(async (_tenantId: string, work: (manager: { query: jest.Mock }) => Promise<unknown>) => work({ query })) };
    return new OperationsService(tenantDb as never);
  }

  it('updates a worker profile within the tenant and records an audit event', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ workerNumber:'W-1',firstName:'A',middleName:null,lastName:'B',phone:null,email:null,status:'active' }])
      .mockResolvedValueOnce([{ id:workerId,workerNumber:'W-1',firstName:'Ada',lastName:'B' }])
      .mockResolvedValueOnce([]);
    const service = serviceFor(query);
    await expect(service.updateWorker(tenantId,actorId,workerId,{ firstName:'Ada' })).resolves.toMatchObject({ firstName:'Ada' });
    expect(query.mock.calls[0][0]).toContain('tenant_id=$1 AND id=$2 FOR UPDATE');
    expect(query.mock.calls[1][0]).toContain('WHERE tenant_id=$1 AND id=$2');
    expect(query.mock.calls[2][0]).toContain('worker.updated');
  });

  it('does not archive a worker with an active contract', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id:workerId,status:'active' }])
      .mockResolvedValueOnce([{ id:'active-contract' }]);
    const service = serviceFor(query);
    await expect(service.archiveWorker(tenantId,actorId,workerId)).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('returns not found when a project is outside the tenant', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const service = serviceFor(query);
    await expect(service.getProject(tenantId,workerId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
