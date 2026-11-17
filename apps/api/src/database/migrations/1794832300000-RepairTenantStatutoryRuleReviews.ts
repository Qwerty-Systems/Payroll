import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repairs installations where the compliance review migration was recorded
 * but tenant_statutory_rule_reviews is absent from the active application
 * database. Safe to run after the original migration: all DDL is idempotent.
 */
export class RepairTenantStatutoryRuleReviews1794832300000 implements MigrationInterface {
  name = 'RepairTenantStatutoryRuleReviews1794832300000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS tenant_statutory_rule_reviews (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        rule_set_id uuid NOT NULL REFERENCES statutory_rule_sets(id) ON DELETE RESTRICT,
        status varchar(20) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft','submitted','approved','rejected','superseded')),
        effective_from date NOT NULL,
        effective_to date,
        rules_snapshot_hash char(64) NOT NULL,
        submission_notes text,
        review_notes text,
        submitted_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        submitted_at timestamptz,
        reviewed_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
        CHECK (status <> 'approved' OR reviewed_by IS NOT NULL),
        UNIQUE (tenant_id,id)
      );

      CREATE INDEX IF NOT EXISTS tenant_rule_reviews_status_idx
        ON tenant_statutory_rule_reviews(tenant_id,status,effective_from DESC);

      ALTER TABLE tenant_statutory_rule_reviews ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_statutory_rule_reviews FORCE ROW LEVEL SECURITY;

      DO $repair$
      DECLARE role_name text;
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'tenant_statutory_rule_reviews'
            AND policyname = 'tenant_isolation'
        ) THEN
          CREATE POLICY tenant_isolation ON tenant_statutory_rule_reviews
            USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
            WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
        END IF;

        FOREACH role_name IN ARRAY ARRAY['jengaflow_app','jf_app'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
            EXECUTE format(
              'GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_statutory_rule_reviews TO %I',
              role_name
            );
          END IF;
        END LOOP;
      END $repair$;
    `);
  }

  async down(_q: QueryRunner): Promise<void> {
    // Intentionally non-destructive: this migration repairs a required
    // compliance table and must not drop tenant review history on rollback.
  }
}
