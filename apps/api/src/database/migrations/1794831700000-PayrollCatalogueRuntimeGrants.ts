import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Keep the least-privilege runtime role able to use the tenant payroll
 * catalogue. CI provisions jf_app after migrations and grants the full test
 * schema there; production installations that provision it before migrations
 * receive the required table grants here.
 */
export class PayrollCatalogueRuntimeGrants1794831700000 implements MigrationInterface {
  name = 'PayrollCatalogueRuntimeGrants1794831700000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jengaflow_app') THEN
          GRANT USAGE ON SCHEMA public TO jengaflow_app;
          GRANT SELECT ON statutory_rule_sets, statutory_rules TO jengaflow_app;
          GRANT SELECT, INSERT, UPDATE, DELETE ON
            tenant_statutory_assignments, tenant_statutory_rule_overrides,
            tenant_payroll_settings, tenant_allowance_types, tenant_deduction_types,
            worker_allowance_assignments, worker_deduction_assignments,
            payroll_periods, payroll_runs, payroll_run_items, payslips,
            payroll_payment_batches, payroll_payment_batch_items,
            tenant_branches, tenant_departments, tenant_cost_centres, worker_assignments,
            tenant_invitations, tenant_devices, sync_commands, sync_conflicts,
            worker_output_entries, worker_pay_grades, worker_documents,
            attendance_correction_requests
          TO jengaflow_app;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jf_app') THEN
          GRANT USAGE ON SCHEMA public TO jf_app;
          GRANT SELECT ON statutory_rule_sets, statutory_rules TO jf_app;
          GRANT SELECT, INSERT, UPDATE, DELETE ON
            tenant_statutory_assignments, tenant_statutory_rule_overrides,
            tenant_payroll_settings, tenant_allowance_types, tenant_deduction_types,
            worker_allowance_assignments, worker_deduction_assignments,
            payroll_periods, payroll_runs, payroll_run_items, payslips,
            payroll_payment_batches, payroll_payment_batch_items,
            tenant_branches, tenant_departments, tenant_cost_centres, worker_assignments,
            tenant_invitations, tenant_devices, sync_commands, sync_conflicts,
            worker_output_entries, worker_pay_grades, worker_documents,
            attendance_correction_requests
          TO jf_app;
        END IF;
      END
      $$;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jengaflow_app') THEN
          REVOKE SELECT ON statutory_rule_sets, statutory_rules FROM jengaflow_app;
          REVOKE SELECT, INSERT, UPDATE, DELETE ON
            tenant_statutory_assignments, tenant_statutory_rule_overrides,
            tenant_payroll_settings, tenant_allowance_types, tenant_deduction_types,
            worker_allowance_assignments, worker_deduction_assignments,
            payroll_periods, payroll_runs, payroll_run_items, payslips,
            payroll_payment_batches, payroll_payment_batch_items,
            tenant_branches, tenant_departments, tenant_cost_centres, worker_assignments,
            tenant_invitations, tenant_devices, sync_commands, sync_conflicts,
            worker_output_entries, worker_pay_grades, worker_documents,
            attendance_correction_requests
          FROM jengaflow_app;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jf_app') THEN
          REVOKE SELECT ON statutory_rule_sets, statutory_rules FROM jf_app;
          REVOKE SELECT, INSERT, UPDATE, DELETE ON
            tenant_statutory_assignments, tenant_statutory_rule_overrides,
            tenant_payroll_settings, tenant_allowance_types, tenant_deduction_types,
            worker_allowance_assignments, worker_deduction_assignments,
            payroll_periods, payroll_runs, payroll_run_items, payslips,
            payroll_payment_batches, payroll_payment_batch_items,
            tenant_branches, tenant_departments, tenant_cost_centres, worker_assignments,
            tenant_invitations, tenant_devices, sync_commands, sync_conflicts,
            worker_output_entries, worker_pay_grades, worker_documents,
            attendance_correction_requests
          FROM jf_app;
        END IF;
      END
      $$;
    `);
  }
}
