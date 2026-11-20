import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendanceCorrectionWorkflow1794831500000 implements MigrationInterface {
  name = 'AttendanceCorrectionWorkflow1794831500000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE attendance_records
        ADD CONSTRAINT attendance_records_tenant_id_id_key UNIQUE (tenant_id,id);
      CREATE TABLE attendance_correction_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        attendance_id uuid NOT NULL,
        proposed_values jsonb NOT NULL,
        reason varchar(500) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','approved','rejected')),
        requested_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        reviewed_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        review_reason varchar(500),
        created_at timestamptz NOT NULL DEFAULT now(),
        reviewed_at timestamptz,
        FOREIGN KEY (tenant_id,attendance_id)
          REFERENCES attendance_records(tenant_id,id) ON DELETE RESTRICT,
        CHECK (jsonb_typeof(proposed_values) = 'object' AND proposed_values <> '{}'::jsonb),
        CHECK ((status = 'pending' AND reviewed_at IS NULL) OR (status <> 'pending' AND reviewed_at IS NOT NULL))
      );
      CREATE INDEX attendance_correction_tenant_record_idx
        ON attendance_correction_requests(tenant_id,attendance_id,created_at DESC);
      CREATE UNIQUE INDEX attendance_correction_one_pending_idx
        ON attendance_correction_requests(tenant_id,attendance_id) WHERE status='pending';
      ALTER TABLE attendance_correction_requests ENABLE ROW LEVEL SECURITY;
      ALTER TABLE attendance_correction_requests FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON attendance_correction_requests
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      DO $roles$ DECLARE role_name text; BEGIN
        FOREACH role_name IN ARRAY ARRAY['jengaflow_app','jf_app'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_correction_requests TO %I', role_name);
          END IF;
        END LOOP;
      END $roles$;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS attendance_correction_requests CASCADE; ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_tenant_id_id_key;');
  }
}
