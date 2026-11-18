import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegrationWorkflowLedger1794900000000 implements MigrationInterface {
  name = 'IntegrationWorkflowLedger1794900000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS integration_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        provider varchar(40) NOT NULL CHECK(provider IN ('daraja','bank_transfer')),
        idempotency_key varchar(160) NOT NULL,
        transaction_type varchar(40) NOT NULL,
        status varchar(30) NOT NULL DEFAULT 'created' CHECK(status IN ('created','queued','submitted','processing','succeeded','failed','cancelled','needs_review')),
        amount numeric(14,2) NOT NULL CHECK(amount > 0),
        currency char(3) NOT NULL DEFAULT 'KES',
        recipient_reference varchar(160) NOT NULL,
        provider_reference varchar(160),
        request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        response_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(tenant_id,provider,idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS integration_transactions_status_idx ON integration_transactions(tenant_id,status,created_at);
      CREATE TABLE IF NOT EXISTS integration_delivery_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        job_type varchar(40) NOT NULL CHECK(job_type IN ('payslip_email','accounting_sync')),
        idempotency_key varchar(160) NOT NULL,
        status varchar(30) NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','sent','succeeded','failed','dead_letter')),
        payload jsonb NOT NULL,
        attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
        max_attempts integer NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 10),
        available_at timestamptz NOT NULL DEFAULT now(),
        last_error varchar(500),
        provider_reference varchar(160),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(tenant_id,job_type,idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS integration_delivery_jobs_ready_idx ON integration_delivery_jobs(status,available_at);
      CREATE TABLE IF NOT EXISTS integration_reconciliation_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        reconciliation_type varchar(40) NOT NULL CHECK(reconciliation_type IN ('payout','accounting')),
        internal_reference varchar(160) NOT NULL,
        external_reference varchar(160),
        status varchar(30) NOT NULL DEFAULT 'unmatched' CHECK(status IN ('matched','unmatched','amount_mismatch','missing_external','missing_internal','resolved')),
        internal_amount numeric(14,2),
        external_amount numeric(14,2),
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        resolved_by uuid,
        resolved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(tenant_id,reconciliation_type,internal_reference,external_reference)
      );
      `);
      for (const table of ['integration_transactions','integration_delivery_jobs','integration_reconciliation_items']) {
        await q.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
        await q.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
        await q.query(`CREATE POLICY tenant_isolation ON ${table} USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)`);
        await q.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jengaflow_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON ${table} TO jengaflow_app; END IF; IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jf_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON ${table} TO jf_app; END IF; END $$`);
      }
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS integration_reconciliation_items, integration_delivery_jobs, integration_transactions CASCADE');
  }
}
