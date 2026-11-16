import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { calculateKenyaMonthlyPayroll, type StatutoryRule } from './kenya-payroll-calculator';
import { CreatePayrollPeriodDto } from './payroll.dto';

const ENGINE_VERSION = 'jengaflow-ke-0.1.0';
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class PayrollService {
  constructor(private readonly tenantDb: TenantTransactionService) {}

  listPeriods(tenantId: string) { return this.tenantDb.run(tenantId, m => m.query('SELECT id,code,name,start_date AS "startDate",end_date AS "endDate",payment_date AS "paymentDate",status FROM payroll_periods WHERE tenant_id=$1 ORDER BY start_date DESC',[tenantId])); }

  createPeriod(tenantId: string, actorId: string, dto: CreatePayrollPeriodDto) {
    if (dto.endDate < dto.startDate) throw new BadRequestException('Payroll period end date must not precede its start date.');
    const start = new Date(dto.startDate + 'T00:00:00Z'); const end = new Date(dto.endDate + 'T00:00:00Z');
    if (start.getUTCFullYear() !== end.getUTCFullYear() || start.getUTCMonth() !== end.getUTCMonth()) throw new BadRequestException('A payroll period must remain within one calendar month.');
    return this.tenantDb.run(tenantId, async m => {
      const overlap = await m.query("SELECT id FROM payroll_periods WHERE tenant_id=$1 AND status <> 'closed' AND daterange(start_date,end_date,'[]') && daterange($2::date,$3::date,'[]') LIMIT 1",[tenantId,dto.startDate,dto.endDate]);
      if (overlap.length) throw new ConflictException('This payroll period overlaps an existing open or locked period.');
      const rows = await m.query('INSERT INTO payroll_periods (tenant_id,code,name,start_date,end_date,payment_date,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,code,name,start_date AS "startDate",end_date AS "endDate",payment_date AS "paymentDate",status',[tenantId,dto.code.trim(),dto.name.trim(),dto.startDate,dto.endDate,dto.paymentDate ?? null,actorId]);
      await m.query("INSERT INTO audit_events (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,'payroll.period.created','payroll_period',$3,$4::jsonb)",[tenantId,actorId,rows[0].id,JSON.stringify({code:dto.code,startDate:dto.startDate,endDate:dto.endDate})]);
      return rows[0];
    });
  }

  createRun(tenantId: string, actorId: string, periodId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const periods = await m.query("SELECT id,code,status,start_date,end_date FROM payroll_periods WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[tenantId,periodId]);
      if (!periods.length) throw new NotFoundException('Payroll period not found.');
      if (periods[0].status !== 'open') throw new ConflictException('Only an open payroll period can receive a new run.');
      const assignments = await m.query("SELECT a.rule_set_id FROM tenant_statutory_assignments a JOIN statutory_rule_sets s ON s.id=a.rule_set_id WHERE a.tenant_id=$1 AND a.effective_from <= $2::date AND (a.effective_to IS NULL OR a.effective_to >= $3::date) AND s.status='published' ORDER BY a.effective_from DESC LIMIT 1",[tenantId,periods[0].end_date,periods[0].start_date]);
      if (!assignments.length) throw new ConflictException('No published Kenya statutory ruleset is assigned for this payroll period.');
      const next = await m.query('SELECT COALESCE(MAX(run_number),0)+1 AS run_number FROM payroll_runs WHERE tenant_id=$1 AND period_id=$2',[tenantId,periodId]);
      const rows = await m.query("INSERT INTO payroll_runs (tenant_id,period_id,run_number,status,engine_version,ruleset_id,created_by) VALUES ($1,$2,$3,'draft',$4,$5,$6) RETURNING id,period_id AS \"periodId\",run_number AS \"runNumber\",status,engine_version AS \"engineVersion\",ruleset_id AS \"rulesetId\",created_at AS \"createdAt\"",[tenantId,periodId,next[0].run_number,ENGINE_VERSION,assignments[0].rule_set_id,actorId]);
      await m.query("INSERT INTO audit_events (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,'payroll.run.created','payroll_run',$3,$4::jsonb)",[tenantId,actorId,rows[0].id,JSON.stringify({periodId,runNumber:next[0].run_number})]);
      return rows[0];
    });
  }

  calculateRun(tenantId: string, actorId: string, runId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const runs = await m.query("SELECT r.id,r.status,r.period_id,r.ruleset_id,r.created_by,p.start_date,p.end_date FROM payroll_runs r JOIN payroll_periods p ON p.tenant_id=r.tenant_id AND p.id=r.period_id WHERE r.tenant_id=$1 AND r.id=$2 FOR UPDATE",[tenantId,runId]);
      if (!runs.length) throw new NotFoundException('Payroll run not found.');
      const run = runs[0];
      if (!['draft','rejected'].includes(run.status)) throw new ConflictException('Only a draft or rejected payroll run can be recalculated.');
      const rulesetRows = await m.query('SELECT id,compliance_approved_at FROM statutory_rule_sets WHERE id=$1',[run.ruleset_id]);
      if (!rulesetRows.length) throw new ConflictException('The payroll run statutory ruleset is missing.');
      const rawRules = await m.query('SELECT code,calculation_method,configuration FROM statutory_rules WHERE rule_set_id=$1 AND effective_from <= $2::date AND (effective_to IS NULL OR effective_to >= $3::date)',[run.ruleset_id,run.end_date,run.start_date]);
      const rules = rawRules.map((r: any) => ({ code:r.code, calculation_method:r.calculation_method, configuration:r.configuration })) as StatutoryRule[];
      const workers = await m.query("SELECT w.id AS worker_id,w.worker_number,w.first_name,w.middle_name,w.last_name,w.email,c.id AS contract_id,c.engagement_type,c.pay_basis,c.rate_amount::numeric AS rate_amount,c.currency,c.effective_from,c.effective_to,(SELECT count(DISTINCT a.work_date)::int FROM attendance_records a WHERE a.tenant_id=w.tenant_id AND a.worker_id=w.id AND a.status='approved' AND a.work_date BETWEEN $2::date AND $3::date) AS approved_days,(SELECT COALESCE(sum(a.minutes_worked),0)::int FROM attendance_records a WHERE a.tenant_id=w.tenant_id AND a.worker_id=w.id AND a.status='approved' AND a.work_date BETWEEN $3::date AND $4::date) AS approved_minutes,(SELECT count(*)::int FROM worker_contracts c2 WHERE c2.tenant_id=w.tenant_id AND c2.worker_id=w.id AND c2.effective_from <= $3::date AND (c2.effective_to IS NULL OR c2.effective_to >= $2::date)) AS overlapping_contracts FROM workers w JOIN worker_contracts c ON c.tenant_id=w.tenant_id AND c.worker_id=w.id AND c.effective_from <= $3::date AND (c.effective_to IS NULL OR c.effective_to >= $2::date) WHERE w.tenant_id=$1 AND w.status='active' ORDER BY w.worker_number",[tenantId,run.start_date,run.end_date]);
      if (!workers.length) throw new ConflictException('No active workers with contracts overlap this payroll period.');
      const allowanceRows = await m.query('SELECT count(*)::int AS count FROM worker_allowance_assignments WHERE tenant_id=$1 AND status=\'active\' AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $2::date)',[tenantId,run.start_date,run.end_date]);
      const deductionRows = await m.query('SELECT count(*)::int AS count FROM worker_deduction_assignments WHERE tenant_id=$1 AND status=\'active\' AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $2::date)',[tenantId,run.start_date,run.end_date]);
      const warnings: string[] = [];
      if (!rulesetRows[0].compliance_approved_at) warnings.push('STATUTORY_RULESET_REQUIRES_PLATFORM_COMPLIANCE_APPROVAL');
      if (Number(allowanceRows[0].count) > 0) warnings.push('ALLOWANCE_ASSIGNMENTS_NOT_INCLUDED_IN_THIS_ENGINE_VERSION');
      if (Number(deductionRows[0].count) > 0) warnings.push('NON_STATUTORY_DEDUCTION_ASSIGNMENTS_NOT_INCLUDED_IN_THIS_ENGINE_VERSION');
      const itemSnapshots: any[] = [];
      for (const worker of workers) {
        if (Number(worker.overlapping_contracts) !== 1) throw new ConflictException('Worker '+worker.worker_number+' has overlapping contracts. Resolve contract dates before calculating payroll.');
        if (!['permanent','fixed_term','casual','piece_rate'].includes(worker.engagement_type)) throw new ConflictException('Worker '+worker.worker_number+' has an unsupported engagement classification.');
        let earnings: number;
        const rate = Number(worker.rate_amount);
        if (worker.pay_basis === 'monthly') {
          const days = Math.round((new Date(run.end_date).getTime()-new Date(run.start_date).getTime())/86400000)+1;
          const daysInMonth = new Date(new Date(run.start_date).getUTCFullYear(),new Date(run.start_date).getUTCMonth()+1,0).getDate();
          earnings = round(rate * days / daysInMonth);
        } else if (worker.pay_basis === 'daily') earnings = round(rate * Number(worker.approved_days));
        else if (worker.pay_basis === 'hourly') earnings = round(rate * Number(worker.approved_minutes) / 60);
        else throw new ConflictException('Worker '+worker.worker_number+' uses '+worker.pay_basis+' pay. This pay basis requires a configured and tested earning-unit source before calculation.');
        const statutory = calculateKenyaMonthlyPayroll(earnings,rules);
        const snapshot = { worker:{id:worker.worker_id,workerNumber:worker.worker_number,firstName:worker.first_name,middleName:worker.middle_name,lastName:worker.last_name,email:worker.email},contract:{id:worker.contract_id,engagementType:worker.engagement_type,payBasis:worker.pay_basis,rate,currency:worker.currency},period:{startDate:run.start_date,endDate:run.end_date},attendance:{approvedDays:Number(worker.approved_days),approvedMinutes:Number(worker.approved_minutes)},statutory,netPay:statutory.netBeforeOtherDeductions,engineVersion:ENGINE_VERSION };
        itemSnapshots.push({workerId:worker.worker_id,earnings,employeeDeductions:statutory.employeeStatutoryDeductions,employerContributions:statutory.employerContributions,netPay:statutory.netBeforeOtherDeductions,snapshot});
        warnings.push(...statutory.warnings.map(w => worker.worker_number+':'+w));
      }
      await m.query('DELETE FROM payroll_run_items WHERE tenant_id=$1 AND payroll_run_id=$2',[tenantId,runId]);
      let totalEarnings=0,totalEmployeeDeductions=0,totalEmployerContributions=0,totalNet=0;
      for (const item of itemSnapshots) {
        await m.query('INSERT INTO payroll_run_items (tenant_id,payroll_run_id,worker_id,earnings,employee_deductions,employer_contributions,net_pay,calculation_snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[tenantId,runId,item.workerId,item.earnings,item.employeeDeductions,item.employerContributions,item.netPay,JSON.stringify(item.snapshot)]);
        totalEarnings=round(totalEarnings+item.earnings); totalEmployeeDeductions=round(totalEmployeeDeductions+item.employeeDeductions); totalEmployerContributions=round(totalEmployerContributions+item.employerContributions); totalNet=round(totalNet+item.netPay);
      }
      const totals={workerCount:itemSnapshots.length,grossEarnings:totalEarnings,employeeDeductions:totalEmployeeDeductions,employerContributions:totalEmployerContributions,netPay:totalNet,employerCost:round(totalEarnings+totalEmployerContributions)};
      const inputHash=createHash('sha256').update(JSON.stringify(itemSnapshots)).digest('hex');
      await m.query("UPDATE payroll_runs SET status='calculated',totals=$3::jsonb,warnings=$4::jsonb,input_hash=$5,calculated_at=now(),submitted_by=NULL,approved_by=NULL,finalized_by=NULL,submitted_at=NULL,approved_at=NULL,finalized_at=NULL WHERE tenant_id=$1 AND id=$2",[tenantId,runId,JSON.stringify(totals),JSON.stringify(warnings),inputHash]);
      await m.query("INSERT INTO audit_events (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,'payroll.run.calculated','payroll_run',$3,$4::jsonb)",[tenantId,actorId,runId,JSON.stringify({totals,warnings,inputHash,engineVersion:ENGINE_VERSION})]);
      return {runId,status:'calculated',totals,warnings,inputHash};
    });
  }

  async transitionRun(tenantId: string, actorId: string, runId: string, action: 'submit'|'approve'|'finalize') {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query('SELECT r.*,p.code AS period_code,s.compliance_approved_at FROM payroll_runs r JOIN payroll_periods p ON p.tenant_id=r.tenant_id AND p.id=r.period_id LEFT JOIN statutory_rule_sets s ON s.id=r.ruleset_id WHERE r.tenant_id=$1 AND r.id=$2 FOR UPDATE',[tenantId,runId]);
      if(!rows.length) throw new NotFoundException('Payroll run not found.');
      const run=rows[0];
      if(action==='submit') {
        if(run.status!=='calculated') throw new ConflictException('Only a calculated payroll run can be submitted.');
        await m.query("UPDATE payroll_runs SET status='submitted',submitted_by=$3,submitted_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,runId,actorId]);
      } else if(action==='approve') {
        if(run.status!=='submitted') throw new ConflictException('Only a submitted payroll run can be approved.');
        if(run.created_by===actorId || run.submitted_by===actorId) throw new BadRequestException('Separation of duties: the payroll creator or submitter cannot approve this run.');
        await m.query("UPDATE payroll_runs SET status='approved',approved_by=$3,approved_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,runId,actorId]);
      } else {
        if(run.status!=='approved') throw new ConflictException('Only an approved payroll run can be finalized.');
        if(!run.compliance_approved_at) throw new ConflictException('The statutory ruleset has not received platform compliance approval. Payroll finalization is blocked.');
        const warnings=Array.isArray(run.warnings)?run.warnings:JSON.parse(run.warnings ?? '[]');
        const blocking=warnings.filter((w:string)=>w==='STATUTORY_RULESET_REQUIRES_PLATFORM_COMPLIANCE_APPROVAL'||w==='ALLOWANCE_ASSIGNMENTS_NOT_INCLUDED_IN_THIS_ENGINE_VERSION'||w==='NON_STATUTORY_DEDUCTION_ASSIGNMENTS_NOT_INCLUDED_IN_THIS_ENGINE_VERSION'||w.endsWith(':NET_PAY_NEGATIVE'));
        if(blocking.length) throw new ConflictException({message:'Payroll has unresolved blocking warnings.',warnings:blocking});
        if(run.approved_by===actorId) throw new BadRequestException('Separation of duties: the payroll approver cannot finalize the same run.');
        const items=await m.query('SELECT i.id,i.worker_id,i.calculation_snapshot,w.worker_number FROM payroll_run_items i JOIN workers w ON w.tenant_id=i.tenant_id AND w.id=i.worker_id WHERE i.tenant_id=$1 AND i.payroll_run_id=$2',[tenantId,runId]);
        for(const item of items){
          const number=String(run.period_code)+'-'+String(item.worker_number)+'-'+String(run.run_number);
          await m.query('INSERT INTO payslips (tenant_id,payroll_run_id,payroll_run_item_id,worker_id,payslip_number,snapshot) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',[tenantId,runId,item.id,item.worker_id,number,JSON.stringify(item.calculation_snapshot)]);
        }
        await m.query("UPDATE payroll_runs SET status='finalized',finalized_by=$3,finalized_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,runId,actorId]);
      }
      const newStatus=action==='submit'?'submitted':action==='approve'?'approved':'finalized';
      await m.query('INSERT INTO audit_events (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,\'payroll_run\',$4,$5::jsonb)',[tenantId,actorId,'payroll.run.'+action,runId,JSON.stringify({from:run.status,to:newStatus})]);
      return {id:runId,status:newStatus};
    });
  }

  getRun(tenantId: string, runId: string) { return this.tenantDb.run(tenantId,async m=>{const runs=await m.query('SELECT id,period_id AS "periodId",run_number AS "runNumber",status,engine_version AS "engineVersion",totals,warnings,input_hash AS "inputHash",created_at AS "createdAt",calculated_at AS "calculatedAt",submitted_at AS "submittedAt",approved_at AS "approvedAt",finalized_at AS "finalizedAt" FROM payroll_runs WHERE tenant_id=$1 AND id=$2',[tenantId,runId]);if(!runs.length)throw new NotFoundException('Payroll run not found.');const items=await m.query('SELECT id,worker_id AS "workerId",earnings,employee_deductions AS "employeeDeductions",employer_contributions AS "employerContributions",net_pay AS "netPay",calculation_snapshot AS snapshot FROM payroll_run_items WHERE tenant_id=$1 AND payroll_run_id=$2 ORDER BY created_at',[tenantId,runId]);return {...runs[0],items};}); }
}
