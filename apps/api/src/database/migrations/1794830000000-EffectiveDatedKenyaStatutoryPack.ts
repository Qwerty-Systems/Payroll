import { MigrationInterface, QueryRunner } from 'typeorm';

export class EffectiveDatedKenyaStatutoryPack1794830000000 implements MigrationInterface {
  name = 'EffectiveDatedKenyaStatutoryPack1794830000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE statutory_rule_sets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code char(2) NOT NULL,
        name varchar(160) NOT NULL,
        version varchar(40) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','retired')),
        is_system boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        published_at timestamptz,
        UNIQUE(country_code, version)
      );

      CREATE TABLE statutory_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_set_id uuid NOT NULL REFERENCES statutory_rule_sets(id) ON DELETE RESTRICT,
        code varchar(80) NOT NULL,
        label varchar(180) NOT NULL,
        category varchar(32) NOT NULL CHECK (category IN ('tax','employee_deduction','employer_contribution','tax_relief','allowable_deduction','levy')),
        calculation_method varchar(60) NOT NULL,
        configuration jsonb NOT NULL,
        effective_from date NOT NULL,
        effective_to date,
        source_title varchar(240) NOT NULL,
        source_url text NOT NULL,
        verified_on date NOT NULL,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
        UNIQUE(rule_set_id, code, effective_from)
      );

      CREATE TABLE tenant_statutory_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        rule_set_id uuid NOT NULL REFERENCES statutory_rule_sets(id) ON DELETE RESTRICT,
        effective_from date NOT NULL,
        effective_to date,
        assigned_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
        UNIQUE(tenant_id, rule_set_id, effective_from)
      );

      CREATE TABLE tenant_statutory_rule_overrides (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        rule_code varchar(80) NOT NULL,
        label varchar(180) NOT NULL,
        category varchar(32) NOT NULL,
        calculation_method varchar(60) NOT NULL,
        configuration jsonb NOT NULL,
        effective_from date NOT NULL,
        effective_to date,
        reason text NOT NULL,
        approved_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
        UNIQUE(tenant_id, rule_code, effective_from)
      );

      CREATE INDEX idx_statutory_rules_lookup ON statutory_rules(rule_set_id, code, effective_from, effective_to);
      CREATE INDEX idx_tenant_statutory_active ON tenant_statutory_assignments(tenant_id, effective_from, effective_to);
      CREATE INDEX idx_tenant_statutory_overrides ON tenant_statutory_rule_overrides(tenant_id, rule_code, effective_from, effective_to);

      ALTER TABLE tenant_statutory_assignments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_statutory_assignments FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON tenant_statutory_assignments
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

      ALTER TABLE tenant_statutory_rule_overrides ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_statutory_rule_overrides FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON tenant_statutory_rule_overrides
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
    `);

    const pack = await q.query(`
      INSERT INTO statutory_rule_sets(country_code,name,version,status,is_system,published_at)
      VALUES ('KE','Kenya statutory payroll baseline','KE-2026.11','published',true,now())
      ON CONFLICT(country_code,version) DO UPDATE SET name=EXCLUDED.name
      RETURNING id
    `);
    const packId = pack[0].id as string;

    const rules = [
      {
        code: 'PAYE',
        label: 'Pay As You Earn',
        category: 'tax',
        method: 'progressive_annualized',
        from: '2023-07-01',
        source: 'Kenya Revenue Authority - PAYE',
        url: 'https://www.kra.go.ke/individual/filing-paying/types-of-taxes/paye',
        config: {
          currency: 'KES',
          annualBands: [
            { upTo: 288000, rate: 0.10 },
            { upTo: 388000, rate: 0.25 },
            { upTo: 6000000, rate: 0.30 },
            { upTo: 9600000, rate: 0.325 },
            { upTo: null, rate: 0.35 }
          ],
          monthlyPersonalRelief: 2400,
          annualPersonalRelief: 28800,
          taxPeriod: 'monthly',
          annualize: true,
          notes: 'Apply taxable-benefit rules and allowable deductions before tax bands. Apply resident personal relief only where eligible.'
        }
      },
      {
        code: 'SHIF',
        label: 'Social Health Insurance Fund',
        category: 'employee_deduction',
        method: 'percentage_with_minimum',
        from: '2024-10-01',
        source: 'Social Health Insurance Regulations 2024, Legal Notice 49 as amended; regulation 17',
        url: 'https://new.kenyalaw.org/akn/ke/act/ln/2024/49/eng@2024-09-20/source',
        config: { rate: 0.0275, minimumMonthly: 300, base: 'gross_salary_or_wage', employerContribution: 0, remittanceDue: 'day_9_of_following_month' }
      },
      {
        code: 'NSSF',
        label: 'National Social Security Fund - Year 4',
        category: 'employee_deduction',
        method: 'tiered_percentage',
        from: '2026-02-01',
        source: 'NSSF Notice to Employers - Year 4 (2026)',
        url: 'https://www.nssf.or.ke/notice-to-employers-year-4-2026-nssf-contribution-rates',
        config: { employeeRate: 0.06, employerRate: 0.06, lowerEarningsLimit: 9000, upperEarningsLimit: 108000, tierOneEmployeeMaximum: 540, tierTwoEmployeeMaximum: 5940, maximumEmployeeContribution: 6480, maximumEmployerContribution: 6480, remittanceDue: 'day_9_of_following_month' }
      },
      {
        code: 'AHL',
        label: 'Affordable Housing Levy',
        category: 'employee_deduction',
        method: 'percentage_of_gross_with_employer_match',
        from: '2024-03-19',
        source: 'Affordable Housing Act 2024 and KRA public notice',
        url: 'https://www.kra.go.ke/news-center/public-notices/2099-collection-of-the-affordable-housing-levy-by-kenya-revenue-authority',
        config: { employeeRate: 0.015, employerRate: 0.015, base: 'gross_monthly_salary', employeeDeductibleForPaye: true, employerAmountIsNotEmployeeDeduction: true, remittanceDue: 'ninth_working_day_after_month_end' }
      },
      {
        code: 'NITA',
        label: 'National Industrial Training Authority levy',
        category: 'employer_contribution',
        method: 'fixed_per_employee_per_month',
        from: '2026-11-16',
        source: 'NITA Levy Inspectorate',
        url: 'https://www.nita.go.ke/our-services/levy-inspectorate.html',
        config: { amount: 50, currency: 'KES', frequency: 'monthly', employeePayrollDeduction: false, due: 'last_working_day_of_month' }
      },
      {
        code: 'PAYE_ALLOWABLE_DEDUCTIONS',
        label: 'PAYE allowable deductions',
        category: 'allowable_deduction',
        method: 'capped_components',
        from: '2026-11-16',
        source: 'Kenya Revenue Authority - PAYE',
        url: 'https://www.kra.go.ke/individual/filing-paying/types-of-taxes/paye',
        config: { components: [
          { code: 'SHIF', treatment: 'deduct_from_taxable_income', capMonthly: null },
          { code: 'AHL', treatment: 'deduct_from_taxable_income', capMonthly: null },
          { code: 'REGISTERED_PENSION_AND_NSSF', treatment: 'deduct_from_taxable_income', capMonthly: 30000 },
          { code: 'POST_RETIREMENT_MEDICAL_FUND', treatment: 'deduct_from_taxable_income', capMonthly: 15000 },
          { code: 'MORTGAGE_INTEREST', treatment: 'deduct_from_taxable_income', capMonthly: 30000 }
        ] }
      },
      {
        code: 'INSURANCE_RELIEF',
        label: 'Insurance relief',
        category: 'tax_relief',
        method: 'percentage_of_qualifying_premiums',
        from: '2023-07-01',
        source: 'Kenya Revenue Authority - PAYE',
        url: 'https://www.kra.go.ke/individual/filing-paying/types-of-taxes/paye',
        config: { rate: 0.15, maximumMonthly: 5000, maximumAnnual: 60000, eligibility: 'qualifying_life_health_or_education_policy' }
      }
    ];

    for (const rule of rules) {
      await q.query(`
        INSERT INTO statutory_rules(rule_set_id,code,label,category,calculation_method,configuration,effective_from,source_title,source_url,verified_on,notes)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,'2026-11-16',$10)
        ON CONFLICT(rule_set_id,code,effective_from) DO NOTHING
      `, [packId,rule.code,rule.label,rule.category,rule.method,JSON.stringify(rule.config),rule.from,rule.source,rule.url,rule.notes ?? null]);
    }

  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE IF EXISTS tenant_statutory_rule_overrides, tenant_statutory_assignments, statutory_rules, statutory_rule_sets CASCADE;
    `);
  }
}
