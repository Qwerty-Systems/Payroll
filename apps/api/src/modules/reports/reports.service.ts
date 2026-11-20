import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantTransactionService } from '../../database/tenant-transaction.service';

@Injectable()
export class ReportsService {
  constructor(private readonly tenantDb: TenantTransactionService) {}

  payrollSummary(tenantId: string, periodId?: string) {
    return this.tenantDb.run(tenantId, async m => {
      const params: any[] = [tenantId];
      const filter = periodId ? (params.push(periodId), ' AND p.id=$2') : '';
      return m.query(`
        SELECT p.id AS "periodId",p.code AS "periodCode",p.name AS "periodName",
          p.start_date AS "startDate",p.end_date AS "endDate",p.status AS "periodStatus",
          r.id AS "runId",r.run_number AS "runNumber",r.status AS "runStatus",
          r.calculated_at AS "calculatedAt",r.finalized_at AS "finalizedAt",
          COALESCE(r.totals,'{}'::jsonb) AS totals,
          COALESCE(i.worker_count,0)::int AS "workerCount",
          COALESCE(i.total_earnings,0)::numeric AS "totalEarnings",
          COALESCE(i.total_deductions,0)::numeric AS "totalDeductions",
          COALESCE(i.total_employer_contributions,0)::numeric AS "totalEmployerContributions",
          COALESCE(i.total_net_pay,0)::numeric AS "totalNetPay"
        FROM payroll_periods p
        LEFT JOIN payroll_runs r ON r.tenant_id=p.tenant_id AND r.period_id=p.id
        LEFT JOIN LATERAL (
          SELECT count(*) AS worker_count,sum(x.earnings) AS total_earnings,
            sum(x.employee_deductions) AS total_deductions,
            sum(x.employer_contributions) AS total_employer_contributions,
            sum(x.net_pay) AS total_net_pay
          FROM payroll_run_items x WHERE x.tenant_id=r.tenant_id AND x.payroll_run_id=r.id
        ) i ON true
        WHERE p.tenant_id=$1 ${filter}
        ORDER BY p.start_date DESC,r.run_number DESC
      `,params);
    });
  }

  payrollRunDetail(tenantId: string, runId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const runs = await m.query(`
        SELECT r.id,r.status,r.run_number AS "runNumber",r.totals,r.warnings,
          r.calculated_at AS "calculatedAt",r.finalized_at AS "finalizedAt",
          p.code AS "periodCode",p.start_date AS "startDate",p.end_date AS "endDate"
        FROM payroll_runs r JOIN payroll_periods p
          ON p.tenant_id=r.tenant_id AND p.id=r.period_id
        WHERE r.tenant_id=$1 AND r.id=$2
      `,[tenantId,runId]);
      if (!runs.length) throw new NotFoundException('Payroll run not found.');
      const workers = await m.query(`
        SELECT i.worker_id AS "workerId",w.worker_number AS "workerNumber",
          w.first_name AS "firstName",w.last_name AS "lastName",
          i.earnings,i.employee_deductions AS "employeeDeductions",
          i.employer_contributions AS "employerContributions",i.net_pay AS "netPay"
        FROM payroll_run_items i JOIN workers w ON w.tenant_id=i.tenant_id AND w.id=i.worker_id
        WHERE i.tenant_id=$1 AND i.payroll_run_id=$2
        ORDER BY w.last_name,w.first_name
      `,[tenantId,runId]);
      return {run:runs[0],workers};
    });
  }
}
