import { MigrationInterface, QueryRunner } from 'typeorm';

export class OperationsApprovalAudit1794830400000 implements MigrationInterface {
  name = 'OperationsApprovalAudit1794830400000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE attendance_records
        ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS rejection_reason text;
      CREATE INDEX IF NOT EXISTS attendance_approval_queue_idx ON attendance_records(tenant_id, status, work_date);
      CREATE INDEX IF NOT EXISTS attendance_approved_by_idx ON attendance_records(tenant_id, approved_by);
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS attendance_approved_by_idx; DROP INDEX IF EXISTS attendance_approval_queue_idx; ALTER TABLE attendance_records DROP COLUMN IF EXISTS rejection_reason, DROP COLUMN IF EXISTS rejected_by, DROP COLUMN IF EXISTS approved_by, DROP COLUMN IF EXISTS submitted_by, DROP COLUMN IF EXISTS created_by;`);
  }
}
