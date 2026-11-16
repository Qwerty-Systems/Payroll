import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allow /auth/me to discover only the authenticated platform user's own
 * memberships. Tenant-scoped writes remain constrained to app.tenant_id.
 */
export class PlatformIdentityMembershipRead1794831100000 implements MigrationInterface {
  name = 'PlatformIdentityMembershipRead1794831100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER POLICY tenant_isolation ON tenant_memberships
      USING (
        tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        OR user_id = (
          SELECT id FROM platform_users
          WHERE auth0_subject = nullif(current_setting('app.auth0_subject', true), '')
          LIMIT 1
        )
      )
      WITH CHECK (
        tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER POLICY tenant_isolation ON tenant_memberships
      USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    `);
  }
}
