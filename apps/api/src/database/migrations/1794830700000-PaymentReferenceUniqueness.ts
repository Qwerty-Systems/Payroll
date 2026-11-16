import { MigrationInterface, QueryRunner } from 'typeorm';
export class PaymentReferenceUniqueness1794830700000 implements MigrationInterface {
  name = 'PaymentReferenceUniqueness1794830700000';
  async up(q: QueryRunner): Promise<void> { await q.query(`CREATE UNIQUE INDEX payroll_payment_provider_reference_uq ON payroll_payment_batch_items(tenant_id,provider_reference) WHERE provider_reference IS NOT NULL;`); }
  async down(q: QueryRunner): Promise<void> { await q.query(`DROP INDEX IF EXISTS payroll_payment_provider_reference_uq;`); }
}
