import { MigrationInterface, QueryRunner } from 'typeorm';

export class CorrectSalariedStatutoryConfig1794830600000 implements MigrationInterface {
  name = 'CorrectSalariedStatutoryConfig1794830600000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE statutory_rules SET configuration = (configuration - 'minimumMonthly') || jsonb_build_object('rate',0.0275,'base','gross_salary_or_wage','contributorType','salaried_employee','minimumMonthly',null), notes = concat_ws(' ',notes,'Salaried employee calculation: 2.75% of gross salary; the KES 300 minimum in regulation 18 applies to non-salaried household contributions, not salaried payroll.') WHERE code='SHIF';
      UPDATE statutory_rules SET configuration = configuration || jsonb_build_object('employeeRate',0.06,'employerRate',0.06,'lowerEarningsLimit',9000,'upperEarningsLimit',108000,'maximumEmployeeContribution',6480,'maximumEmployerContribution',6480,'tierOneEmployeeMaximum',540,'tierTwoEmployeeMaximum',5940) WHERE code='NSSF';
      UPDATE statutory_rules SET configuration = configuration || jsonb_build_object('employeeRate',0.015,'employerRate',0.015,'base','gross_monthly_salary_excluding_non_regular_payments') WHERE code='AHL';
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE statutory_rules SET configuration = configuration - 'contributorType' - 'minimumMonthly' WHERE code='SHIF';`);
  }
}
