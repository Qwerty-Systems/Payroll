import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BillingService } from './billing.service';

@Injectable()
export class BillingRecurringScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingRecurringScheduler.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private readonly intervalMs = 15 * 60 * 1000;

  constructor(private readonly dataSource: DataSource, private readonly billing: BillingService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    void this.runOnce();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce() {
    if (this.running) return;
    this.running = true;
    const runner = this.dataSource.createQueryRunner();
    try {
      await runner.connect();
      const lock = await runner.query("SELECT pg_try_advisory_lock(hashtext('jengaflow.billing.recurring.scheduler')) AS locked");
      if (!lock[0]?.locked) return;
      try {
        const tenants = await runner.query(`SELECT t.id AS "tenantId",m.user_id AS "actorId" FROM tenants t JOIN tenant_memberships m ON m.tenant_id=t.id AND m.status='active' WHERE t.status IN ('active','trial') AND m.role IN ('owner','admin') ORDER BY t.id,m.created_at LIMIT 1000`);
        const processedTenants = new Set<string>();
        for (const tenant of tenants) {
          if (processedTenants.has(tenant.tenantId)) continue;
          processedTenants.add(tenant.tenantId);
          try {
            const result = await this.billing.processRecurring(tenant.tenantId,tenant.actorId);
            if (result.generated) this.logger.log(`Generated ${result.generated} recurring invoices for tenant ${tenant.tenantId}.`);
          } catch (error) {
            this.logger.error(`Recurring billing failed for tenant ${tenant.tenantId}: ${error instanceof Error?error.message:String(error)}`);
          }
        }
      } finally {
        await runner.query("SELECT pg_advisory_unlock(hashtext('jengaflow.billing.recurring.scheduler'))");
      }
    } catch (error) {
      this.logger.error('Recurring billing scheduler cycle failed.',error instanceof Error?error.stack:undefined);
    } finally {
      await runner.release();
      this.running = false;
    }
  }
}
