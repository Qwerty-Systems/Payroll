import { BadRequestException,Injectable } from '@nestjs/common';
import { TenantTransactionService } from '../../database/tenant-transaction.service';

const csvCell=(value:unknown):string=>{
 if(value===null||value===undefined)return '""';
 if(typeof value==='number')return Number.isFinite(value)?String(value):'""';
 let s=String(value);
 if(/^[=+@\\-\\t\\r]/.test(s))s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
};
const toCsv=(rows:unknown[][])=>rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
const datePattern=/^\\d{4}-\\d{2}-\\d{2}$/;
@Injectable()
export class ReportsService{
 constructor(private readonly tenantDb:TenantTransactionService){}
 private validateRange(from:string,to:string){if(!datePattern.test(from)||!datePattern.test(to)||from>to)throw new BadRequestException('Report dates must be valid ISO dates and the start must not follow the end.');}
 async dashboard(tenantId:string){
  return this.tenantDb.run(tenantId,async m=>{
   const [workers,attendance,leave,overtime,payroll,invoices,conflicts]=await Promise.all([
    m.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='active')::int AS active FROM workers WHERE tenant_id=$1",[tenantId]),
    m.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='submitted')::int AS pending FROM attendance_records WHERE tenant_id=$1 AND work_date>=date_trunc('month',CURRENT_DATE)::date AND work_date<=CURRENT_DATE",[tenantId]),
    m.query("SELECT count(*)::int AS pending FROM leave_requests WHERE tenant_id=$1 AND status='pending'",[tenantId]),
    m.query("SELECT count(*)::int AS pending FROM overtime_requests WHERE tenant_id=$1 AND status='pending'",[tenantId]),
    m.query("SELECT count(*)::int AS open FROM payroll_runs WHERE tenant_id=$1 AND status NOT IN ('finalized','cancelled')",[tenantId]),
    m.query("SELECT count(*)::int AS outstanding,COALESCE(sum(total_minor-amount_paid_minor),0)::bigint AS balance_minor FROM billing_invoices WHERE tenant_id=$1 AND status IN ('issued','partially_paid','overdue')",[tenantId]),
    m.query("SELECT count(*)::int AS open FROM sync_conflicts WHERE tenant_id=$1 AND state='open'",[tenantId]),
   ]);
   return {generatedAt:new Date().toISOString(),workforce:workers[0],attendanceThisMonth:attendance[0],pendingLeave:leave[0].pending,pendingOvertime:overtime[0].pending,openPayrollRuns:payroll[0].open,outstandingInvoices:invoices[0],openOfflineConflicts:conflicts[0].open};
  });
 }
 async attendanceCsv(tenantId:string,from:string,to:string){
  this.validateRange(from,to);
  const rows=await this.tenantDb.run(tenantId,m=>m.query('SELECT a.work_date,a.worker_id,w.worker_number,w.first_name,w.last_name,p.project_code,p.name AS project_name,s.site_code,s.name AS site_name,a.minutes_worked,a.status,a.source,a.created_at FROM attendance_records a JOIN workers w ON w.tenant_id=a.tenant_id AND w.id=a.worker_id JOIN projects p ON p.tenant_id=a.tenant_id AND p.id=a.project_id LEFT JOIN sites s ON s.tenant_id=a.tenant_id AND s.id=a.site_id WHERE a.tenant_id=$1 AND a.work_date BETWEEN $2::date AND $3::date ORDER BY a.work_date,w.worker_number LIMIT 50000',[tenantId,from,to]));
  return toCsv([['Work date','Worker number','First name','Last name','Project code','Project','Site code','Site','Minutes worked','Status','Source','Created at'],...rows.map(r=>[r.work_date,r.worker_number,r.first_name,r.last_name,r.project_code,r.project_name,r.site_code,r.site_name,Number(r.minutes_worked??0),r.status,r.source,r.created_at])]);
 }
 async payrollCsv(tenantId:string,periodId:string){
  const rows=await this.tenantDb.run(tenantId,async m=>{const runs=await m.query('SELECT id,period_id FROM payroll_runs WHERE tenant_id=$1 AND period_id=$2 ORDER BY created_at DESC LIMIT 1',[tenantId,periodId]);if(!runs.length)throw new BadRequestException('No payroll run exists for this period.');return m.query('SELECT w.worker_number,w.first_name,w.last_name,i.earnings,i.employee_deductions,i.employer_contributions,i.net_pay,i.calculation_snapshot FROM payroll_run_items i JOIN workers w ON w.tenant_id=i.tenant_id AND w.id=i.worker_id WHERE i.tenant_id=$1 AND i.payroll_run_id=$2 ORDER BY w.worker_number',[tenantId,runs[0].id]);});
  return toCsv([['Worker number','First name','Last name','Gross earnings','Employee deductions','Employer contributions','Net pay','PAYE','SHIF','NSSF','Housing levy','NITA','Component lines'],...rows.map(r=>{const s=typeof r.calculation_snapshot==='string'?JSON.parse(r.calculation_snapshot):r.calculation_snapshot;const st=s?.statutory??{};return [r.worker_number,r.first_name,r.last_name,Number(r.earnings),Number(r.employee_deductions),Number(r.employer_contributions),Number(r.net_pay),Number(st.paye??0),Number(st.shif??0),Number(st.nssf??0),Number(st.housingLevy??0),Number(st.nita??0),JSON.stringify(s?.components??[])];})]);
 }
 async auditCsv(tenantId:string,from:string,to:string){
  this.validateRange(from,to);
  const rows=await this.tenantDb.run(tenantId,m=>m.query('SELECT created_at,actor_user_id,action,entity_type,entity_id,metadata FROM audit_events WHERE tenant_id=$1 AND created_at >= $2::date AND created_at < ($3::date + INTERVAL \'1 day\') ORDER BY created_at DESC LIMIT 50000',[tenantId,from,to]));
  return toCsv([['Created at','Actor user ID','Action','Entity type','Entity ID','Metadata'],...rows.map(r=>[r.created_at,r.actor_user_id,r.action,r.entity_type,r.entity_id,JSON.stringify(r.metadata??{})])]);
 }
}
