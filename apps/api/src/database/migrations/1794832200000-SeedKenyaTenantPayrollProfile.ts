import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Completes the Kenya tenant payroll starter profile for both existing and
 * future workspaces. All inserts are idempotent and preserve tenant edits.
 */
export class SeedKenyaTenantPayrollProfile1794832200000 implements MigrationInterface {
  name = 'SeedKenyaTenantPayrollProfile1794832200000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE tenant_payroll_settings
        ADD COLUMN IF NOT EXISTS country_code char(2) NOT NULL DEFAULT 'KE',
        ADD COLUMN IF NOT EXISTS tax_year_start_month smallint NOT NULL DEFAULT 1
          CHECK (tax_year_start_month BETWEEN 1 AND 12),
        ADD COLUMN IF NOT EXISTS payroll_period_start_day smallint NOT NULL DEFAULT 1
          CHECK (payroll_period_start_day BETWEEN 1 AND 28),
        ADD COLUMN IF NOT EXISTS pay_day_of_month smallint NOT NULL DEFAULT 30
          CHECK (pay_day_of_month BETWEEN 1 AND 31),
        ADD COLUMN IF NOT EXISTS default_tax_residency varchar(20) NOT NULL DEFAULT 'resident'
          CHECK (default_tax_residency IN ('resident','non_resident','review_required')),
        ADD COLUMN IF NOT EXISTS standard_working_days_per_week numeric(4,2) NOT NULL DEFAULT 5
          CHECK (standard_working_days_per_week > 0 AND standard_working_days_per_week <= 7),
        ADD COLUMN IF NOT EXISTS allow_partial_month_proration boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS statutory_settings jsonb NOT NULL DEFAULT
          '{"PAYE":{"enabled":true,"personalRelief":"eligible_resident_employees_only"},"NSSF":{"enabled":true,"employeeContribution":true,"employerContribution":true},"SHIF":{"enabled":true,"employeeContribution":true,"employerContribution":false},"AHL":{"enabled":true,"employeeRate":0.015,"employerRate":0.015},"NITA":{"enabled":true,"employerOnly":true},"insuranceRelief":{"enabled":false,"requiresEmployeeEvidence":true},"HELB":{"enabled":false,"requiresEmployeeNotice":true}}'::jsonb,
        ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;

      UPDATE tenant_payroll_settings
      SET country_code=COALESCE(country_code,'KE'),
          currency=COALESCE(NULLIF(currency,''),'KES'),
          timezone=COALESCE(NULLIF(timezone,''),'Africa/Nairobi'),
          setup_completed_at=COALESCE(setup_completed_at,now());

      INSERT INTO tenant_payroll_settings(tenant_id,currency,timezone,country_code,setup_completed_at)
      SELECT id,COALESCE(NULLIF(currency,''),'KES'),COALESCE(NULLIF(timezone,''),'Africa/Nairobi'),'KE',now()
      FROM tenants
      ON CONFLICT(tenant_id) DO NOTHING;

      INSERT INTO tenant_statutory_assignments(tenant_id,rule_set_id,effective_from)
      SELECT t.id,s.id,CURRENT_DATE
      FROM tenants t
      CROSS JOIN LATERAL (
        SELECT id FROM statutory_rule_sets
        WHERE country_code='KE' AND status='published'
        ORDER BY published_at DESC NULLS LAST,version DESC LIMIT 1
      ) s
      WHERE NOT EXISTS (
        SELECT 1 FROM tenant_statutory_assignments a
        WHERE a.tenant_id=t.id AND a.effective_from <= CURRENT_DATE
          AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
      )
      ON CONFLICT(tenant_id,rule_set_id,effective_from) DO NOTHING;

