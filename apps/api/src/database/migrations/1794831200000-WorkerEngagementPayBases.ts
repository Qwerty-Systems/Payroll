import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkerEngagementPayBases1794831200000 implements MigrationInterface {
  name = 'WorkerEngagementPayBases1794831200000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE worker_contracts
        DROP CONSTRAINT IF EXISTS worker_contracts_engagement_type_check,
        DROP CONSTRAINT IF EXISTS worker_contracts_pay_basis_check;
      ALTER TABLE worker_contracts
        ADD CONSTRAINT worker_contracts_engagement_type_check
          CHECK (engagement_type IN ('permanent','fixed_term','casual','piece_rate','subcontractor','independent_contractor')),
        ADD CONSTRAINT worker_contracts_pay_basis_check
          CHECK (pay_basis IN ('hourly','daily','weekly','monthly','per_unit'));

      CREATE TABLE worker_output_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        worker_id uuid NOT NULL,
        work_date date NOT NULL,
        unit_code varchar(40) NOT NULL,
        quantity numeric(19,4) NOT NULL CHECK (quantity > 0),
        description varchar(240),
        project_id uuid,
        site_id uuid,
        status varchar(20) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft','submitted','approved','rejected')),
        created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        submitted_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        approved_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        approved_at timestamptz,
        rejection_reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id,site_id) REFERENCES sites(tenant_id,id) ON DELETE RESTRICT,
        UNIQUE (tenant_id,id)
      );
      CREATE INDEX worker_output_entries_period_idx
        ON worker_output_entries(tenant_id,worker_id,work_date,status);
      ALTER TABLE worker_output_entries ENABLE ROW LEVEL SECURITY;
      ALTER TABLE worker_output_entries FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON worker_output_entries
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE IF EXISTS worker_output_entries;
      ALTER TABLE worker_contracts
        DROP CONSTRAINT IF EXISTS worker_contracts_engagement_type_check,
        DROP CONSTRAINT IF EXISTS worker_contracts_pay_basis_check;
      ALTER TABLE worker_contracts
        ADD CONSTRAINT worker_contracts_engagement_type_check
          CHECK (engagement_type IN ('permanent','fixed_term','casual','piece_rate','subcontractor')),
        ADD CONSTRAINT worker_contracts_pay_basis_check
          CHECK (pay_basis IN ('hourly','daily','weekly','monthly','per_unit'));
    `);
  }
}
