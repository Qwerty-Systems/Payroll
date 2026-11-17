import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendancePlanningLeaveOvertimeTimesheets1794831600000 implements MigrationInterface {
  name='AttendancePlanningLeaveOvertimeTimesheets1794831600000';
  async up(q:QueryRunner):Promise<void>{
    await q.query(`
      CREATE TABLE attendance_shifts(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        code varchar(40) NOT NULL,name varchar(120) NOT NULL,start_time time NOT NULL,end_time time NOT NULL,
        break_minutes integer NOT NULL DEFAULT 0 CHECK(break_minutes BETWEEN 0 AND 720),
        grace_minutes integer NOT NULL DEFAULT 0 CHECK(grace_minutes BETWEEN 0 AND 240),
        status varchar(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
        created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(tenant_id,id),UNIQUE(tenant_id,code)
      );
      CREATE TABLE worker_shift_assignments(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,worker_id uuid NOT NULL,shift_id uuid NOT NULL,
        effective_from date NOT NULL,effective_to date,
        created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
        CHECK(effective_to IS NULL OR effective_to>=effective_from),
        FOREIGN KEY(tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY(tenant_id,shift_id) REFERENCES attendance_shifts(tenant_id,id) ON DELETE RESTRICT,
        UNIQUE(tenant_id,id)
      );
      CREATE INDEX worker_shift_effective_idx ON worker_shift_assignments(tenant_id,worker_id,effective_from,effective_to);
      CREATE TABLE leave_requests(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,worker_id uuid NOT NULL,
        leave_type varchar(24) NOT NULL CHECK(leave_type IN ('annual','sick','maternity','paternity','compassionate','unpaid','other')),
        start_date date NOT NULL,end_date date NOT NULL,requested_days numeric(6,2) NOT NULL CHECK(requested_days>0),
        reason varchar(500) NOT NULL,status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
        requested_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,reviewed_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        review_reason varchar(500),created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,
        CHECK(end_date>=start_date),
        CHECK((status='pending' AND reviewed_at IS NULL) OR (status<>'pending' AND reviewed_at IS NOT NULL)),
        FOREIGN KEY(tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT,
        UNIQUE(tenant_id,id)
      );
      CREATE INDEX leave_requests_queue_idx ON leave_requests(tenant_id,status,start_date);
      CREATE TABLE overtime_requests(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,worker_id uuid NOT NULL,attendance_id uuid NOT NULL,
        work_date date NOT NULL,minutes_requested integer NOT NULL CHECK(minutes_requested BETWEEN 1 AND 1440),
        reason varchar(500) NOT NULL,status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
        requested_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,reviewed_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        review_reason varchar(500),created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,
        CHECK((status='pending' AND reviewed_at IS NULL) OR (status<>'pending' AND reviewed_at IS NOT NULL)),
        FOREIGN KEY(tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY(tenant_id,attendance_id) REFERENCES attendance_records(tenant_id,id) ON DELETE RESTRICT,
        UNIQUE(tenant_id,id)
      );
      CREATE INDEX overtime_requests_queue_idx ON overtime_requests(tenant_id,status,work_date);
      CREATE TABLE timesheets(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,worker_id uuid NOT NULL,
        period_start date NOT NULL,period_end date NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected')),
        total_minutes integer NOT NULL DEFAULT 0 CHECK(total_minutes>=0),
        submitted_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,approved_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        rejection_reason varchar(500),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK(period_end>=period_start),
        FOREIGN KEY(tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT,
        UNIQUE(tenant_id,id),UNIQUE(tenant_id,worker_id,period_start,period_end)
      );
      CREATE TABLE timesheet_lines(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,timesheet_id uuid NOT NULL,attendance_id uuid NOT NULL,
        minutes_worked integer NOT NULL CHECK(minutes_worked>=0),
        FOREIGN KEY(tenant_id,timesheet_id) REFERENCES timesheets(tenant_id,id) ON DELETE CASCADE,
        FOREIGN KEY(tenant_id,attendance_id) REFERENCES attendance_records(tenant_id,id) ON DELETE RESTRICT,
        UNIQUE(tenant_id,timesheet_id,attendance_id)
      );
      CREATE INDEX timesheet_queue_idx ON timesheets(tenant_id,status,period_start);
      DO $$ DECLARE t text; BEGIN
        FOREACH t IN ARRAY ARRAY['attendance_shifts','worker_shift_assignments','leave_requests','overtime_requests','timesheets','timesheet_lines'] LOOP
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
          EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
          EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
        END LOOP;
      END $$;
    `);
  }
  async down(q:QueryRunner):Promise<void>{
    await q.query('DROP TABLE IF EXISTS timesheet_lines,timesheets,overtime_requests,leave_requests,worker_shift_assignments,attendance_shifts CASCADE');
  }
}
