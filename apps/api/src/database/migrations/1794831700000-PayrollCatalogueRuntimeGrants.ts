import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Keep the least-privilege runtime role able to use the tenant payroll
 * catalogue. CI provisions jf_app after migrations and grants the full test
 * schema there; production installations that provision it before migrations
 * receive the required table grants here.
 */
export class PayrollCatalogueRuntimeGrants1794831700000 implements MigrationInterface {
  name = 'PayrollCatalogueRuntimeGrants1794831700000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jf_app') THEN
          GRANT USAGE ON SCHEMA public TO jf_app;
          GRANT SELECT, INSERT, UPDATE, DELETE ON worker_pay_grades TO jf_app;
          GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_allowance_types TO jf_app;
          GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_deduction_types TO jf_app;
        END IF;
      END
      $$;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jf_app') THEN
          REVOKE SELECT, INSERT, UPDATE, DELETE ON worker_pay_grades FROM jf_app;
          REVOKE SELECT, INSERT, UPDATE, DELETE ON tenant_allowance_types FROM jf_app;
          REVOKE SELECT, INSERT, UPDATE, DELETE ON tenant_deduction_types FROM jf_app;
        END IF;
      END
      $$;
    `);
  }
}
