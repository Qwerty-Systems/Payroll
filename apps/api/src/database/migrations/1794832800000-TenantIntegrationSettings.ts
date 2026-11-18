import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantIntegrationSettings1794832800000 implements MigrationInterface {
  name = 'TenantIntegrationSettings1794832800000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS tenant_integration_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        provider varchar(40) NOT NULL CHECK (provider IN ('daraja','bank_transfer','email','accounting')),
        enabled boolean NOT NULL DEFAULT false,
        environment varchar(20) NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
        settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        connection_status varchar(20) NOT NULL DEFAULT 'not_tested' CHECK (connection_status IN ('not_tested','connected','failed','disabled')),
        last_tested_at timestamptz,
        last_test_message varchar(300),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id,provider)
      );
      ALTER TABLE tenant_integration_settings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_integration_settings FORCE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname=current_schema() AND tablename='tenant_integration_settings' AND policyname='tenant_isolation') THEN
          CREATE POLICY tenant_isolation ON tenant_integration_settings
            USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
            WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
        END IF;
      END $$;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jengaflow_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON tenant_integration_settings TO jengaflow_app; END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jf_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON tenant_integration_settings TO jf_app; END IF;
      END $$;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS tenant_integration_settings CASCADE');
  }
}
