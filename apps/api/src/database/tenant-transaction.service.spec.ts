import { TenantTransactionService } from './tenant-transaction.service';

describe('TenantTransactionService', () => {
  const createRunner = () => {
    let transactionActive = false;

    return {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockImplementation(async () => {
        transactionActive = true;
      }),
      query: jest.fn().mockResolvedValue(undefined),
      manager: {},
      commitTransaction: jest.fn().mockImplementation(async () => {
        transactionActive = false;
      }),
      rollbackTransaction: jest.fn().mockImplementation(async () => {
        transactionActive = false;
      }),
      release: jest.fn().mockResolvedValue(undefined),
      get isTransactionActive() {
        return transactionActive;
      },
    };
  };

  it('sets tenant context transaction-locally before executing work', async () => {
    const runner = createRunner();
    const service = new TenantTransactionService({
      createQueryRunner: () => runner,
    } as never);
    const work = jest.fn().mockResolvedValue('ok');

    await expect(service.run('123e4567-e89b-42d3-a456-426614174000', work)).resolves.toBe('ok');
    expect(runner.query).toHaveBeenCalledWith(
      "SELECT set_config('app.tenant_id', $1, true)",
      ['123e4567-e89b-42d3-a456-426614174000'],
    );
    expect(work).toHaveBeenCalledWith(runner.manager);
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases the connection when work fails', async () => {
    const runner = createRunner();
    const service = new TenantTransactionService({
      createQueryRunner: () => runner,
    } as never);

    await expect(service.run('123e4567-e89b-42d3-a456-426614174000', async () => {
      throw new Error('failure');
    })).rejects.toThrow('failure');
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed tenant identifiers before opening a transaction', async () => {
    const createQueryRunner = jest.fn();
    const service = new TenantTransactionService({ createQueryRunner } as never);
    await expect(service.run('not-a-uuid', async () => true)).rejects.toThrow(
      'A valid tenant identifier is required.',
    );
    expect(createQueryRunner).not.toHaveBeenCalled();
  });
});
