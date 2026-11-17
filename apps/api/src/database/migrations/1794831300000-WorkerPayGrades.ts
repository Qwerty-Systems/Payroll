import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkerPayGrades1794831300000 implements MigrationInterface {
  name = 'WorkerPayGrades1794831300000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE worker_pay_grades (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        code varchar(40) NOT NULL,
        name varchar(120) NOT NULL,
        description text,
        currency char(3) NOT NULL DEFAULT 'KES' CHECK (currency ~ '^[A-Z]{3}$'),
        minimum_rate numeric(19,4) CHECK (minimum_rate IS NULL OR minimum_rate >= 0),
        midpoint_rate numeric(19,4) CHECK (midpoint_rate IS NULL OR midpoint_rate >= 0),
        maximum_rate numeric(19,4) CHECK (maximum_rate IS NULL OR maximum_rate >= 0),
        pay_basis varchar(20) NOT NULL CHECK (pay_basis IN ('hourly','daily','weekly','monthly','per_unit')),
        status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
        created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, code),
        UNIQUE (tenant_id, id),
        CHECK (minimum_rate IS NULL OR midpoint_rate IS NULL OR minimum_rate <= midpoint_rate),
        CHECK (midpoint_rate IS NULL OR maximum_rate IS NULL OR midpoint_rate <= maximum_rate),
        CHECK (minimum_rate IS NULL OR maximum_rate IS NULL OR minimum_rate <= maximum_rate)
      );
      ALTER TABLE worker_contracts ADD COLUMN pay_grade_id uuid;
      ALTER TABLE worker_contracts ADD CONSTRAINT worker_contracts_pay_grade_fk
        FOREIGN KEY (tenant_id,pay_grade_id) REFERENCES worker_pay_grades(tenant_id,id) ON DELETE RESTRICT;
      CREATE INDEX worker_pay_grades_status_idx ON worker_pay_grades(tenant_id,status,code);
      ALTER TABLE worker_pay_grades ENABLE ROW LEVEL SECURITY;
      ALTER TABLE worker_pay_grades FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON worker_pay_grades
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE worker_contracts DROP CONSTRAINT IF EXISTS worker_contracts_pay_grade_fk;
      ALTER TABLE worker_contracts DROP COLUMN IF EXISTS pay_grade_id;
      DROP TABLE IF EXISTS worker_pay_grades;
    `);
  }
}
