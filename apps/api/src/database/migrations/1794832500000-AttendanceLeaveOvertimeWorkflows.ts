import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendanceLeaveOvertimeWorkflows1794832500000 implements MigrationInterface {
  name = 'AttendanceLeaveOvertimeWorkflows1794832500000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE work_shifts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        code varchar(40) NOT NULL,
        name varchar(120) NOT NULL,
        start_time time NOT NULL,
        end_time time NOT NULL,
        break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 720),
        crosses_midnight boolean NOT NULL DEFAULT false,
        status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id,id),
        UNIQUE (tenant_id,code)
      );

      CREATE TABLE leave_types (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        code varchar(40) NOT NULL,
        name varchar(120) NOT NULL,
        annual_entitlement_days numeric(8,2) NOT NULL DEFAULT 0 CHECK (annual_entitlement_days >= 0),
        carry_forward_limit_days numeric(8,2) NOT NULL DEFAULT 0 CHECK (carry_forward_limit_days >= 0),
        requires_approval boolean NOT NULL DEFAULT true,
        is_paid boolean NOT NULL DEFAULT true,
        status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id,id),
        UNIQUE (tenant_id,code)
      );

      CREATE TABLE worker_leave_balances (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        worker_id uuid NOT NULL,
        leave_type_id uuid NOT NULL,
        leave_year integer NOT NULL,
        opening_days numeric(8,2) NOT NULL DEFAULT 0 CHECK (opening_days >= 0),
        accrued_days numeric(8,2) NOT NULL DEFAULT 0 CHECK (accrued_days >= 0),
        adjustment_days numeric(8,2) NOT NULL DEFAULT 0,
        used_days numeric(8,2) NOT NULL DEFAULT 0 CHECK (used_days >= 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id,id),
        UNIQUE (tenant_id,worker_id,leave_type_id,leave_year),
        FOREIGN KEY (tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id,leave_type_id) REFERENCES leave_types(tenant_id,id) ON DELETE RESTRICT
      );

      CREATE TABLE leave_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        worker_id uuid NOT NULL,
        leave_type_id uuid NOT NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        requested_days numeric(8,2) NOT NULL CHECK (requested_days > 0),
        reason text,
        status varchar(16) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','approved','rejected','cancelled')),
        requested_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        reviewed_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        review_reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        reviewed_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (end_date >= start_date),
        UNIQUE (tenant_id,id),
        FOREIGN KEY (tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id,leave_type_id) REFERENCES leave_types(tenant_id,id) ON DELETE RESTRICT,
        CHECK ((status IN ('pending','cancelled') AND reviewed_at IS NULL) OR (status IN ('approved','rejected') AND reviewed_at IS NOT NULL))
      );

      CREATE INDEX leave_requests_worker_dates_idx ON leave_requests(tenant_id,worker_id,start_date,end_date);
      CREATE INDEX leave_requests_review_idx ON leave_requests(tenant_id,status,created_at DESC);

      CREATE TABLE overtime_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        worker_id uuid NOT NULL,
        project_id uuid,
        site_id uuid,
        work_date date NOT NULL,
        requested_minutes integer NOT NULL CHECK (requested_minutes BETWEEN 1 AND 1440),
        approved_minutes integer CHECK (approved_minutes BETWEEN 0 AND 1440),
        reason varchar(500) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','approved','rejected','cancelled')),
        requested_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        reviewed_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        review_reason varchar(500),
        created_at timestamptz NOT NULL DEFAULT now(),
        reviewed_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id,id),
        FOREIGN KEY (tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id,site_id) REFERENCES sites(tenant_id,id) ON DELETE RESTRICT,
        CHECK ((status IN ('pending','cancelled') AND reviewed_at IS NULL) OR (status IN ('approved','rejected') AND reviewed_at IS NOT NULL)),
        CHECK (status <> 'approved' OR approved_minutes IS NOT NULL)
      );

      CREATE INDEX overtime_requests_tenant_date_idx ON overtime_requests(tenant_id,work_date DESC,status);

      DO $rls$
      DECLARE table_name text; role_name text;
      BEGIN
        FOREACH table_name IN ARRAY ARRAY['work_shifts','leave_types','worker_leave_balances','leave_requests','overtime_requests'] LOOP
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
          EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
          EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            table_name
          );
        END LOOP;
        FOREACH role_name IN ARRAY ARRAY['jengaflow_app','jf_app'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON work_shifts,leave_types,worker_leave_balances,leave_requests,overtime_requests TO %I',role_name);
          END IF;
        END LOOP;
      END $rls$;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS overtime_requests,leave_requests,worker_leave_balances,leave_types,work_shifts CASCADE;');
  }
}
