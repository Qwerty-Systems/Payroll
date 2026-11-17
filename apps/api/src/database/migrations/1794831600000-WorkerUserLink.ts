import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Links a worker record to the platform user (tenant membership) who is that worker. Without this link the `worker`
 * role could not be limited to its own payslips. The composite foreign key guarantees the linked user is a member of
 * the same tenant; a user can be linked to at most one worker per tenant.
 */
export class WorkerUserLink1794831600000 implements MigrationInterface {
  name = 'WorkerUserLink1794831600000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE workers ADD COLUMN user_id uuid;
      ALTER TABLE workers ADD CONSTRAINT workers_tenant_membership_fk
        FOREIGN KEY (tenant_id, user_id) REFERENCES tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT;
      CREATE UNIQUE INDEX workers_tenant_user_uidx ON workers(tenant_id, user_id) WHERE user_id IS NOT NULL;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX IF EXISTS workers_tenant_user_uidx;
      ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_tenant_membership_fk;
      ALTER TABLE workers DROP COLUMN IF EXISTS user_id;
    `);
  }
}
