import { MigrationInterface, QueryRunner } from 'typeorm';
export class PayrollComponents1794831700000 implements MigrationInterface {
  name='PayrollComponents1794831700000';
  async up(q:QueryRunner):Promise<void>{
    await q.query(`
      ALTER TABLE tenant_statutory_assignments
        ADD COLUMN review_status varchar(20) NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected')),
        ADD COLUMN reviewed_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        ADD COLUMN reviewed_at timestamptz,
        ADD COLUMN review_notes varchar(1000);
      CREATE INDEX tenant_statutory_review_idx ON tenant_statutory_assignments(tenant_id,review_status,effective_from);
      CREATE TABLE platform_compliance_reviewers(
        user_id uuid PRIMARY KEY REFERENCES platform_users(id) ON DELETE RESTRICT,
        active boolean NOT NULL DEFAULT true,
        provisioned_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE statutory_filing_records(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,payroll_run_id uuid NOT NULL,
        filing_type varchar(16) NOT NULL CHECK(filing_type IN ('PAYE','SHIF','NSSF','AHL','NITA')),
        period_start date NOT NULL,period_end date NOT NULL,
        amount_due numeric(19,2) NOT NULL CHECK(amount_due>=0),payload_snapshot jsonb NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','reviewed','submitted','accepted','rejected')),
        created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,reviewed_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        review_notes varchar(1000),external_reference varchar(160),submitted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY(tenant_id,payroll_run_id) REFERENCES payroll_runs(tenant_id,id) ON DELETE RESTRICT,
        UNIQUE(tenant_id,id),UNIQUE(tenant_id,payroll_run_id,filing_type)
      );
      CREATE INDEX statutory_filings_tenant_status_idx ON statutory_filing_records(tenant_id,status,period_end DESC);
      ALTER TABLE statutory_filing_records ENABLE ROW LEVEL SECURITY;
      ALTER TABLE statutory_filing_records FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON statutory_filing_records USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
      CREATE TABLE worker_pay_components(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,worker_id uuid NOT NULL,
        code varchar(40) NOT NULL,name varchar(120) NOT NULL,
        component_type varchar(20) NOT NULL CHECK(component_type IN ('allowance','deduction','benefit')),
        calculation_method varchar(24) NOT NULL CHECK(calculation_method IN ('fixed','percentage_of_base')),
        amount numeric(19,4) NOT NULL CHECK(amount>=0),
        taxable boolean NOT NULL DEFAULT false,
        effective_from date NOT NULL,effective_to date,
        status varchar(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
        created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK(effective_to IS NULL OR effective_to>=effective_from),
        CHECK(component_type='allowance' OR taxable=false),
        FOREIGN KEY(tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT,
        UNIQUE(tenant_id,id),UNIQUE(tenant_id,worker_id,code,effective_from)
      );
      CREATE INDEX worker_pay_components_effective_idx ON worker_pay_components(tenant_id,worker_id,status,effective_from,effective_to);
      ALTER TABLE worker_pay_components ENABLE ROW LEVEL SECURITY;
      ALTER TABLE worker_pay_components FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON worker_pay_components
        USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
        WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
    `);
  }
  async down(q:QueryRunner):Promise<void>{await q.query('DROP TABLE IF EXISTS worker_pay_components CASCADE; DROP TABLE IF EXISTS statutory_filing_records CASCADE; DROP TABLE IF EXISTS platform_compliance_reviewers CASCADE; DROP INDEX IF EXISTS tenant_statutory_review_idx; ALTER TABLE tenant_statutory_assignments DROP COLUMN IF EXISTS review_notes, DROP COLUMN IF EXISTS reviewed_at, DROP COLUMN IF EXISTS reviewed_by, DROP COLUMN IF EXISTS review_status;');}
}
