import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Correct the NITA starter rule to the post-2020 legal framework.
 * The prior seed incorrectly used its verification date as an effective date
 * and described a monthly remittance. KES 600/year is accrued at KES 50/month.
 */
export class CorrectNitaAnnualLevyBaseline1794832000000 implements MigrationInterface {
  name = 'CorrectNitaAnnualLevyBaseline1794832000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE statutory_rules
      SET effective_from = '2020-02-28',
          effective_to = NULL,
          configuration = jsonb_build_object(
            'amount', 50,
            'annualAmount', 600,
            'currency', 'KES',
            'frequency', 'monthly_accrual',
            'remittanceFrequency', 'annual',
            'employeePayrollDeduction', false,
            'due', 'ninth_day_after_financial_year_end'
          ),
          source_title = 'Industrial Training (Training Levy) Order, 2007, as amended in 2020',
          source_url = 'https://new.kenyalaw.org/akn/ke/act/ln/2007/113/eng@2022-12-31/source',
          verified_on = '2026-11-17'
      WHERE code = 'NITA'
        AND effective_from = '2026-11-16'
        AND rule_set_id IN (
          SELECT id FROM statutory_rule_sets
          WHERE country_code = 'KE' AND version = 'KE-2026.11'
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE statutory_rules
      SET effective_from = '2026-11-16',
          effective_to = NULL,
          configuration = jsonb_build_object(
            'amount', 50,
            'currency', 'KES',
            'frequency', 'monthly',
            'employeePayrollDeduction', false,
            'due', 'last_working_day_of_month'
          ),
          source_title = 'NITA Levy Inspectorate',
          source_url = 'https://www.nita.go.ke/our-services/levy-inspectorate.html',
          verified_on = '2026-11-16'
      WHERE code = 'NITA'
        AND effective_from = '2020-02-28'
        AND rule_set_id IN (
          SELECT id FROM statutory_rule_sets
          WHERE country_code = 'KE' AND version = 'KE-2026.11'
        )
    `);
  }
}
