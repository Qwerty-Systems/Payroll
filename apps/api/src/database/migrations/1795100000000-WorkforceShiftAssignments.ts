import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkforceShiftAssignments1795100000000 implements MigrationInterface {
  name = 'WorkforceShiftAssignments1795100000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE worker_shift_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        worker_id uuid NOT NULL,
        shift_id uuid NOT NULL,
        work_date date NOT NULL,
        notes varchar(500),
        status varchar(16) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','completed')),
        assigned_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(tenant_id,id),
        FOREIGN KEY (tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id,shift_id) REFERENCES work_shifts(tenant_id,id) ON DELETE RESTRICT,
        UNIQUE(tenant_id,worker_id,shift_id,work_date)
      );
      CREATE INDEX worker_shift_assignments_schedule_idx
        ON worker_shift_assignments(tenant_id,work_date,status,shift_id);
      ALTER TABLE worker_shift_assignments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE worker_shift_assignments FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON worker_shift_assignments
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      DO $$ DECLARE role_name text; BEGIN
        FOREACH role_name IN ARRAY ARRAY['jengaflow_app','jf_app'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON worker_shift_assignments TO %I', role_name);
          END IF;
        END LOOP;
      END $$;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS worker_shift_assignments CASCADE;');
  }
}
