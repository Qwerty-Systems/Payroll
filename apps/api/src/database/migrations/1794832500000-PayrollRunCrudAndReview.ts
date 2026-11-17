import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds editable descriptive metadata and explicit rejection history to payroll
 * runs. Financial calculation snapshots remain immutable after calculation.
 */
export class PayrollRunCrudAndReview1794832500000 implements MigrationInterface {
  name = 'PayrollRunCrudAndReview1794832500000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE payroll_runs
        ADD COLUMN IF NOT EXISTS description varchar(500),
        ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
        ADD COLUMN IF NOT EXISTS rejection_reason text,
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

      CREATE INDEX IF NOT EXISTS payroll_runs_tenant_period_created_idx
        ON payroll_runs(tenant_id,period_id,created_at DESC);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX IF EXISTS payroll_runs_tenant_period_created_idx;
      ALTER TABLE payroll_runs
        DROP COLUMN IF EXISTS updated_at,
        DROP COLUMN IF EXISTS rejection_reason,
        DROP COLUMN IF EXISTS rejected_at,
        DROP COLUMN IF EXISTS rejected_by,
        DROP COLUMN IF EXISTS description;
    `);
  }
}
