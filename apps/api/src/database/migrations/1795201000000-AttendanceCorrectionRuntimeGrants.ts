import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendanceCorrectionRuntimeGrants1795201000000 implements MigrationInterface {
  name = 'AttendanceCorrectionRuntimeGrants1795201000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $grant_roles$ DECLARE role_name text; BEGIN
        FOREACH role_name IN ARRAY ARRAY['jengaflow_app','jf_app'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_correction_requests TO %I', role_name);
          END IF;
        END LOOP;
      END $grant_roles$;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $revoke_roles$ DECLARE role_name text; BEGIN
        FOREACH role_name IN ARRAY ARRAY['jengaflow_app','jf_app'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
            EXECUTE format('REVOKE SELECT, INSERT, UPDATE, DELETE ON attendance_correction_requests FROM %I', role_name);
          END IF;
        END LOOP;
      END $revoke_roles$;
    `);
  }
}
