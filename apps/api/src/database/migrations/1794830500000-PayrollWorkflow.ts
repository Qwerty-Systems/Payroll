import { MigrationInterface, QueryRunner } from 'typeorm';

export class PayrollWorkflow1794830500000 implements MigrationInterface {
  name = 'PayrollWorkflow1794830500000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE statutory_rule_sets
        ADD COLUMN IF NOT EXISTS compliance_approved_at timestamptz,
        ADD COLUMN IF NOT EXISTS compliance_approved_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS compliance_review_notes text;

      CREATE TABLE payroll_periods (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        code varchar(40) NOT NULL,
        name varchar(120) NOT NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        payment_date date,
        status varchar(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','closed')),
        created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (end_date >= start_date),
        UNIQUE (tenant_id,id),
        UNIQUE (tenant_id,code)
      );

      CREATE TABLE payroll_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        period_id uuid NOT NULL,
        run_number integer NOT NULL DEFAULT 1 CHECK (run_number > 0),
        status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','calculated','submitted','approved','finalized','rejected')),
        engine_version varchar(40) NOT NULL,
        ruleset_id uuid REFERENCES statutory_rule_sets(id) ON DELETE RESTRICT,
        input_hash char(64),
        totals jsonb NOT NULL DEFAULT '{}'::jsonb,
        warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        submitted_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        approved_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        finalized_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        calculated_at timestamptz,
        submitted_at timestamptz,
        approved_at timestamptz,
        finalized_at timestamptz,
        UNIQUE (tenant_id,id),
        UNIQUE (tenant_id,period_id,run_number),
        FOREIGN KEY (tenant_id,period_id) REFERENCES payroll_periods(tenant_id,id) ON DELETE RESTRICT
      );

      CREATE TABLE payroll_run_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        payroll_run_id uuid NOT NULL,
        worker_id uuid NOT NULL,
        earnings numeric(19,2) NOT NULL CHECK (earnings >= 0),
        employee_deductions numeric(19,2) NOT NULL CHECK (employee_deductions >= 0),
        employer_contributions numeric(19,2) NOT NULL CHECK (employer_contributions >= 0),
        net_pay numeric(19,2) NOT NULL,
        calculation_snapshot jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id,id),
        UNIQUE (tenant_id,payroll_run_id,worker_id),
        FOREIGN KEY (tenant_id,payroll_run_id) REFERENCES payroll_runs(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT
      );

      CREATE TABLE payslips (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        payroll_run_id uuid NOT NULL,
        payroll_run_item_id uuid NOT NULL,
        worker_id uuid NOT NULL,
        payslip_number varchar(80) NOT NULL,
        snapshot jsonb NOT NULL,
        issued_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id,id),
        UNIQUE (tenant_id,payslip_number),
        UNIQUE (tenant_id,payroll_run_item_id),
        FOREIGN KEY (tenant_id,payroll_run_id) REFERENCES payroll_runs(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id,payroll_run_item_id) REFERENCES payroll_run_items(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT
      );

      CREATE TABLE payroll_payment_batches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        payroll_run_id uuid NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','processing','partially_paid','paid','failed','cancelled')),
        payment_method varchar(30) NOT NULL CHECK (payment_method IN ('bank_transfer','mpesa','manual')),
        currency char(3) NOT NULL DEFAULT 'KES',
        total_amount numeric(19,2) NOT NULL CHECK (total_amount >= 0),
        created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        approved_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        approved_at timestamptz,
        UNIQUE (tenant_id,id),
        FOREIGN KEY (tenant_id,payroll_run_id) REFERENCES payroll_runs(tenant_id,id) ON DELETE RESTRICT
      );

      CREATE TABLE payroll_payment_batch_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        batch_id uuid NOT NULL,
        worker_id uuid NOT NULL,
        amount numeric(19,2) NOT NULL CHECK (amount >= 0),
        destination_reference_encrypted text,
        provider_reference varchar(160),
        status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed','reversed')),
        paid_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id,batch_id) REFERENCES payroll_payment_batches(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT
      );

      CREATE INDEX payroll_periods_tenant_dates_idx ON payroll_periods(tenant_id,start_date,end_date);
      CREATE INDEX payroll_runs_tenant_status_idx ON payroll_runs(tenant_id,status,created_at DESC);
      CREATE INDEX payroll_items_worker_idx ON payroll_run_items(tenant_id,worker_id);
      CREATE INDEX payslips_worker_idx ON payslips(tenant_id,worker_id,issued_at DESC);

      DO $$ DECLARE t text; BEGIN
        FOREACH t IN ARRAY ARRAY['payroll_periods','payroll_runs','payroll_run_items','payslips','payroll_payment_batches','payroll_payment_batch_items'] LOOP
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
          EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
          EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',t);
        END LOOP;
      END $$;
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS payroll_payment_batch_items,payroll_payment_batches,payslips,payroll_run_items,payroll_runs,payroll_periods CASCADE; ALTER TABLE statutory_rule_sets DROP COLUMN IF EXISTS compliance_review_notes, DROP COLUMN IF EXISTS compliance_approved_by, DROP COLUMN IF EXISTS compliance_approved_at;`);
  }
}
