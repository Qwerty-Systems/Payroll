import { MigrationInterface, QueryRunner } from 'typeorm';
export class TenantInvitations1794830900000 implements MigrationInterface {
  name = 'TenantInvitations1794830900000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE tenant_invitations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        email varchar(254) NOT NULL, role varchar(40) NOT NULL,
        token_hash char(64) NOT NULL, expires_at timestamptz NOT NULL,
        invited_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        accepted_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        accepted_at timestamptz, revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(tenant_id,id), UNIQUE(token_hash)
      );
      CREATE INDEX tenant_invitations_pending_idx ON tenant_invitations(tenant_id,lower(email),expires_at) WHERE accepted_at IS NULL AND revoked_at IS NULL;
      ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_invitations FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON tenant_invitations USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
    `);
  }
  async down(q: QueryRunner): Promise<void> { await q.query('DROP TABLE IF EXISTS tenant_invitations CASCADE'); }
}
