import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationStructure1794830800000 implements MigrationInterface {
  name = 'OrganizationStructure1794830800000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE tenant_branches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        code varchar(40) NOT NULL, name varchar(160) NOT NULL, address text,
        status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(tenant_id,id), UNIQUE(tenant_id,code)
      );
      CREATE TABLE tenant_departments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        branch_id uuid, code varchar(40) NOT NULL, name varchar(160) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(tenant_id,id), UNIQUE(tenant_id,code),
        FOREIGN KEY(tenant_id,branch_id) REFERENCES tenant_branches(tenant_id,id) ON DELETE RESTRICT
      );
      CREATE TABLE tenant_cost_centres (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        code varchar(40) NOT NULL, name varchar(160) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(tenant_id,id), UNIQUE(tenant_id,code)
      );
      CREATE TABLE worker_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        worker_id uuid NOT NULL, branch_id uuid, department_id uuid, cost_centre_id uuid, project_id uuid, site_id uuid,
        effective_from date NOT NULL, effective_to date,
        status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
        created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK(effective_to IS NULL OR effective_to >= effective_from),
        UNIQUE(tenant_id,id),
        FOREIGN KEY(tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY(tenant_id,branch_id) REFERENCES tenant_branches(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY(tenant_id,department_id) REFERENCES tenant_departments(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY(tenant_id,cost_centre_id) REFERENCES tenant_cost_centres(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id) ON DELETE RESTRICT
      );
      CREATE INDEX worker_assignments_active_idx ON worker_assignments(tenant_id,worker_id,effective_from,effective_to) WHERE status='active';
      DO $$ DECLARE t text; BEGIN
        FOREACH t IN ARRAY ARRAY['tenant_branches','tenant_departments','tenant_cost_centres','worker_assignments'] LOOP
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
          EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
          EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',t);
        END LOOP;
      END $$;
    `);
  }
  async down(q: QueryRunner): Promise<void> { await q.query(`DROP TABLE IF EXISTS worker_assignments,tenant_cost_centres,tenant_departments,tenant_branches CASCADE;`); }
}
