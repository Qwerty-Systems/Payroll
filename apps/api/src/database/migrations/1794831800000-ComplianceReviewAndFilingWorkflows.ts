import { MigrationInterface, QueryRunner } from 'typeorm';

export class ComplianceReviewAndFilingWorkflows1794831800000 implements MigrationInterface {
  name = 'ComplianceReviewAndFilingWorkflows1794831800000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE tenant_statutory_rule_reviews (
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

      CREATE INDEX tenant_rule_reviews_status_idx
        ON tenant_statutory_rule_reviews(tenant_id,status,effective_from DESC);

      CREATE TABLE tenant_statutory_rule_changes (
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

      ALTER TABLE tenant_statutory_rule_overrides
        ADD COLUMN rule_set_id uuid REFERENCES statutory_rule_sets(id) ON DELETE RESTRICT,
        ADD COLUMN status varchar(20) NOT NULL DEFAULT 'approved'
          CHECK (status IN ('draft','submitted','approved','rejected','superseded')),
        ADD COLUMN submitted_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        ADD COLUMN reviewed_at timestamptz,
        ADD COLUMN review_notes text,
        ADD COLUMN source_title varchar(240),
        ADD COLUMN source_url text,
        ADD COLUMN verified_on date;

      CREATE TABLE statutory_filing_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        payroll_period_id uuid NOT NULL,
        payroll_run_id uuid NOT NULL,
        authority varchar(40) NOT NULL CHECK (authority IN ('KRA','NSSF','SHA','HOUSING_LEVY','NITA','OTHER')),
        filing_type varchar(80) NOT NULL,
        reference_period varchar(40) NOT NULL,
        due_date date,
        status varchar(24) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft','prepared','in_review','approved','submitted','accepted','rejected','amended')),
        currency char(3) NOT NULL DEFAULT 'KES',
        totals jsonb NOT NULL DEFAULT '{}'::jsonb,
        report_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        preparation_notes text,
        review_notes text,
        external_reference varchar(180),
        submission_channel varchar(40),
        prepared_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        prepared_at timestamptz,
        reviewed_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        reviewed_at timestamptz,
        submitted_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        submitted_at timestamptz,
        submission_evidence_url text,
        accepted_at timestamptz,
        rejected_at timestamptz,
        rejection_reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id,id),
        FOREIGN KEY (tenant_id,payroll_period_id) REFERENCES payroll_periods(tenant_id,id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id,payroll_run_id) REFERENCES payroll_runs(tenant_id,id) ON DELETE RESTRICT
      );

      CREATE INDEX statutory_filings_tenant_status_idx
        ON statutory_filing_records(tenant_id,status,due_date);
      CREATE INDEX statutory_filings_period_idx
        ON statutory_filing_records(tenant_id,payroll_period_id,authority);

      DO $$ DECLARE t text; BEGIN
        FOREACH t IN ARRAY ARRAY[
          'tenant_statutory_rule_reviews',
          'tenant_statutory_rule_changes',
          'statutory_filing_records'
        ] LOOP
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
          EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
          EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t
          );
        END LOOP;
      END $$;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE IF EXISTS statutory_filing_records;
      ALTER TABLE tenant_statutory_rule_overrides
        DROP COLUMN IF EXISTS verified_on,
        DROP COLUMN IF EXISTS rule_set_id,
        DROP COLUMN IF EXISTS source_url,
        DROP COLUMN IF EXISTS source_title,
        DROP COLUMN IF EXISTS review_notes,
        DROP COLUMN IF EXISTS reviewed_at,
        DROP COLUMN IF EXISTS submitted_by,
        DROP COLUMN IF EXISTS status;
      DROP TABLE IF EXISTS tenant_statutory_rule_changes, tenant_statutory_rule_reviews;
    `);
  }
}
