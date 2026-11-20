import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkforceAssignmentConflictGuard1795200000000 implements MigrationInterface {
  name = 'WorkforceAssignmentConflictGuard1795200000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE UNIQUE INDEX worker_shift_assignments_one_scheduled_per_day_idx
        ON worker_shift_assignments(tenant_id,worker_id,work_date)
        WHERE status='scheduled';
    CREATE INDEX worker_shift_assignments_worker_date_idx
        ON worker_shift_assignments(tenant_id,worker_id,work_date);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX IF EXISTS worker_shift_assignments_worker_date_idx;
      DROP INDEX IF EXISTS worker_shift_assignments_one_scheduled_per_day_idx;
    `);
  }
}
