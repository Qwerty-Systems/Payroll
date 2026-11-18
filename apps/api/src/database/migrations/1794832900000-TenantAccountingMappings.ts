import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantAccountingMappings1794832900000 implements MigrationInterface {
  name = 'TenantAccountingMappings1794832900000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS tenant_account_mappings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        component_code varchar(100) NOT NULL,
        component_label varchar(200) NOT NULL,
        debit_account_code varchar(80) NOT NULL,
        credit_account_code varchar(80) NOT NULL,
        cost_center_code varchar(80),
        effective_from date NOT NULL,
        effective_to date,
        created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
        UNIQUE (tenant_id,component_code,effective_from)
      );
      CREATE INDEX IF NOT EXISTS tenant_account_mappings_effective_idx
        ON tenant_account_mappings(tenant_id,component_code,effective_from DESC);
      ALTER TABLE tenant_account_mappings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_account_mappings FORCE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname=current_schema() AND tablename='tenant_account_mappings' AND policyname='tenant_isolation') THEN
          CREATE POLICY tenant_isolation ON tenant_account_mappings
            USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
            WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
        END IF;
      END $$;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jengaflow_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON tenant_account_mappings TO jengaflow_app; END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jf_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON tenant_account_mappings TO jf_app; END IF;
      END $$;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS tenant_account_mappings CASCADE');
  }
}
