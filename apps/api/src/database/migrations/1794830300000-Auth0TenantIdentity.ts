import { MigrationInterface, QueryRunner } from 'typeorm';

export class Auth0TenantIdentity1794830300000 implements MigrationInterface {
  name = 'Auth0TenantIdentity1794830300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE platform_users ALTER COLUMN password_hash DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE platform_users ADD COLUMN auth0_subject varchar(255)`);
    await queryRunner.query(`CREATE UNIQUE INDEX platform_users_auth0_subject_uq ON platform_users(auth0_subject) WHERE auth0_subject IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX tenant_memberships_tenant_status_idx ON tenant_memberships(tenant_id, status)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS tenant_memberships_tenant_status_idx`);
    await queryRunner.query(`DROP INDEX IF EXISTS platform_users_auth0_subject_uq`);
    await queryRunner.query(`ALTER TABLE platform_users DROP COLUMN IF EXISTS auth0_subject`);
    await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM platform_users WHERE password_hash IS NULL) THEN ALTER TABLE platform_users ALTER COLUMN password_hash SET NOT NULL; END IF; END $$`);
  }
}
