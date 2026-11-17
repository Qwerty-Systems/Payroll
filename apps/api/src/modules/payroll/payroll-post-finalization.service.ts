import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantTransactionService } from '../../database/tenant-transaction.service';

type CorrectionLine = {
  workerId: string;
  code: string;
  description: string;
  earningsDelta?: number;
  employeeDeductionDelta?: number;
  employerContributionDelta?: number;
  netPayDelta?: number;
};

@Injectable()
export class PayrollPostFinalizationService {
  constructor(private readonly tenantDb: TenantTransactionService) {}

  async listCorrections(tenantId: string, runId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const exists = await m.query('SELECT id FROM payroll_runs WHERE tenant_id=$1 AND id=$2 AND status=\'finalized\'', [tenantId, runId]);
      if (!exists.length) throw new NotFoundException('Finalized payroll run not found.');
      return m.query(`
        SELECT id,correction_number AS "correctionNumber",correction_type AS "correctionType",
          status,reason,created_at AS "createdAt",applied_at AS "appliedAt"
        FROM payroll_corrections WHERE tenant_id=$1 AND original_run_id=$2
        ORDER BY correction_number DESC
      `, [tenantId, runId]);
    });
  }

  async createCorrection(tenantId: string, actorId: string, runId: string, type: 'adjustment'|'reversal', reason: string, lines: CorrectionLine[]) {
    if (!reason?.trim() || reason.trim().length < 8) throw new BadRequestException('Provide a correction reason of at least 8 characters.');
    return this.tenantDb.run(tenantId, async m => {
      const runs = await m.query(`
        SELECT id,status,period_id,run_number,totals FROM payroll_runs
        WHERE tenant_id=$1 AND id=$2 FOR UPDATE
      `, [tenantId, runId]);
      if (!runs.length) throw new NotFoundException('Payroll run not found.');
      if (runs[0].status !== 'finalized') throw new ConflictException('Corrections can only reference finalized payroll runs.');
      const existing = await m.query('SELECT id,correction_type,status FROM payroll_corrections WHERE tenant_id=$1 AND original_run_id=$2 AND correction_type=\'reversal\' AND status IN (\'submitted\',\'approved\',\'applied\')', [tenantId,runId]);
      if (type === 'reversal' && existing.length) throw new ConflictException('A reversal has already been submitted or applied for this payroll run.');
      let correctionLines = lines;
      if (type === 'reversal') {
        if (lines.length) throw new BadRequestException('A full reversal calculates its own lines; do not supply adjustment lines.');
        const items = await m.query(`
          SELECT worker_id,earnings,employee_deductions,employer_contributions,net_pay
          FROM payroll_run_items WHERE tenant_id=$1 AND payroll_run_id=$2
        `, [tenantId,runId]);
        correctionLines = items.map((item:any) => ({
          workerId:item.worker_id,code:'FULL_PAYROLL_REVERSAL',description:'Reversal of finalized payroll run',
          earningsDelta:-Number(item.earnings),employeeDeductionDelta:-Number(item.employee_deductions),
          employerContributionDelta:-Number(item.employer_contributions),netPayDelta:-Number(item.net_pay),
        }));
      }
      if (!correctionLines.length) throw new BadRequestException('At least one correction line is required.');
      if (type === 'adjustment' && correctionLines.some(x => Math.round(((x.earningsDelta??0)-(x.employeeDeductionDelta??0)-(x.netPayDelta??0))*100)/100 !== 0)) {
        throw new BadRequestException('Each adjustment line must balance: net pay change equals earnings change minus employee deduction change.');
      }
      if (type === 'adjustment' && correctionLines.some(x => !x.workerId || !x.code?.trim() || !x.description?.trim())) {
        throw new BadRequestException('Each adjustment line requires a worker, code and description.');
      }
      const next = await m.query('SELECT COALESCE(MAX(correction_number),0)+1 AS n FROM payroll_corrections WHERE tenant_id=$1 AND original_run_id=$2', [tenantId,runId]);
      const created = await m.query(`
        INSERT INTO payroll_corrections
          (tenant_id,original_run_id,correction_number,correction_type,status,reason,created_by)
        VALUES ($1,$2,$3,$4,'draft',$5,$6) RETURNING id,correction_number AS "correctionNumber",status
      `, [tenantId,runId,next[0].n,type,reason.trim(),actorId]);
      for (const line of correctionLines) {
        const deltas = [line.earningsDelta??0,line.employeeDeductionDelta??0,line.employerContributionDelta??0,line.netPayDelta??0];
        if (!deltas.every(Number.isFinite)) throw new BadRequestException('Correction amounts must be finite numbers.');
        await m.query(`
          INSERT INTO payroll_correction_items
            (tenant_id,correction_id,worker_id,code,description,earnings_delta,employee_deduction_delta,employer_contribution_delta,net_pay_delta)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `, [tenantId,created[0].id,line.workerId,line.code.trim(),line.description.trim(),...deltas]);
      }
      await m.query(`
        INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
        VALUES($1,$2,'payroll.correction.created','payroll_correction',$3,$4::jsonb)
      `, [tenantId,actorId,created[0].id,JSON.stringify({runId,type,reason:reason.trim(),lineCount:correctionLines.length})]);
      return created[0];
    });
  }

  async transitionCorrection(tenantId: string, actorId: string, correctionId: string, action: 'submit'|'approve'|'apply'|'reject', reason?: string) {
    return this.tenantDb.run(tenantId, async m => {
      const rows = await m.query(`
        SELECT c.*,r.status AS run_status FROM payroll_corrections c
        JOIN payroll_runs r ON r.tenant_id=c.tenant_id AND r.id=c.original_run_id
        WHERE c.tenant_id=$1 AND c.id=$2 FOR UPDATE OF c
      `, [tenantId,correctionId]);
      if (!rows.length) throw new NotFoundException('Payroll correction not found.');
      const c = rows[0];
      let status: string;
      if (action === 'submit') {
        if (c.status !== 'draft') throw new ConflictException('Only draft corrections can be submitted.');
        await m.query('UPDATE payroll_corrections SET status=\'submitted\',submitted_by=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,correctionId,actorId]);
        status = 'submitted';
      } else if (action === 'approve') {
        if (c.status !== 'submitted') throw new ConflictException('Only submitted corrections can be approved.');
        if (c.created_by === actorId || c.submitted_by === actorId) throw new ConflictException('Separation of duties: the creator or submitter cannot approve this correction.');
        await m.query('UPDATE payroll_corrections SET status=\'approved\',approved_by=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,correctionId,actorId]);
        status = 'approved';
      } else if (action === 'reject') {
        if (c.status !== 'submitted') throw new ConflictException('Only submitted corrections can be rejected.');
        if (c.created_by === actorId || c.submitted_by === actorId) throw new ConflictException('Separation of duties: the creator or submitter cannot reject this correction.');
        if (!reason?.trim() || reason.trim().length < 5) throw new BadRequestException('A rejection reason is required.');
        await m.query('UPDATE payroll_corrections SET status=\'rejected\',reason=reason || E\'\\nRejected: \' || $3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,correctionId,reason.trim()]);
        status = 'rejected';
      } else {
        if (c.status !== 'approved') throw new ConflictException('Only approved corrections can be applied.');
        if (c.run_status !== 'finalized') throw new ConflictException('The source payroll must remain finalized.');
        const lines = await m.query('SELECT COALESCE(sum(net_pay_delta),0)::numeric AS net_delta FROM payroll_correction_items WHERE tenant_id=$1 AND correction_id=$2',[tenantId,correctionId]);
        await m.query('UPDATE payroll_corrections SET status=\'applied\',applied_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,correctionId]);
        await m.query(`
          INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
          VALUES($1,$2,'payroll.correction.applied','payroll_correction',$3,$4::jsonb)
        `,[tenantId,actorId,correctionId,JSON.stringify({originalRunId:c.original_run_id,netPayDelta:lines[0].net_delta})]);
        status = 'applied';
      }
      await m.query(`
        INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
        VALUES($1,$2,$3,'payroll_correction',$4,$5::jsonb)
      `,[tenantId,actorId,'payroll.correction.'+action,correctionId,JSON.stringify({from:c.status,to:status,reason:reason??null})]);
      return {id:correctionId,status};
    });
  }

  async getCorrection(tenantId: string, correctionId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const rows = await m.query(`
        SELECT id,original_run_id AS "originalRunId",correction_number AS "correctionNumber",
          correction_type AS "correctionType",status,reason,created_at AS "createdAt",applied_at AS "appliedAt"
        FROM payroll_corrections WHERE tenant_id=$1 AND id=$2
      `,[tenantId,correctionId]);
      if (!rows.length) throw new NotFoundException('Payroll correction not found.');
      const items = await m.query(`
        SELECT i.id,i.worker_id AS "workerId",w.worker_number AS "workerNumber",
          concat_ws(' ',w.first_name,w.last_name) AS "workerName",i.code,i.description,
          i.earnings_delta AS "earningsDelta",i.employee_deduction_delta AS "employeeDeductionDelta",
          i.employer_contribution_delta AS "employerContributionDelta",i.net_pay_delta AS "netPayDelta"
        FROM payroll_correction_items i JOIN workers w ON w.tenant_id=i.tenant_id AND w.id=i.worker_id
        WHERE i.tenant_id=$1 AND i.correction_id=$2 ORDER BY w.worker_number,i.code
      `,[tenantId,correctionId]);
      return {...rows[0],items};
    });
  }

  async remittanceSchedule(tenantId: string, runId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const runs = await m.query(`
        SELECT r.id,r.status,p.code AS period_code,p.start_date::text AS start_date,p.end_date::text AS end_date
        FROM payroll_runs r JOIN payroll_periods p ON p.tenant_id=r.tenant_id AND p.id=r.period_id
        WHERE r.tenant_id=$1 AND r.id=$2
      `,[tenantId,runId]);
      if (!runs.length) throw new NotFoundException('Payroll run not found.');
      if (runs[0].status !== 'finalized') throw new ConflictException('Remittance schedules are available only for finalized payroll.');
      const items = await m.query('SELECT calculation_snapshot FROM payroll_run_items WHERE tenant_id=$1 AND payroll_run_id=$2',[tenantId,runId]);
      const totals = new Map<string,{employee:number;employer:number;total:number}>();
      for (const item of items) {
        const lines = item.calculation_snapshot?.statutory?.lines ?? [];
        for (const line of lines) {
          const code=String(line.code??'OTHER');
          const current=totals.get(code)??{employee:0,employer:0,total:0};
          const amount=Number(line.amount??0);
          if (line.side==='employer') current.employer+=amount; else current.employee+=amount;
          current.total+=amount; totals.set(code,current);
        }
      }
      return {periodCode:runs[0].period_code,startDate:runs[0].start_date,endDate:runs[0].end_date,currency:'KES',
        items:[...totals.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([code,v])=>({code,employee:v.employee,employer:v.employer,total:v.total}))};
    });
  }

  async generalLedgerExport(tenantId: string, runId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const run = await m.query(`
        SELECT r.id,r.status,r.totals,p.code AS period_code
        FROM payroll_runs r JOIN payroll_periods p ON p.tenant_id=r.tenant_id AND p.id=r.period_id
        WHERE r.tenant_id=$1 AND r.id=$2
      `,[tenantId,runId]);
      if (!run.length) throw new NotFoundException('Payroll run not found.');
      if (run[0].status !== 'finalized') throw new ConflictException('Accounting exports require finalized payroll.');
      const rows = await m.query('SELECT calculation_snapshot FROM payroll_run_items WHERE tenant_id=$1 AND payroll_run_id=$2',[tenantId,runId]);
      let gross=0, employeeDeductions=0, employerContributions=0, netPay=0;
      for (const row of rows) {
        const s=row.calculation_snapshot??{};
        gross+=Number(s.earnings?.grossPay??row.calculation_snapshot?.earnings?.amount??0);
        employeeDeductions+=Number(s.statutory?.employeeStatutoryDeductions??0)+Number(s.otherDeductions?.total??0);
        employerContributions+=Number(s.statutory?.employerContributions??0);
        netPay+=Number(s.netPay??0);
      }
      const journal=[
        {account:'Payroll expense',debit:Number(totals.grossEarnings??gross),credit:0},
        {account:'Employer statutory contributions expense',debit:Math.max(0,employerContributions),credit:Math.max(0,-employerContributions)},
        {account:'Net salaries payable',debit:Math.max(0,-netPay),credit:Math.max(0,netPay)},
        {account:'Employee statutory and other deductions payable',debit:Math.max(0,-employeeDeductions),credit:Math.max(0,employeeDeductions)},
        {account:'Employer statutory contributions payable',debit:Math.max(0,-employerContributions),credit:Math.max(0,employerContributions)},
      ].filter(x=>x.debit!==0||x.credit!==0);
      return {periodCode:run[0].period_code,currency:'KES',journal,totals:{debit:journal.reduce((n,x)=>n+x.debit,0),credit:journal.reduce((n,x)=>n+x.credit,0)}};
    });
  }

  async payslipHtml(tenantId: string, payslipId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const rows = await m.query(`
        SELECT p.payslip_number,p.issued_at,p.snapshot,w.worker_number
        FROM payslips p JOIN workers w ON w.tenant_id=p.tenant_id AND w.id=p.worker_id
        WHERE p.tenant_id=$1 AND p.id=$2
      `,[tenantId,payslipId]);
      if (!rows.length) throw new NotFoundException('Payslip not found.');
      const p=rows[0],s=p.snapshot??{},worker=s.worker??{},period=s.period??{};
      const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
      const money=(v:unknown)=>'KES '+Number(v??0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
      const statutory=Array.isArray(s.statutory?.lines)?s.statutory.lines:[];
      const allowances=Array.isArray(s.allowances?.lines)?s.allowances.lines:[];
      const deductions=Array.isArray(s.otherDeductions?.lines)?s.otherDeductions.lines:[];
      return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.payslip_number)}</title><style>
        body{font:14px Arial,sans-serif;color:#17212b;margin:32px}header{display:flex;justify-content:space-between;border-bottom:2px solid #0a192f;padding-bottom:16px}
        h1{font-size:22px;color:#0a192f}h2{font-size:15px;margin:24px 0 8px}table{width:100%;border-collapse:collapse;margin:8px 0 18px}
        th,td{padding:8px;border-bottom:1px solid #dce3e8;text-align:left}th{background:#f3f6f5}.amount{text-align:right}
        .total{font-size:18px;font-weight:bold;background:#eef6f2;padding:14px;text-align:right}.muted{color:#607080}
        @media print{body{margin:12mm}button{display:none}}
      </style></head><body><header><div><h1>JengaFlow · Payslip</h1><div class="muted">Issued payroll statement</div></div><div><strong>${esc(p.payslip_number)}</strong><br><span class="muted">Issued ${esc(new Date(p.issued_at).toLocaleDateString('en-KE'))}</span></div></header>
      <h2>Employee details</h2><p><strong>${esc([worker.firstName,worker.middleName,worker.lastName].filter(Boolean).join(' ')||p.worker_number)}</strong><br>Employee no: ${esc(worker.workerNumber||p.worker_number)}<br>Period: ${esc(period.startDate)} – ${esc(period.endDate)}</p>
      <h2>Earnings and allowances</h2><table><tr><th>Component</th><th class="amount">Amount</th></tr><tr><td>Basic earnings</td><td class="amount">${money(s.earnings?.amount)}</td></tr>${allowances.map((x:any)=>'<tr><td>'+esc(x.name||x.code||'Allowance')+'</td><td class="amount">'+money(x.amount)+'</td></tr>').join('')}</table>
      <h2>Statutory deductions and employer contributions</h2><table><tr><th>Code</th><th>Side</th><th class="amount">Amount</th></tr>${statutory.map((x:any)=>'<tr><td>'+esc(x.code)+'</td><td>'+esc(x.side)+'</td><td class="amount">'+money(x.amount)+'</td></tr>').join('')}</table>
      <h2>Other deductions</h2><table><tr><th>Component</th><th class="amount">Amount</th></tr>${deductions.map((x:any)=>'<tr><td>'+esc(x.name||x.code||'Deduction')+'</td><td class="amount">'+money(x.amount)+'</td></tr>').join('')}</table>
      <div class="total">Net pay: ${money(s.netPay)}</div><p class="muted">This document is generated from the immutable finalized payroll snapshot.</p><button onclick="window.print()">Print / Save as PDF</button></body></html>`;
    });
  }

  async markPaymentFailed(tenantId:string,actorId:string,batchId:string,itemId:string,reason:string) {
    if(!reason?.trim()||reason.trim().length<5) throw new BadRequestException('A failure reason is required.');
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query(`SELECT i.id,i.status,b.status AS batch_status FROM payroll_payment_batch_items i JOIN payroll_payment_batches b ON b.tenant_id=i.tenant_id AND b.id=i.batch_id WHERE i.tenant_id=$1 AND b.id=$2 AND i.id=$3 FOR UPDATE OF i,b`,[tenantId,batchId,itemId]);
      if(!rows.length) throw new NotFoundException('Payment item not found.');
      if(!['pending','processing'].includes(rows[0].status)) throw new ConflictException('Only pending or processing payments can be marked failed.');
      await m.query("UPDATE payroll_payment_batch_items SET status='failed' WHERE tenant_id=$1 AND batch_id=$2 AND id=$3",[tenantId,batchId,itemId]);
      const counts=await m.query("SELECT count(*) FILTER(WHERE status IN ('pending','processing'))::int AS open,count(*) FILTER(WHERE status='paid')::int AS paid,count(*)::int AS total FROM payroll_payment_batch_items WHERE tenant_id=$1 AND batch_id=$2",[tenantId,batchId]);
      const batchStatus=counts[0].open===0&&counts[0].paid===0?'failed':counts[0].paid>0?'partially_paid':'approved';
      await m.query('UPDATE payroll_payment_batches SET status=$3 WHERE tenant_id=$1 AND id=$2',[tenantId,batchId,batchStatus]);
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'payroll.payment.failed','payment_batch_item',$3,$4::jsonb)",[tenantId,actorId,itemId,JSON.stringify({batchId,reason:reason.trim()})]);
      return {id:itemId,status:'failed',batchStatus};
    });
  }

  async reversePayment(tenantId:string,actorId:string,batchId:string,itemId:string,reason:string) {
    if(!reason?.trim()||reason.trim().length<5) throw new BadRequestException('A reversal reason is required.');
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query(`SELECT i.id,i.status,b.status AS batch_status FROM payroll_payment_batch_items i JOIN payroll_payment_batches b ON b.tenant_id=i.tenant_id AND b.id=i.batch_id WHERE i.tenant_id=$1 AND b.id=$2 AND i.id=$3 FOR UPDATE OF i,b`,[tenantId,batchId,itemId]);
      if(!rows.length) throw new NotFoundException('Payment item not found.');
      if(rows[0].status!=='paid') throw new ConflictException('Only confirmed paid items can be reversed.');
      await m.query("UPDATE payroll_payment_batch_items SET status='reversed' WHERE tenant_id=$1 AND batch_id=$2 AND id=$3",[tenantId,batchId,itemId]);
      await m.query("UPDATE payroll_payment_batches SET status='partially_paid' WHERE tenant_id=$1 AND id=$2",[tenantId,batchId]);
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'payroll.payment.reversed','payment_batch_item',$3,$4::jsonb)",[tenantId,actorId,itemId,JSON.stringify({batchId,reason:reason.trim()})]);
      return {id:itemId,status:'reversed'};
    });
  }
}
