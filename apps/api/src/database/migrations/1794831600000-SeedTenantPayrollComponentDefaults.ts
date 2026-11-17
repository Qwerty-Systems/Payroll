import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfills editable allowance and deduction templates for workspaces created
 * before onboarding began seeding the catalogue. Existing company-specific
 * rows are preserved; only missing component codes are inserted.
 */
export class SeedTenantPayrollComponentDefaults1794831600000 implements MigrationInterface {
  name = 'SeedTenantPayrollComponentDefaults1794831600000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO tenant_deduction_types
        (tenant_id,code,name,category,calculation_method,configuration,taxable_treatment,is_system,is_enabled,requires_approval,effective_from)
      SELECT t.id, seed.code, seed.name, seed.category, seed.method, '{}'::jsonb, 'review_required', true, true, true, CURRENT_DATE
      FROM tenants t
      CROSS JOIN (VALUES
        ('STAFF_ADVANCE_RECOVERY','Salary advance recovery','recovery','balance_recovery'),
        ('STAFF_LOAN_RECOVERY','Staff loan recovery','recovery','balance_recovery'),
        ('SACCO_CONTRIBUTION','SACCO contribution','voluntary','fixed_amount'),
        ('UNION_DUES','Union dues','voluntary','fixed_amount'),
        ('VOLUNTARY_PENSION','Voluntary pension contribution','voluntary','percentage'),
        ('VOLUNTARY_INSURANCE','Voluntary insurance','voluntary','fixed_amount'),
        ('COURT_ORDER','Court-ordered deduction','other','fixed_amount'),
        ('GARNISHEE_ORDER','Garnishee order','other','fixed_amount'),
        ('SALARY_SACRIFICE','Approved salary sacrifice','voluntary','fixed_amount'),
        ('OTHER_DEDUCTION','Other approved deduction','other','fixed_amount')
      ) AS seed(code,name,category,method)
      WHERE NOT EXISTS (
        SELECT 1 FROM tenant_deduction_types d WHERE d.tenant_id=t.id AND d.code=seed.code
      );

      INSERT INTO tenant_allowance_types
        (tenant_id,code,name,calculation_method,configuration,tax_treatment,is_enabled,requires_approval,effective_from)
      SELECT t.id, seed.code, seed.name, seed.method, '{}'::jsonb, 'review_required', true, true, CURRENT_DATE
      FROM tenants t
      CROSS JOIN (VALUES
        ('TRANSPORT','Transport allowance','fixed_amount'),
        ('COMMUTER','Commuter allowance','fixed_amount'),
        ('HOUSING','Housing allowance','fixed_amount'),
        ('MEALS','Meals allowance','per_day'),
        ('SITE_ALLOWANCE','Site allowance','per_day'),
        ('OVERTIME','Overtime','per_hour'),
        ('NIGHT_SHIFT','Night shift allowance','per_hour'),
        ('TRAVEL_PER_DIEM','Travel per diem','per_day'),
        ('HARDSHIP','Hardship allowance','fixed_amount'),
        ('RESPONSIBILITY','Responsibility allowance','fixed_amount'),
        ('ACTING','Acting allowance','fixed_amount'),
        ('AIRTIME','Airtime allowance','fixed_amount'),
        ('TOOL_ALLOWANCE','Tools and equipment allowance','fixed_amount'),
        ('PRODUCTIVITY_BONUS','Productivity bonus','percentage'),
        ('OTHER_ALLOWANCE','Other approved allowance','fixed_amount')
      ) AS seed(code,name,method)
      WHERE NOT EXISTS (
        SELECT 1 FROM tenant_allowance_types a WHERE a.tenant_id=t.id AND a.code=seed.code
      );
    `);
  }

  async down(_q: QueryRunner): Promise<void> {
    // Seeded tenant configuration is user-editable and may already be in use.
    // It is intentionally retained on rollback rather than deleting company data.
  }
}
