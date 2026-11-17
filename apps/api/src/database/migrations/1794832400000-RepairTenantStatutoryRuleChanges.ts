import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repairs installations where the original compliance migration was recorded
 * but the tenant rule-change table is missing from the active database.
 * The table is recreated idempotently and its tenant RLS/grants are restored.
 */
export class RepairTenantStatutoryRuleChanges1794832400000 implements MigrationInterface {
  name = 'RepairTenantStatutoryRuleChanges1794832400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS tenant_statutory_rule_changes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        rule_set_id uuid NOT NULL REFERENCES statutory_rule_sets(id) ON DELETE RESTRICT,
        rule_code varchar(80) NOT NULL,
        label varchar(180) NOT NULL,
        category varchar(32) NOT NULL CHECK (category IN ('tax','employee_deduction','employer_contribution','tax_relief','allowable_deduction','levy')),
        calculation_method varchar(60) NOT NULL,
        configuration jsonb NOT NULL,
        effective_from date NOT NULL,
        effective_to date,
        source_title varchar(240) NOT NULL,
        source_url text NOT NULL,
        verified_on date NOT NULL,
        reason text NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft','submitted','approved','rejected','superseded')),
        submission_notes text,
        review_notes text,
        submitted_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        submitted_at timestamptz,
        reviewed_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        reviewed_at timestamptz,
        applied_override_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
        CHECK (status <> 'approved' OR reviewed_by IS NOT NULL),
        UNIQUE (tenant_id,id),
        UNIQUE (tenant_id,rule_code,effective_from)
      );

      CREATE INDEX IF NOT EXISTS tenant_statutory_rule_changes_status_idx
        ON tenant_statutory_rule_changes(tenant_id,status,effective_from DESC);

      ALTER TABLE tenant_statutory_rule_changes ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_statutory_rule_changes FORCE ROW LEVEL SECURITY;

      DO $repair$
      DECLARE role_name text;
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'tenant_statutory_rule_changes'
            AND policyname = 'tenant_isolation'
        ) THEN
          CREATE POLICY tenant_isolation ON tenant_statutory_rule_changes
            USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
            WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
        END IF;

        FOREACH role_name IN ARRAY ARRAY['jengaflow_app','jf_app'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
            EXECUTE format(
              'GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_statutory_rule_changes TO %I',
              role_name
            );
          END IF;
        END LOOP;
      END $repair$;
    `);
  }

  async down(_q: QueryRunner): Promise<void> {
    // Intentionally non-destructive: this repairs a required compliance table
    // and must not remove tenant rule-change history during rollback.
  }
}
