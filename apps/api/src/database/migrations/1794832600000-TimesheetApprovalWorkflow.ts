import { MigrationInterface, QueryRunner } from 'typeorm';

export class TimesheetApprovalWorkflow1794832600000 implements MigrationInterface {
  name = 'TimesheetApprovalWorkflow1794832600000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE timesheets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        worker_id uuid NOT NULL,
        period_start date NOT NULL,
        period_end date NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft','submitted','approved','rejected')),
        notes text,
        submitted_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        submitted_at timestamptz,
        reviewed_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        reviewed_at timestamptz,
        review_reason varchar(500),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (period_end >= period_start),
        CHECK ((status='draft' AND reviewed_at IS NULL) OR (status='rejected' AND reviewed_at IS NOT NULL) OR (status='submitted' AND submitted_at IS NOT NULL AND reviewed_at IS NULL) OR (status='approved' AND submitted_at IS NOT NULL AND reviewed_at IS NOT NULL)),
        UNIQUE (tenant_id,id),
        FOREIGN KEY (tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT
      );

      CREATE TABLE timesheet_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        timesheet_id uuid NOT NULL,
        work_date date NOT NULL,
        project_id uuid,
        site_id uuid,
        minutes_worked integer NOT NULL DEFAULT 0 CHECK (minutes_worked BETWEEN 0 AND 1440),
        overtime_minutes integer NOT NULL DEFAULT 0 CHECK (overtime_minutes BETWEEN 0 AND 1440),
        units_completed numeric(14,4) CHECK (units_completed IS NULL OR units_completed >= 0),
        description varchar(500),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id,id),
        FOREIGN KEY (tenant_id,timesheet_id) REFERENCES timesheets(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id,site_id) REFERENCES sites(tenant_id,id) ON DELETE RESTRICT
      );

      CREATE INDEX timesheets_tenant_period_idx ON timesheets(tenant_id,period_start DESC,period_end,status);
      CREATE INDEX timesheet_lines_header_date_idx ON timesheet_lines(tenant_id,timesheet_id,work_date);

      DO $rls$
      DECLARE table_name text; role_name text;
      BEGIN
        FOREACH table_name IN ARRAY ARRAY['timesheets','timesheet_lines'] LOOP
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
          EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
          EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            table_name
          );
        END LOOP;
        FOREACH role_name IN ARRAY ARRAY['jengaflow_app','jf_app'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON timesheets,timesheet_lines TO %I',role_name);
          END IF;
        END LOOP;
      END $rls$;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS timesheet_lines,timesheets CASCADE;');
  }
}
