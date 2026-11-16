import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialTenantFoundation1760000000000 implements MigrationInterface {
  name = 'InitialTenantFoundation1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`
      CREATE TABLE tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug varchar(63) NOT NULL UNIQUE,
        legal_name varchar(200) NOT NULL,
        display_name varchar(160) NOT NULL,
        status varchar(24) NOT NULL DEFAULT 'trial'
          CHECK (status IN ('trial','active','suspended','closed')),
        timezone varchar(80) NOT NULL DEFAULT 'Africa/Nairobi',
        currency char(3) NOT NULL DEFAULT 'KES',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE platform_users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(254) NOT NULL UNIQUE,
        password_hash varchar(255) NOT NULL,
        full_name varchar(160) NOT NULL,
        status varchar(24) NOT NULL DEFAULT 'invited'
          CHECK (status IN ('invited','active','disabled')),
        email_verified_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE tenant_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE RESTRICT,
        role varchar(40) NOT NULL,
        status varchar(24) NOT NULL DEFAULT 'active'
          CHECK (status IN ('invited','active','suspended')),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, user_id),
        UNIQUE (tenant_id, id)
      );
      CREATE TABLE projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        project_code varchar(40) NOT NULL,
        name varchar(180) NOT NULL,
        client_name varchar(180),
        status varchar(24) NOT NULL DEFAULT 'planning'
          CHECK (status IN ('planning','active','on_hold','completed','cancelled')),
        start_date date,
        end_date date,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, id),
        UNIQUE (tenant_id, project_code),
        CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
      );
      CREATE TABLE sites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        project_id uuid NOT NULL,
        site_code varchar(40) NOT NULL,
        name varchar(180) NOT NULL,
        address text,
        status varchar(24) NOT NULL DEFAULT 'active'
          CHECK (status IN ('active','inactive','closed')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, id),
        UNIQUE (tenant_id, site_code),
        FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id) ON DELETE RESTRICT
      );
      CREATE TABLE workers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        worker_number varchar(40) NOT NULL,
        first_name varchar(100) NOT NULL,
        middle_name varchar(100),
        last_name varchar(100) NOT NULL,
        phone varchar(32),
        email varchar(254),
        national_id_encrypted text,
        status varchar(24) NOT NULL DEFAULT 'active'
          CHECK (status IN ('active','inactive','suspended','archived')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, id),
        UNIQUE (tenant_id, worker_number)
      );
      CREATE TABLE worker_contracts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        worker_id uuid NOT NULL,
        engagement_type varchar(32) NOT NULL
          CHECK (engagement_type IN ('permanent','fixed_term','casual','piece_rate','subcontractor')),
        pay_basis varchar(24) NOT NULL
          CHECK (pay_basis IN ('hourly','daily','weekly','monthly','per_unit')),
        rate_amount numeric(19,4) NOT NULL CHECK (rate_amount >= 0),
        currency char(3) NOT NULL DEFAULT 'KES',
        effective_from date NOT NULL,
        effective_to date,
        terms jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id, worker_id) REFERENCES workers(tenant_id, id) ON DELETE RESTRICT,
        CHECK (effective_to IS NULL OR effective_to >= effective_from)
      );
      CREATE TABLE attendance_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        worker_id uuid NOT NULL,
        project_id uuid NOT NULL,
        site_id uuid NOT NULL,
        work_date date NOT NULL,
        clock_in timestamptz,
        clock_out timestamptz,
        minutes_worked integer CHECK (minutes_worked IS NULL OR minutes_worked >= 0),
        source varchar(24) NOT NULL DEFAULT 'web'
          CHECK (source IN ('web','mobile','offline_sync','import')),
        status varchar(24) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft','submitted','approved','rejected')),
        client_command_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id, worker_id) REFERENCES workers(tenant_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, site_id) REFERENCES sites(tenant_id, id) ON DELETE RESTRICT,
        CHECK (clock_out IS NULL OR clock_in IS NULL OR clock_out >= clock_in),
        UNIQUE (tenant_id, client_command_id)
      );
      CREATE TABLE audit_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
        actor_user_id uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        action varchar(120) NOT NULL,
        entity_type varchar(100) NOT NULL,
        entity_id uuid,
        request_id varchar(100),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_memberships_user ON tenant_memberships(user_id, status);
      CREATE INDEX idx_projects_tenant_status ON projects(tenant_id, status);
      CREATE INDEX idx_workers_tenant_status ON workers(tenant_id, status);
      CREATE INDEX idx_attendance_tenant_date ON attendance_records(tenant_id, work_date);
      CREATE INDEX idx_attendance_worker_date ON attendance_records(tenant_id, worker_id, work_date);
      CREATE INDEX idx_audit_tenant_created ON audit_events(tenant_id, created_at DESC);
    `);
    const tenantTables = ['tenant_memberships','projects','sites','workers','worker_contracts','attendance_records'];
    for (const table of tenantTables) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(`CREATE POLICY tenant_isolation ON ${table}
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)`);
    }
    await queryRunner.query(`ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE audit_events FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`CREATE POLICY audit_tenant_isolation ON audit_events
      USING (tenant_id IS NULL OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id IS NULL OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit_events, attendance_records, worker_contracts, workers, sites, projects, tenant_memberships, platform_users, tenants CASCADE`);
  }
}
