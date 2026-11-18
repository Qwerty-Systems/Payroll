import { MigrationInterface, QueryRunner } from 'typeorm';
export class BillingRecurringConversion1795200000000 implements MigrationInterface {
  name='BillingRecurringConversion1795200000000';
  async up(q:QueryRunner):Promise<void>{
    await q.query('ALTER TABLE tenant_billing_documents ADD COLUMN IF NOT EXISTS converted_to_document_id uuid');
    await q.query('ALTER TABLE tenant_billing_documents ADD COLUMN IF NOT EXISTS recurring_source_document_id uuid');
    await q.query('ALTER TABLE tenant_billing_documents ADD COLUMN IF NOT EXISTS recurring_generated_for date');
    await q.query('CREATE UNIQUE INDEX IF NOT EXISTS tenant_billing_documents_tenant_id_unique_idx ON tenant_billing_documents(tenant_id,id)');
    await q.query('ALTER TABLE tenant_billing_documents ADD CONSTRAINT billing_quote_conversion_fk FOREIGN KEY(tenant_id,converted_to_document_id) REFERENCES tenant_billing_documents(tenant_id,id) ON DELETE RESTRICT');
    await q.query('ALTER TABLE tenant_billing_documents ADD CONSTRAINT billing_recurring_source_fk FOREIGN KEY(tenant_id,recurring_source_document_id) REFERENCES tenant_billing_documents(tenant_id,id) ON DELETE RESTRICT');
    await q.query('CREATE UNIQUE INDEX IF NOT EXISTS billing_recurring_generation_unique_idx ON tenant_billing_documents(tenant_id,recurring_source_document_id,recurring_generated_for) WHERE recurring_source_document_id IS NOT NULL');
    await q.query('CREATE INDEX IF NOT EXISTS billing_documents_due_idx ON tenant_billing_documents(tenant_id,status,due_date)');
  }
  async down(q:QueryRunner):Promise<void>{
    await q.query('DROP INDEX IF EXISTS billing_recurring_generation_unique_idx');
    await q.query('DROP INDEX IF EXISTS billing_documents_due_idx');
    await q.query('ALTER TABLE tenant_billing_documents DROP CONSTRAINT IF EXISTS billing_recurring_source_fk');
    await q.query('ALTER TABLE tenant_billing_documents DROP CONSTRAINT IF EXISTS billing_quote_conversion_fk');
    await q.query('ALTER TABLE tenant_billing_documents DROP COLUMN IF EXISTS recurring_generated_for');
    await q.query('ALTER TABLE tenant_billing_documents DROP COLUMN IF EXISTS recurring_source_document_id');
    await q.query('ALTER TABLE tenant_billing_documents DROP COLUMN IF EXISTS converted_to_document_id');
  }
}