      INSERT INTO tenant_deduction_types
        (tenant_id,code,name,category,calculation_method,configuration,taxable_treatment,is_system,is_enabled,requires_approval,effective_from)
      SELECT t.id,v.code,v.name,v.category,v.method,v.configuration::jsonb,'review_required',true,true,true,CURRENT_DATE
      FROM tenants t
      CROSS JOIN (VALUES
        ('HELB_REPAYMENT','HELB / student loan recovery','other','fixed_amount','{"requiresAuthorityNotice":true,"employeePayrollDeduction":true}'),
        ('EMPLOYEE_PENSION','Employee registered pension contribution','voluntary','fixed_amount','{"requiresSchemeEvidence":true,"taxTreatment":"subject_to_statutory_cap"}'),
        ('POST_RETIREMENT_MEDICAL','Post-retirement medical fund contribution','voluntary','fixed_amount','{"requiresSchemeEvidence":true,"taxTreatment":"subject_to_statutory_cap"}'),
        ('MORTGAGE_INTEREST','Owner-occupied residential mortgage interest relief','voluntary','fixed_amount','{"requiresLenderStatement":true,"taxTreatment":"taxable_income_deduction_subject_to_cap"}'),
        ('COURT_ORDER','Court-ordered deduction','other','fixed_amount','{"requiresCourtOrder":true,"legalLimitReviewRequired":true}'),
        ('GARNISHEE_ORDER','Garnishee order','other','fixed_amount','{"requiresCourtOrder":true,"legalLimitReviewRequired":true}'),
        ('STAFF_ADVANCE_RECOVERY','Salary advance recovery','recovery','balance_recovery','{"requiresSignedAcknowledgement":true}'),
        ('STAFF_LOAN_RECOVERY','Staff loan recovery','recovery','balance_recovery','{"requiresLoanAgreement":true}'),
        ('SACCO_CONTRIBUTION','SACCO contribution','voluntary','fixed_amount','{"requiresEmployeeConsent":true}'),
        ('UNION_DUES','Union dues','voluntary','fixed_amount','{"requiresEmployeeConsent":true}'),
        ('VOLUNTARY_PENSION','Voluntary pension contribution','voluntary','percentage','{"requiresEmployeeConsent":true}'),
        ('VOLUNTARY_INSURANCE','Voluntary insurance','voluntary','fixed_amount','{"requiresEmployeeConsent":true}'),
        ('SALARY_SACRIFICE','Approved salary sacrifice','voluntary','fixed_amount','{"requiresWrittenAgreement":true,"taxTreatment":"review_required"}'),
        ('OTHER_DEDUCTION','Other approved deduction','other','fixed_amount','{"requiresWrittenAuthorization":true}')
      ) AS v(code,name,category,method,configuration)
      WHERE NOT EXISTS (
        SELECT 1 FROM tenant_deduction_types d WHERE d.tenant_id=t.id AND d.code=v.code
      )
      ON CONFLICT(tenant_id,code,effective_from) DO NOTHING;

      INSERT INTO tenant_allowance_types
        (tenant_id,code,name,calculation_method,configuration,tax_treatment,is_enabled,requires_approval,effective_from)
      SELECT t.id,v.code,v.name,v.method,v.configuration::jsonb,'review_required',true,true,CURRENT_DATE
      FROM tenants t
      CROSS JOIN (VALUES
        ('BASIC_SALARY','Basic monthly salary','fixed_amount','{"taxTreatment":"taxable_salary","includedInGross":true}'),
        ('TRANSPORT','Transport allowance','fixed_amount','{"taxTreatment":"review_required"}'),
        ('COMMUTER','Commuter allowance','fixed_amount','{"taxTreatment":"review_required"}'),
        ('HOUSING','Housing allowance','fixed_amount','{"taxTreatment":"review_required"}'),
        ('MEALS','Meals allowance','per_day','{"taxTreatment":"review_required"}'),
        ('SITE_ALLOWANCE','Site allowance','per_day','{"taxTreatment":"review_required"}'),
        ('OVERTIME','Overtime','per_hour','{"hoursBasis":"approved_hours","taxTreatment":"review_required"}'),
        ('NIGHT_SHIFT','Night shift allowance','per_hour','{"hoursBasis":"approved_hours","taxTreatment":"review_required"}'),
        ('TRAVEL_PER_DIEM','Travel per diem','per_day','{"taxTreatment":"review_required"}'),
        ('HARDSHIP','Hardship allowance','fixed_amount','{"taxTreatment":"review_required"}'),
        ('RESPONSIBILITY','Responsibility allowance','fixed_amount','{"taxTreatment":"review_required"}'),
        ('ACTING','Acting allowance','fixed_amount','{"taxTreatment":"review_required"}'),
        ('AIRTIME','Airtime allowance','fixed_amount','{"taxTreatment":"review_required"}'),
        ('TOOL_ALLOWANCE','Tools and equipment allowance','fixed_amount','{"taxTreatment":"review_required"}'),
        ('PRODUCTIVITY_BONUS','Productivity bonus','percentage','{"taxTreatment":"review_required"}'),
        ('OTHER_ALLOWANCE','Other approved allowance','fixed_amount','{"taxTreatment":"review_required"}')
      ) AS v(code,name,method,configuration)
      WHERE NOT EXISTS (
        SELECT 1 FROM tenant_allowance_types a WHERE a.tenant_id=t.id AND a.code=v.code
      )
      ON CONFLICT(tenant_id,code,effective_from) DO NOTHING;
    `);
  }

  async down(_q: QueryRunner): Promise<void> {
    // Defaults are tenant-editable setup data; retain them on rollback.
  }
}
