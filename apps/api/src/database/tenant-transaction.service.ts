import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Executes tenant-owned database work inside one transaction and sets the
 * PostgreSQL RLS tenant context with transaction-local scope. Callers must
 * authenticate the actor and verify tenant membership before using this API.
 */
@Injectable()
export class TenantTransactionService {
  constructor(private readonly dataSource: DataSource) {}

  async run<T>(tenantId: string, work: (manager: EntityManager) => Promise<T>): Promise<T> {
    if (!UUID_PATTERN.test(tenantId)) {
      throw new BadRequestException('A valid tenant identifier is required.');
    }

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      await runner.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await work(runner.manager);
      await runner.commitTransaction();
      return result;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
}
