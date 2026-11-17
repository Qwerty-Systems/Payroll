import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { calculateKenyaMonthlyPayroll, type StatutoryRule } from './kenya-payroll-calculator';
import { CreatePayrollPeriodDto, CreateWorkerPayComponentDto } from './payroll.dto';
import { calculateContractEarnings } from './contract-earnings';

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
      const workers = await m.query("SELECT w.id AS worker_id,w.worker_number,w.first_name,w.middle_name,w.last_name,w.email,c.id AS contract_id,c.engagement_type,c.pay_basis,c.rate_amount::numeric AS rate_amount,c.currency,c.effective_from,c.effective_to,c.terms,(SELECT count(DISTINCT a.work_date)::int FROM attendance_records a WHERE a.tenant_id=w.tenant_id AND a.worker_id=w.id AND a.status='approved' AND a.work_date BETWEEN GREATEST($2::date,c.effective_from) AND LEAST($3::date,COALESCE(c.effective_to,$3::date))) AS approved_days,(SELECT COALESCE(sum(a.minutes_worked),0)::int FROM attendance_records a WHERE a.tenant_id=w.tenant_id AND a.worker_id=w.id AND a.status='approved' AND a.work_date BETWEEN GREATEST($2::date,c.effective_from) AND LEAST($3::date,COALESCE(c.effective_to,$3::date))) AS approved_minutes,(SELECT COALESCE(sum(o.quantity),0)::numeric FROM worker_output_entries o WHERE o.tenant_id=w.tenant_id AND o.worker_id=w.id AND o.status='approved' AND o.work_date BETWEEN GREATEST($2::date,c.effective_from) AND LEAST($3::date,COALESCE(c.effective_to,$3::date)) AND o.unit_code = ANY(ARRAY(SELECT jsonb_array_elements_text(COALESCE(c.terms->'unitCodes','[]'::jsonb))))) AS approved_units,(SELECT count(*)::int FROM worker_contracts c2 WHERE c2.tenant_id=w.tenant_id AND c2.worker_id=w.id AND c2.effective_from <= $3::date AND (c2.effective_to IS NULL OR c2.effective_to >= $2::date)) AS overlapping_contracts FROM workers w JOIN worker_contracts c ON c.tenant_id=w.tenant_id AND c.worker_id=w.id AND c.effective_from <= $3::date AND (c.effective_to IS NULL OR c.effective_to >= $2::date) WHERE w.tenant_id=$1 AND w.status='active' ORDER BY w.worker_number",[tenantId,run.start_date,run.end_date]);
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
        if (!['permanent','fixed_term','casual','piece_rate','subcontractor','independent_contractor'].includes(worker.engagement_type)) throw new ConflictException('Worker '+worker.worker_number+' has an unsupported engagement classification.');
        const rate = Number(worker.rate_amount);
        const earningsResult = calculateContractEarnings({
          payBasis: worker.pay_basis, rate,
          periodStart: String(run.start_date), periodEnd: String(run.end_date),
          contractStart: String(worker.effective_from),
          contractEnd: worker.effective_to ? String(worker.effective_to) : null,
          approvedDays: Number(worker.approved_days),
          approvedMinutes: Number(worker.approved_minutes),
          approvedUnits: Number(worker.approved_units),
        });
        const baseEarnings = earningsResult.amount;
        const components = await m.query(
          "SELECT id,code,name,component_type,calculation_method,amount::numeric AS amount,taxable FROM worker_pay_components WHERE tenant_id=$1 AND worker_id=$2 AND status='active' AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $4::date) ORDER BY component_type,code",
          [tenantId, worker.worker_id, run.end_date, run.start_date],
        );
        const componentLines = components.map((item:any) => ({
          id:item.id,code:item.code,name:item.name,type:item.component_type,
          calculationMethod:item.calculation_method,rate:Number(item.amount),taxable:Boolean(item.taxable),
          amount:round(item.calculation_method==='percentage_of_base' ? baseEarnings*Number(item.amount)/100 : Number(item.amount)),
        }));
        const allowances = componentLines.filter((x:any)=>x.type==='allowance');
        const deductions = componentLines.filter((x:any)=>x.type==='deduction');
        const benefits = componentLines.filter((x:any)=>x.type==='benefit');
        const allowanceTotal=round(allowances.reduce((sum:number,x:any)=>sum+x.amount,0));
        const taxableAllowance=round(allowances.filter((x:any)=>x.taxable).reduce((sum:number,x:any)=>sum+x.amount,0));
        const nonTaxableAllowance=round(allowances.filter((x:any)=>!x.taxable).reduce((sum:number,x:any)=>sum+x.amount,0));
        const deductionTotal=round(deductions.reduce((sum:number,x:any)=>sum+x.amount,0));
        const benefitTotal=round(benefits.reduce((sum:number,x:any)=>sum+x.amount,0));
        const grossEarnings=round(baseEarnings+allowanceTotal);
        const taxableGross=round(baseEarnings+taxableAllowance);
        const contractorNeedsReview=['subcontractor','independent_contractor'].includes(worker.engagement_type);
        // Only explicitly taxable allowances are included in the statutory calculation base.
        // The applicable treatment remains controlled by the published, compliance-approved ruleset.
        const statutory=contractorNeedsReview
          ? {gross:taxableGross,taxableIncome:0,paye:0,shif:0,nssf:0,housingLevy:0,employeeStatutoryDeductions:0,employerNssf:0,employerHousingLevy:0,nita:0,employerContributions:0,netBeforeOtherDeductions:grossEarnings,warnings:['CONTRACTOR_TAX_TREATMENT_REQUIRES_REVIEW'],lines:[]}
          : calculateKenyaMonthlyPayroll(taxableGross,rules);
        const employeeDeductions=round(Number(statutory.employeeStatutoryDeductions)+deductionTotal);
        const netPay=round(grossEarnings-employeeDeductions);
        const employerContributions=round(Number(statutory.employerContributions)+benefitTotal);
        const classificationWarnings=contractorNeedsReview?['WORKER_CLASSIFICATION_REQUIRES_STATUTORY_REVIEW']:[];
        const componentWarnings=netPay<0?['NET_PAY_NEGATIVE']:[];
        warnings.push(...earningsResult.warnings.map(w=>worker.worker_number+':'+w));
        warnings.push(...classificationWarnings.map(w=>worker.worker_number+':'+w));
        warnings.push(...componentWarnings.map(w=>worker.worker_number+':'+w));
        warnings.push(...statutory.warnings.map((w:string)=>worker.worker_number+':'+w));
        const snapshot={
          worker:{id:worker.worker_id,workerNumber:worker.worker_number,firstName:worker.first_name,middleName:worker.middle_name,lastName:worker.last_name,email:worker.email},
          contract:{id:worker.contract_id,engagementType:worker.engagement_type,payBasis:worker.pay_basis,rate,currency:worker.currency},
          period:{startDate:run.start_date,endDate:run.end_date},
          attendance:{approvedDays:Number(worker.approved_days),approvedMinutes:Number(worker.approved_minutes)},
          earnings:{quantity:earningsResult.quantity,unit:earningsResult.unit,rate,baseAmount:baseEarnings,allowances:allowanceTotal,taxableAllowances:taxableAllowance,nonTaxableAllowances:nonTaxableAllowance,total:grossEarnings},
          components:componentLines,
          deductions:{statutory:Number(statutory.employeeStatutoryDeductions),other:deductionTotal,total:employeeDeductions},
          benefits:{employerBenefits:benefitTotal},
          classificationWarnings,componentWarnings,statutory,netPay,employerContributions,engineVersion:ENGINE_VERSION
        };
        itemSnapshots.push({workerId:worker.worker_id,earnings:grossEarnings,employeeDeductions,employerContributions,netPay,snapshot});
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
      const rows=await m.query('SELECT r.*,p.code AS period_code,s.compliance_approved_at FROM payroll_runs r JOIN payroll_periods p ON p.tenant_id=r.tenant_id AND p.id=r.period_id LEFT JOIN statutory_rule_sets s ON s.id=r.ruleset_id WHERE r.tenant_id=$1 AND r.id=$2 FOR UPDATE OF r',[tenantId,runId]);
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
        const blocking=warnings.filter((w:string)=>w==='STATUTORY_RULESET_REQUIRES_PLATFORM_COMPLIANCE_APPROVAL'||w.endsWith(':NET_PAY_NEGATIVE')||w.endsWith(':WORKER_CLASSIFICATION_REQUIRES_STATUTORY_REVIEW')||w.endsWith(':NO_APPROVED_EARNING_UNITS')||w.endsWith(':CONTRACT_NOT_ACTIVE_IN_PAY_PERIOD'));
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

  listPayslips(tenantId: string, runId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const run = await m.query("SELECT status FROM payroll_runs WHERE tenant_id=$1 AND id=$2",[tenantId,runId]);
      if (!run.length) throw new NotFoundException('Payroll run not found.');
      if (run[0].status !== 'finalized') throw new ConflictException('Payslips are issued only after payroll finalization.');
      return m.query('SELECT id,worker_id AS "workerId",payslip_number AS "payslipNumber",snapshot,issued_at AS "issuedAt" FROM payslips WHERE tenant_id=$1 AND payroll_run_id=$2 ORDER BY payslip_number',[tenantId,runId]);
    });
  }

  getPayslip(tenantId: string, payslipId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const rows = await m.query('SELECT id,worker_id AS "workerId",payslip_number AS "payslipNumber",snapshot,issued_at AS "issuedAt" FROM payslips WHERE tenant_id=$1 AND id=$2',[tenantId,payslipId]);
      if (!rows.length) throw new NotFoundException('Payslip not found.');
      return rows[0];
    });
  }

  createPaymentBatch(tenantId: string, actorId: string, runId: string, paymentMethod: 'bank_transfer'|'mpesa'|'manual') {
    return this.tenantDb.run(tenantId, async m => {
      const runs = await m.query("SELECT id,status FROM payroll_runs WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[tenantId,runId]);
      if (!runs.length) throw new NotFoundException('Payroll run not found.');
      if (runs[0].status !== 'finalized') throw new ConflictException('Payment batches can only be created for finalized payroll runs.');
      // The payroll_runs row is locked above. Checking active batches while holding
      // that lock serializes concurrent requests and prevents duplicate payout batches.
      const existingBatches = await m.query(
        "SELECT id,status FROM payroll_payment_batches WHERE tenant_id=$1 AND payroll_run_id=$2 AND status NOT IN ('cancelled','failed') LIMIT 1",
        [tenantId,runId],
      );
      if (existingBatches.length) {
        throw new ConflictException('An active payment batch already exists for this payroll run.');
      }
      const settings = await m.query('SELECT currency FROM tenant_payroll_settings WHERE tenant_id=$1',[tenantId]);
      const currency = settings[0]?.currency ?? 'KES';
      const items = await m.query('SELECT worker_id,net_pay FROM payroll_run_items WHERE tenant_id=$1 AND payroll_run_id=$2 ORDER BY worker_id',[tenantId,runId]);
      const total = round(items.reduce((sum:any,item:any)=>sum+Number(item.net_pay),0));
      const batches = await m.query("INSERT INTO payroll_payment_batches (tenant_id,payroll_run_id,status,payment_method,currency,total_amount,created_by) VALUES ($1,$2,'draft',$3,$4,$5,$6) RETURNING id,status,payment_method AS \"paymentMethod\",currency,total_amount AS \"totalAmount\",created_at AS \"createdAt\"",[tenantId,runId,paymentMethod,currency,total,actorId]);
      for (const item of items) await m.query("INSERT INTO payroll_payment_batch_items (tenant_id,batch_id,worker_id,amount) VALUES ($1,$2,$3,$4)",[tenantId,batches[0].id,item.worker_id,item.net_pay]);
      await m.query("INSERT INTO audit_events (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,'payroll.payment_batch.created','payment_batch',$3,$4::jsonb)",[tenantId,actorId,batches[0].id,JSON.stringify({runId,itemCount:items.length,total,currency,paymentMethod})]);
      return batches[0];
    });
  }

  approvePaymentBatch(tenantId: string, actorId: string, batchId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const rows=await m.query('SELECT id,status,created_by FROM payroll_payment_batches WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,batchId]);
      if(!rows.length) throw new NotFoundException('Payment batch not found.');
      if(rows[0].status!=='draft') throw new ConflictException('Only a draft payment batch can be approved.');
      if(rows[0].created_by===actorId) throw new BadRequestException('Separation of duties: the payment batch creator cannot approve it.');
      const updated=await m.query("UPDATE payroll_payment_batches SET status='approved',approved_by=$3,approved_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status,approved_at AS \"approvedAt\"",[tenantId,batchId,actorId]);
      await m.query("INSERT INTO audit_events (tenant_id,actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,'payroll.payment_batch.approved','payment_batch',$3)",[tenantId,actorId,batchId]);
      return updated[0];
    });
  }

  confirmPayment(tenantId: string, actorId: string, batchId: string, itemId: string, providerReference: string) {
    return this.tenantDb.run(tenantId, async m => {
      const rows=await m.query("SELECT i.id,i.status,b.status AS batch_status FROM payroll_payment_batch_items i JOIN payroll_payment_batches b ON b.tenant_id=i.tenant_id AND b.id=i.batch_id WHERE i.tenant_id=$1 AND b.id=$2 AND i.id=$3 FOR UPDATE",[tenantId,batchId,itemId]);
      if(!rows.length) throw new NotFoundException('Payment batch item not found.');
      if(rows[0].batch_status!=='approved' && rows[0].batch_status!=='partially_paid') throw new ConflictException('Only an approved payment batch can accept payment confirmations.');
      if(rows[0].status==='paid') throw new ConflictException('This payment item has already been confirmed as paid.');
      if(!providerReference.trim()) throw new BadRequestException('A bank or payment provider reference is required.');
      const updated=await m.query("UPDATE payroll_payment_batch_items SET status='paid',provider_reference=$4,paid_at=now() WHERE tenant_id=$1 AND batch_id=$2 AND id=$3 RETURNING id,status,provider_reference AS \"providerReference\",paid_at AS \"paidAt\"",[tenantId,batchId,itemId,providerReference.trim()]);
      const counts=await m.query("SELECT count(*) FILTER (WHERE status='paid')::int AS paid,count(*)::int AS total FROM payroll_payment_batch_items WHERE tenant_id=$1 AND batch_id=$2",[tenantId,batchId]);
      const batchStatus=counts[0].paid===counts[0].total?'paid':'partially_paid';
      await m.query('UPDATE payroll_payment_batches SET status=$3 WHERE tenant_id=$1 AND id=$2',[tenantId,batchId,batchStatus]);
      await m.query("INSERT INTO audit_events (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,'payroll.payment.confirmed','payment_batch_item',$3,$4::jsonb)",[tenantId,actorId,itemId,JSON.stringify({batchId,providerReference:providerReference.trim()})]);
      return {...updated[0],batchStatus};
    });
  }


  listWorkerPayComponents(tenantId:string,workerId:string){
    return this.tenantDb.run(tenantId,async m=>{const worker=await m.query('SELECT id FROM workers WHERE tenant_id=$1 AND id=$2',[tenantId,workerId]);if(!worker.length)throw new NotFoundException('Worker not found.');return m.query('SELECT id,code,name,component_type AS "componentType",calculation_method AS "calculationMethod",amount,taxable,effective_from AS "effectiveFrom",effective_to AS "effectiveTo",status FROM worker_pay_components WHERE tenant_id=$1 AND worker_id=$2 ORDER BY effective_from DESC,code',[tenantId,workerId]);});
  }
  createWorkerPayComponent(tenantId:string,actorId:string,workerId:string,dto:CreateWorkerPayComponentDto){
    if(dto.effectiveTo&&dto.effectiveTo<dto.effectiveFrom)throw new BadRequestException('Component end date must not precede its start date.');
    if(dto.componentType!=='allowance'&&dto.taxable)throw new BadRequestException('Only allowance components can be marked taxable.');
    return this.tenantDb.run(tenantId,async m=>{
      const workers=await m.query('SELECT id,status FROM workers WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,workerId]);if(!workers.length)throw new NotFoundException('Worker not found.');
      const overlap=await m.query("SELECT id FROM worker_pay_components WHERE tenant_id=$1 AND worker_id=$2 AND code=$3 AND status='active' AND effective_from<=COALESCE($5::date,'infinity'::date) AND COALESCE(effective_to,'infinity'::date)>=$4::date LIMIT 1",[tenantId,workerId,dto.code.trim().toUpperCase(),dto.effectiveFrom,dto.effectiveTo??null]);if(overlap.length)throw new ConflictException('An active component with this code already overlaps the requested dates.');
      const rows=await m.query('INSERT INTO worker_pay_components(tenant_id,worker_id,code,name,component_type,calculation_method,amount,taxable,effective_from,effective_to,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,worker_id AS "workerId",code,name,component_type AS "componentType",calculation_method AS "calculationMethod",amount,taxable,effective_from AS "effectiveFrom",effective_to AS "effectiveTo",status',[tenantId,workerId,dto.code.trim().toUpperCase(),dto.name.trim(),dto.componentType,dto.calculationMethod,dto.amount,dto.componentType==='allowance'&&dto.taxable===true,dto.effectiveFrom,dto.effectiveTo??null,actorId]);
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'payroll.component.created','worker_pay_component',$3,$4::jsonb)",[tenantId,actorId,rows[0].id,JSON.stringify({workerId,code:rows[0].code,type:dto.componentType,calculationMethod:dto.calculationMethod})]);return rows[0];
    });
  }
  setWorkerPayComponentStatus(tenantId:string,actorId:string,id:string,status:'active'|'inactive'){
    return this.tenantDb.run(tenantId,async m=>{const rows=await m.query('UPDATE worker_pay_components SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,worker_id AS "workerId",code,status',[tenantId,id,status]);if(!rows.length)throw new NotFoundException('Pay component not found.');await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'payroll.component.status_changed','worker_pay_component',$3,$4::jsonb)",[tenantId,actorId,id,JSON.stringify({status})]);return rows[0];});
  }



  listComplianceAssignments(tenantId:string){
    return this.tenantDb.run(tenantId,m=>m.query(`SELECT a.id,a.rule_set_id AS "ruleSetId",s.name AS "ruleSetName",s.version,a.effective_from AS "effectiveFrom",a.effective_to AS "effectiveTo",a.review_status AS "reviewStatus",a.reviewed_by AS "reviewedBy",a.reviewed_at AS "reviewedAt",a.review_notes AS "reviewNotes" FROM tenant_statutory_assignments a JOIN statutory_rule_sets s ON s.id=a.rule_set_id WHERE a.tenant_id=$1 ORDER BY a.effective_from DESC`,[tenantId]));
  }
  reviewComplianceAssignment(tenantId:string,actorId:string,id:string,action:'approve'|'reject',reason:string){
    if(!reason?.trim()||reason.trim().length<5)throw new BadRequestException('A meaningful compliance review reason is required.');
    return this.tenantDb.run(tenantId,async m=>{const rows=await m.query('SELECT id,review_status,assigned_by FROM tenant_statutory_assignments WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);if(!rows.length)throw new NotFoundException('Statutory ruleset assignment not found.');if(rows[0].review_status!=='pending')throw new ConflictException('This statutory assignment has already been reviewed.');if(rows[0].assigned_by===actorId)throw new BadRequestException('The assignment creator cannot review their own statutory assignment.');const status=action==='approve'?'approved':'rejected';const updated=await m.query('UPDATE tenant_statutory_assignments SET review_status=$3,reviewed_by=$4,reviewed_at=now(),review_notes=$5 WHERE tenant_id=$1 AND id=$2 RETURNING id,review_status AS "reviewStatus",reviewed_at AS "reviewedAt",review_notes AS "reviewNotes"',[tenantId,id,status,actorId,reason.trim()]);await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,\'statutory_assignment\',$4,$5::jsonb)',[tenantId,actorId,'compliance.ruleset.'+action,id,JSON.stringify({reason:reason.trim()})]);return updated[0];});
  }
  listStatutoryFilings(tenantId:string){
    return this.tenantDb.run(tenantId,m=>m.query('SELECT id,payroll_run_id AS "payrollRunId",filing_type AS "filingType",period_start AS "periodStart",period_end AS "periodEnd",amount_due AS "amountDue",payload_snapshot AS "payloadSnapshot",status,review_notes AS "reviewNotes",external_reference AS "externalReference",submitted_at AS "submittedAt",created_at AS "createdAt" FROM statutory_filing_records WHERE tenant_id=$1 ORDER BY period_end DESC,filing_type',[tenantId]));
  }
  generateStatutoryFilings(tenantId:string,actorId:string,runId:string){
    return this.tenantDb.run(tenantId,async m=>{
      const runs=await m.query("SELECT r.id,r.status,p.start_date,p.end_date FROM payroll_runs r JOIN payroll_periods p ON p.tenant_id=r.tenant_id AND p.id=r.period_id WHERE r.tenant_id=$1 AND r.id=$2 FOR UPDATE OF r",[tenantId,runId]);if(!runs.length)throw new NotFoundException('Payroll run not found.');if(runs[0].status!=='finalized')throw new ConflictException('Statutory filing schedules can only be generated from a finalized payroll run.');
      const items=await m.query('SELECT calculation_snapshot FROM payroll_run_items WHERE tenant_id=$1 AND payroll_run_id=$2',[tenantId,runId]);
      const totals={PAYE:{employee:0,employer:0},SHIF:{employee:0,employer:0},NSSF:{employee:0,employer:0},AHL:{employee:0,employer:0},NITA:{employee:0,employer:0}};
      for(const row of items){const snap=typeof row.calculation_snapshot==='string'?JSON.parse(row.calculation_snapshot):row.calculation_snapshot;const st=snap?.statutory??{};totals.PAYE.employee+=Number(st.paye??0);totals.SHIF.employee+=Number(st.shif??0);totals.NSSF.employee+=Number(st.nssf??0);totals.NSSF.employer+=Number(st.employerNssf??0);totals.AHL.employee+=Number(st.housingLevy??0);totals.AHL.employer+=Number(st.employerHousingLevy??0);totals.NITA.employer+=Number(st.nita??0);}
      const out=[];
      for(const filingType of Object.keys(totals) as Array<keyof typeof totals>){const payload={filingType,periodStart:runs[0].start_date,periodEnd:runs[0].end_date,employeeAmount:round(totals[filingType].employee),employerAmount:round(totals[filingType].employer),amountDue:round(totals[filingType].employee+totals[filingType].employer),workerCount:items.length,source:'finalized_payroll_snapshot'};const rows=await m.query("INSERT INTO statutory_filing_records(tenant_id,payroll_run_id,filing_type,period_start,period_end,amount_due,payload_snapshot,created_by) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT(tenant_id,payroll_run_id,filing_type) DO NOTHING RETURNING id,filing_type AS \"filingType\",amount_due AS \"amountDue\",status",[tenantId,runId,filingType,runs[0].start_date,runs[0].end_date,payload.amountDue,JSON.stringify(payload),actorId]);if(rows.length)out.push(rows[0]);else{const existing=await m.query('SELECT id,filing_type AS "filingType",amount_due AS "amountDue",status FROM statutory_filing_records WHERE tenant_id=$1 AND payroll_run_id=$2 AND filing_type=$3',[tenantId,runId,filingType]);out.push(existing[0]);}}
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'compliance.filings.generated','payroll_run',$3,$4::jsonb)",[tenantId,actorId,runId,JSON.stringify({filingCount:out.length,filingTypes:Object.keys(totals)})]);return out;
    });
  }
  reviewStatutoryFiling(tenantId:string,actorId:string,id:string,action:'approve'|'reject',reason:string){
    if(!reason?.trim()||reason.trim().length<5)throw new BadRequestException('A meaningful filing review reason is required.');
    return this.tenantDb.run(tenantId,async m=>{const rows=await m.query('SELECT id,status,created_by FROM statutory_filing_records WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);if(!rows.length)throw new NotFoundException('Statutory filing record not found.');if(rows[0].status!=='draft')throw new ConflictException('Only draft statutory filings can be reviewed.');if(rows[0].created_by===actorId)throw new BadRequestException('The filing preparer cannot review their own filing.');const status=action==='approve'?'reviewed':'rejected';const updated=await m.query('UPDATE statutory_filing_records SET status=$3,reviewed_by=$4,review_notes=$5 WHERE tenant_id=$1 AND id=$2 RETURNING id,status,reviewed_by AS "reviewedBy",review_notes AS "reviewNotes"',[tenantId,id,status,actorId,reason.trim()]);await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,\'statutory_filing\',$4,$5::jsonb)',[tenantId,actorId,'compliance.filing.'+action,id,JSON.stringify({reason:reason.trim()})]);return updated[0];});
  }
  markStatutoryFilingSubmitted(tenantId:string,actorId:string,id:string,reference:string){
    if(!reference?.trim()||reference.trim().length<3)throw new BadRequestException('A tax authority or payment reference is required.');
    return this.tenantDb.run(tenantId,async m=>{const rows=await m.query("UPDATE statutory_filing_records SET status='submitted',external_reference=$3,submitted_at=now() WHERE tenant_id=$1 AND id=$2 AND status='reviewed' RETURNING id,status,external_reference AS \"externalReference\",submitted_at AS \"submittedAt\"",[tenantId,id,reference.trim()]);if(!rows.length)throw new ConflictException('Only independently reviewed statutory filings can be marked submitted.');await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'compliance.filing.marked_submitted','statutory_filing',$3,$4::jsonb)",[tenantId,actorId,id,JSON.stringify({externalReference:reference.trim()})]);return rows[0];});
  }


}
