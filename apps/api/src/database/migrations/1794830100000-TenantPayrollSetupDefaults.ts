import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantPayrollSetupDefaults1794830100000 implements MigrationInterface {
  name = 'TenantPayrollSetupDefaults1794830100000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE tenant_payroll_settings (
        tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE RESTRICT,
        currency char(3) NOT NULL DEFAULT 'KES',
        timezone varchar(80) NOT NULL DEFAULT 'Africa/Nairobi',
        pay_frequency varchar(20) NOT NULL DEFAULT 'monthly'
          CHECK (pay_frequency IN ('daily','weekly','biweekly','semimonthly','monthly')),
        week_starts_on smallint NOT NULL DEFAULT 1 CHECK (week_starts_on BETWEEN 0 AND 6),
        standard_hours_per_day numeric(5,2) NOT NULL DEFAULT 8 CHECK (standard_hours_per_day > 0),
        standard_days_per_month numeric(5,2) NOT NULL DEFAULT 26 CHECK (standard_days_per_month > 0),
        overtime_policy jsonb NOT NULL DEFAULT '{"requiresApproval":true,"multipliersAreTenantConfigured":true}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE tenant_deduction_types (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        code varchar(60) NOT NULL,
        name varchar(140) NOT NULL,
        category varchar(24) NOT NULL CHECK (category IN ('voluntary','recovery','other')),
        calculation_method varchar(32) NOT NULL CHECK (calculation_method IN ('fixed_amount','percentage','balance_recovery')),
        configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
        taxable_treatment varchar(40) NOT NULL DEFAULT 'not_applicable',
        is_system boolean NOT NULL DEFAULT false,
        is_enabled boolean NOT NULL DEFAULT true,
        requires_approval boolean NOT NULL DEFAULT true,
        effective_from date NOT NULL,
        effective_to date,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
        UNIQUE(tenant_id, code, effective_from)
      );

      CREATE TABLE tenant_allowance_types (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        code varchar(60) NOT NULL,
        name varchar(140) NOT NULL,
        calculation_method varchar(32) NOT NULL CHECK (calculation_method IN ('fixed_amount','per_day','per_hour','percentage','quantity_times_rate')),
        configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
        tax_treatment varchar(40) NOT NULL DEFAULT 'review_required',
        is_enabled boolean NOT NULL DEFAULT true,
        requires_approval boolean NOT NULL DEFAULT true,
        effective_from date NOT NULL,
        effective_to date,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
        UNIQUE(tenant_id, code, effective_from)
      );

      CREATE TABLE worker_deduction_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        worker_id uuid NOT NULL,
        deduction_type_id uuid NOT NULL,
        amount numeric(19,4) NOT NULL CHECK (amount >= 0),
        outstanding_balance numeric(19,4) CHECK (outstanding_balance IS NULL OR outstanding_balance >= 0),
        effective_from date NOT NULL,
        effective_to date,
        status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','cancelled')),
        reference varchar(120),
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id, worker_id) REFERENCES workers(tenant_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, deduction_type_id) REFERENCES tenant_deduction_types(tenant_id, id) ON DELETE RESTRICT,
        CHECK (effective_to IS NULL OR effective_to >= effective_from)
      );

      CREATE TABLE worker_allowance_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        worker_id uuid NOT NULL,
        allowance_type_id uuid NOT NULL,
        amount numeric(19,4) NOT NULL CHECK (amount >= 0),
        effective_from date NOT NULL,
        effective_to date,
        status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id, worker_id) REFERENCES workers(tenant_id, id) ON DELETE RESTRICT,
        FOREIGN KEY (tenant_id, allowance_type_id) REFERENCES tenant_allowance_types(tenant_id, id) ON DELETE RESTRICT,
        CHECK (effective_to IS NULL OR effective_to >= effective_from)
      );

      CREATE INDEX idx_deduction_assignments_worker ON worker_deduction_assignments(tenant_id,worker_id,status);
      CREATE INDEX idx_allowance_assignments_worker ON worker_allowance_assignments(tenant_id,worker_id,status);

      ALTER TABLE tenant_payroll_settings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_payroll_settings FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON tenant_payroll_settings
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

        ALTER TABLE tenant_deduction_types ENABLE ROW LEVEL SECURITY;
        ALTER TABLE tenant_deduction_types FORCE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON tenant_deduction_types
          USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
          WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
        ALTER TABLE tenant_allowance_types ENABLE ROW LEVEL SECURITY;
        ALTER TABLE tenant_allowance_types FORCE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON tenant_allowance_types
          USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
          WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
        ALTER TABLE worker_deduction_assignments ENABLE ROW LEVEL SECURITY;
        ALTER TABLE worker_deduction_assignments FORCE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON worker_deduction_assignments
          USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
          WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
        ALTER TABLE worker_allowance_assignments ENABLE ROW LEVEL SECURITY;
        ALTER TABLE worker_allowance_assignments FORCE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON worker_allowance_assignments
          USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
          WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE IF EXISTS worker_allowance_assignments, worker_deduction_assignments,
        tenant_allowance_types, tenant_deduction_types, tenant_payroll_settings CASCADE;
    `);
  }
}
