import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds immutable post-finalization correction records. Original payroll runs and
 * payslip snapshots are never updated by this workflow.
 */
export class PayrollPostFinalizationControls1794832700000 implements MigrationInterface {
  name = 'PayrollPostFinalizationControls1794832700000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS payroll_corrections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        original_run_id uuid NOT NULL,
        correction_number integer NOT NULL,
        correction_type varchar(20) NOT NULL CHECK (correction_type IN ('adjustment','reversal')),
        status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','applied','rejected')),
        reason text NOT NULL,
        created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        submitted_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        approved_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        applied_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id,id),
        UNIQUE (tenant_id,original_run_id,correction_number),
        FOREIGN KEY (tenant_id,original_run_id) REFERENCES payroll_runs(tenant_id,id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS payroll_correction_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        correction_id uuid NOT NULL,
        worker_id uuid NOT NULL,
        code varchar(80) NOT NULL,
        description varchar(500) NOT NULL,
        earnings_delta numeric(19,2) NOT NULL DEFAULT 0,
        employee_deduction_delta numeric(19,2) NOT NULL DEFAULT 0,
        employer_contribution_delta numeric(19,2) NOT NULL DEFAULT 0,
        net_pay_delta numeric(19,2) NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id,correction_id) REFERENCES payroll_corrections(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS payroll_corrections_run_idx
        ON payroll_corrections(tenant_id,original_run_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS payroll_correction_items_idx
        ON payroll_correction_items(tenant_id,correction_id,worker_id);

      DO $$ DECLARE t text; BEGIN
        FOREACH t IN ARRAY ARRAY['payroll_corrections','payroll_correction_items'] LOOP
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
          EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname=current_schema() AND tablename=t AND policyname='tenant_isolation') THEN
            EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',t);
          END IF;
        END LOOP;
      END $$;

      GRANT SELECT,INSERT,UPDATE,DELETE ON payroll_corrections,payroll_correction_items TO jengaflow_app;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS payroll_correction_items,payroll_corrections CASCADE');
  }
}
