import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { EntityManager } from 'typeorm';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { calculateKenyaMonthlyPayroll, type StatutoryRule } from './kenya-payroll-calculator';
import { CreatePayrollPeriodDto, UpdatePayrollPeriodDto, UpdatePayrollRunDto } from './payroll.dto';
import { calculateContractEarnings } from './contract-earnings';
import { blockingWarnings, calculateAllowances, calculateOtherDeductions, type AllowanceAssignmentInput, type DeductionAssignmentInput } from './adjustments';

const ENGINE_VERSION = 'jengaflow-ke-0.3.0';
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class PayrollService {
  constructor(private readonly tenantDb: TenantTransactionService) {}

  private async assertApprovedRulesSnapshot(manager: EntityManager, tenantId: string, ruleSetId: string, startDate: string, endDate: string) {
    const partialBaseChanges = await manager.query(
      'SELECT code FROM statutory_rules WHERE rule_set_id=$1 AND ((effective_from > $2::date AND effective_from <= $3::date) OR (effective_to >= $2::date AND effective_to < $3::date)) LIMIT 1',
      [ruleSetId,startDate,endDate],
    );
    const partialTenantChanges = await manager.query(
      "SELECT rule_code FROM tenant_statutory_rule_overrides WHERE tenant_id=$1 AND rule_set_id=$2 AND status='approved' AND ((effective_from > $3::date AND effective_from <= $4::date) OR (effective_to >= $3::date AND effective_to < $4::date)) LIMIT 1",
      [tenantId,ruleSetId,startDate,endDate],
    );
    if (partialBaseChanges.length || partialTenantChanges.length) {
      throw new ConflictException('A statutory rule changes during this payroll period. Split the payroll period at the effective date or implement approved proration before calculating payroll.');
    }
    const reviews = await manager.query(`
      SELECT id,rules_snapshot_hash FROM tenant_statutory_rule_reviews
      WHERE tenant_id=$1 AND rule_set_id=$2 AND status='approved'
        AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $4::date)
      ORDER BY reviewed_at DESC LIMIT 1
    `,[tenantId,ruleSetId,startDate,endDate]);
    if (!reviews.length) throw new ConflictException('The statutory ruleset has not been reviewed and approved for this company and the entire payroll period.');
    const currentRules = await manager.query(
      'SELECT code,label,category,calculation_method,configuration,effective_from::text,effective_to::text,source_title,source_url,verified_on::text FROM statutory_rules WHERE rule_set_id=$1 ORDER BY code,effective_from',
      [ruleSetId],
    );
    const currentHash = createHash('sha256').update(JSON.stringify(currentRules)).digest('hex');
    if (currentHash !== String(reviews[0].rules_snapshot_hash).trim()) {
      throw new ConflictException('The statutory rules changed after compliance approval. A fresh review and approval is required before payroll can continue.');
    }
    return reviews[0];
  }

  listPeriods(tenantId: string) { return this.tenantDb.run(tenantId, m => m.query('SELECT id,code,name,start_date AS "startDate",end_date AS "endDate",payment_date AS "paymentDate",status FROM payroll_periods WHERE tenant_id=$1 ORDER BY start_date DESC',[tenantId])); }


  async getPeriod(tenantId: string, periodId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const rows = await m.query(`
        SELECT id,code,name,start_date::text AS "startDate",end_date::text AS "endDate",
          payment_date::text AS "paymentDate",status,created_at AS "createdAt",updated_at AS "updatedAt"
        FROM payroll_periods WHERE tenant_id=$1 AND id=$2
      `,[tenantId,periodId]);
      if (!rows.length) throw new NotFoundException('Payroll period not found.');
      return rows[0];
    });
  }

  async updatePeriod(tenantId: string, actorId: string, periodId: string, dto: UpdatePayrollPeriodDto) {
    return this.tenantDb.run(tenantId, async m => {
      const current = await m.query('SELECT * FROM payroll_periods WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,periodId]);
      if (!current.length) throw new NotFoundException('Payroll period not found.');
      if (current[0].status !== 'open') throw new ConflictException('Only open payroll periods can be edited.');
      const runCount = await m.query('SELECT count(*)::int AS count FROM payroll_runs WHERE tenant_id=$1 AND period_id=$2',[tenantId,periodId]);
      if (Number(runCount[0].count) > 0) throw new ConflictException('A payroll period cannot be edited after a payroll run has been created. Delete eligible draft runs first.');
      const before = current[0];
      const code = dto.code?.trim() ?? before.code;
      const name = dto.name?.trim() ?? before.name;
      const startDate = dto.startDate ?? String(before.start_date).slice(0,10);
      const endDate = dto.endDate ?? String(before.end_date).slice(0,10);
      const paymentDate = dto.paymentDate === undefined ? before.payment_date : dto.paymentDate;
      if (endDate < startDate) throw new BadRequestException('Payroll period end date must not precede its start date.');
      const start = new Date(startDate+'T00:00:00Z'), end = new Date(endDate+'T00:00:00Z');
      if (start.getUTCFullYear() !== end.getUTCFullYear() || start.getUTCMonth() !== end.getUTCMonth()) {
        throw new BadRequestException('A payroll period must remain within one calendar month.');
      }
      const duplicate = await m.query('SELECT id FROM payroll_periods WHERE tenant_id=$1 AND code=$2 AND id<>$3',[tenantId,code,periodId]);
      if (duplicate.length) throw new ConflictException('A payroll period with this code already exists.');
      const overlap = await m.query("SELECT id FROM payroll_periods WHERE tenant_id=$1 AND id<>$4 AND status <> 'closed' AND daterange(start_date,end_date,'[]') && daterange($2::date,$3::date,'[]') LIMIT 1",[tenantId,startDate,endDate,periodId]);
      if (overlap.length) throw new ConflictException('This payroll period overlaps another open or locked period.');
      const updated = await m.query(`
        UPDATE payroll_periods SET code=$3,name=$4,start_date=$5,end_date=$6,payment_date=$7,updated_at=now()
        WHERE tenant_id=$1 AND id=$2
        RETURNING id,code,name,start_date::text AS "startDate",end_date::text AS "endDate",
          payment_date::text AS "paymentDate",status,updated_at AS "updatedAt"
      `,[tenantId,periodId,code,name,startDate,endDate,paymentDate]);
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'payroll.period.updated','payroll_period',$3,$4::jsonb)",[tenantId,actorId,periodId,JSON.stringify({before,after:updated[0]})]);
      return updated[0];
    });
  }

  async deletePeriod(tenantId: string, actorId: string, periodId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const rows = await m.query('SELECT * FROM payroll_periods WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,periodId]);
      if (!rows.length) throw new NotFoundException('Payroll period not found.');
      if (rows[0].status !== 'open') throw new ConflictException('Only open payroll periods can be deleted.');
      const runs = await m.query('SELECT count(*)::int AS count FROM payroll_runs WHERE tenant_id=$1 AND period_id=$2',[tenantId,periodId]);
      if (Number(runs[0].count) > 0) throw new ConflictException('This payroll period has payroll runs. Delete eligible draft runs before deleting the period.');
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'payroll.period.deleted','payroll_period',$3,$4::jsonb)",[tenantId,actorId,periodId,JSON.stringify({code:rows[0].code,name:rows[0].name})]);
      await m.query('DELETE FROM payroll_periods WHERE tenant_id=$1 AND id=$2',[tenantId,periodId]);
      return {id:periodId,deleted:true};
    });
  }

  async transitionPeriod(tenantId: string, actorId: string, periodId: string, status: 'open'|'locked'|'closed') {
    return this.tenantDb.run(tenantId, async m => {
      const rows = await m.query('SELECT id,status FROM payroll_periods WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,periodId]);
      if (!rows.length) throw new NotFoundException('Payroll period not found.');
      const current = rows[0].status;
      if (current === status) return {id:periodId,status};
      if (current === 'closed') throw new ConflictException('A closed payroll period cannot be reopened or changed.');
      if (status === 'locked' && current !== 'open') throw new ConflictException('Only an open payroll period can be locked.');
      if (status === 'closed') {
        if (current !== 'locked') throw new ConflictException('Lock the payroll period before closing it.');
        const incomplete = await m.query("SELECT count(*)::int AS count FROM payroll_runs WHERE tenant_id=$1 AND period_id=$2 AND status<>'finalized'",[tenantId,periodId]);
        if (Number(incomplete[0].count) > 0) throw new ConflictException('All payroll runs must be finalized before the period can be closed.');
      }
      if (status === 'open' && current === 'locked') {
        const finalized = await m.query("SELECT count(*)::int AS count FROM payroll_runs WHERE tenant_id=$1 AND period_id=$2 AND status='finalized'",[tenantId,periodId]);
        if (Number(finalized[0].count) > 0) throw new ConflictException('A period with finalized payroll cannot be reopened.');
      }
      const updated = await m.query('UPDATE payroll_periods SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status',[tenantId,periodId,status]);
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'payroll.period.status_changed','payroll_period',$3,$4::jsonb)",[tenantId,actorId,periodId,JSON.stringify({from:current,to:status})]);
      return updated[0];
    });
  }

  async updateRun(tenantId: string, actorId: string, runId: string, dto: UpdatePayrollRunDto) {
    return this.tenantDb.run(tenantId, async m => {
      const rows = await m.query('SELECT id,status,description FROM payroll_runs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,runId]);
      if (!rows.length) throw new NotFoundException('Payroll run not found.');
      if (!['draft','rejected','calculated'].includes(rows[0].status)) throw new ConflictException('Only draft, rejected or calculated payroll runs can be edited.');
      if (dto.description === undefined) throw new BadRequestException('Provide at least one editable payroll run field.');
      const updated = await m.query('UPDATE payroll_runs SET description=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,description,status,updated_at AS "updatedAt"',[tenantId,runId,dto.description?.trim() || null]);
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'payroll.run.updated','payroll_run',$3,$4::jsonb)",[tenantId,actorId,runId,JSON.stringify({before:rows[0],after:updated[0]})]);
      return updated[0];
    });
  }

  async deleteRun(tenantId: string, actorId: string, runId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const rows = await m.query('SELECT id,status,period_id,run_number FROM payroll_runs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,runId]);
      if (!rows.length) throw new NotFoundException('Payroll run not found.');
      if (!['draft','rejected','calculated'].includes(rows[0].status)) throw new ConflictException('Only draft, rejected or calculated payroll runs can be deleted. Submitted, approved and finalized runs must be retained.');
      const payments = await m.query('SELECT count(*)::int AS count FROM payroll_payment_batches WHERE tenant_id=$1 AND payroll_run_id=$2',[tenantId,runId]);
      const slips = await m.query('SELECT count(*)::int AS count FROM payslips WHERE tenant_id=$1 AND payroll_run_id=$2',[tenantId,runId]);
      if (Number(payments[0].count) || Number(slips[0].count)) throw new ConflictException('A payroll run with payment batches or issued payslips cannot be deleted.');
      await m.query('DELETE FROM payroll_run_items WHERE tenant_id=$1 AND payroll_run_id=$2',[tenantId,runId]);
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'payroll.run.deleted','payroll_run',$3,$4::jsonb)",[tenantId,actorId,runId,JSON.stringify({periodId:rows[0].period_id,runNumber:rows[0].run_number,status:rows[0].status})]);
      await m.query('DELETE FROM payroll_runs WHERE tenant_id=$1 AND id=$2',[tenantId,runId]);
      return {id:runId,deleted:true};
    });
  }

  listRuns(tenantId: string, periodId?: string) {
    return this.tenantDb.run(tenantId, m => m.query(`
      SELECT r.id,r.period_id AS "periodId",p.code AS "periodCode",r.run_number AS "runNumber",
        r.status,r.description,r.engine_version AS "engineVersion",r.totals,r.warnings,r.created_at AS "createdAt",
        r.calculated_at AS "calculatedAt",r.approved_at AS "approvedAt",r.finalized_at AS "finalizedAt"
      FROM payroll_runs r JOIN payroll_periods p ON p.tenant_id=r.tenant_id AND p.id=r.period_id
      WHERE r.tenant_id=$1 AND ($2::uuid IS NULL OR r.period_id=$2::uuid)
      ORDER BY r.created_at DESC
    `,[tenantId,periodId??null]));
  }

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

  createRun(tenantId: string, actorId: string, periodId: string, description?: string) {
    return this.tenantDb.run(tenantId, async m => {
      const periods = await m.query("SELECT id,code,status,start_date,end_date FROM payroll_periods WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[tenantId,periodId]);
      if (!periods.length) throw new NotFoundException('Payroll period not found.');
      if (periods[0].status !== 'open') throw new ConflictException('Only an open payroll period can receive a new run.');
      const assignments = await m.query(`
        SELECT a.rule_set_id FROM tenant_statutory_assignments a
        JOIN statutory_rule_sets s ON s.id=a.rule_set_id
        WHERE a.tenant_id=$1 AND a.effective_from <= $2::date
          AND (a.effective_to IS NULL OR a.effective_to >= $3::date)
          AND s.status='published'
        ORDER BY a.effective_from DESC LIMIT 1
      `,[tenantId,periods[0].start_date,periods[0].end_date]);
      if (!assignments.length) throw new ConflictException('No published Kenya statutory ruleset is assigned for this payroll period.');
      await this.assertApprovedRulesSnapshot(m,tenantId,assignments[0].rule_set_id,periods[0].start_date,periods[0].end_date);
      const next = await m.query('SELECT COALESCE(MAX(run_number),0)+1 AS run_number FROM payroll_runs WHERE tenant_id=$1 AND period_id=$2',[tenantId,periodId]);
      const rows = await m.query("INSERT INTO payroll_runs (tenant_id,period_id,run_number,status,engine_version,ruleset_id,created_by,description) VALUES ($1,$2,$3,'draft',$4,$5,$6,$7) RETURNING id,period_id AS \"periodId\",run_number AS \"runNumber\",status,engine_version AS \"engineVersion\",ruleset_id AS \"rulesetId\",description,created_at AS \"createdAt\"",[tenantId,periodId,next[0].run_number,ENGINE_VERSION,assignments[0].rule_set_id,actorId,description?.trim() || null]);
      await m.query("INSERT INTO audit_events (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,'payroll.run.created','payroll_run',$3,$4::jsonb)",[tenantId,actorId,rows[0].id,JSON.stringify({periodId,runNumber:next[0].run_number})]);
      return rows[0];
    });
  }

  calculateRun(tenantId: string, actorId: string, runId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const runs = await m.query("SELECT r.id,r.status,r.period_id,r.ruleset_id,r.created_by,p.start_date::text AS start_date,p.end_date::text AS end_date FROM payroll_runs r JOIN payroll_periods p ON p.tenant_id=r.tenant_id AND p.id=r.period_id WHERE r.tenant_id=$1 AND r.id=$2 FOR UPDATE",[tenantId,runId]);
      if (!runs.length) throw new NotFoundException('Payroll run not found.');
      const run = runs[0];
      if (!['draft','rejected'].includes(run.status)) throw new ConflictException('Only a draft or rejected payroll run can be recalculated.');
      await this.assertApprovedRulesSnapshot(m,tenantId,run.ruleset_id,run.start_date,run.end_date);
      const rawRules = await m.query('SELECT code,calculation_method,configuration FROM statutory_rules WHERE rule_set_id=$1 AND effective_from <= $2::date AND (effective_to IS NULL OR effective_to >= $3::date) ORDER BY code,effective_from DESC',[run.ruleset_id,run.start_date,run.end_date]);
      const tenantOverrides = await m.query("SELECT rule_code AS code,calculation_method,configuration FROM tenant_statutory_rule_overrides WHERE tenant_id=$1 AND rule_set_id=$2 AND status='approved' AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $4::date) ORDER BY rule_code,effective_from DESC",[tenantId,run.ruleset_id,run.start_date,run.end_date]);
      const mergedRules = new Map<string,StatutoryRule>();
      for (const rule of rawRules) mergedRules.set(rule.code,{code:rule.code,calculation_method:rule.calculation_method,configuration:rule.configuration});
      for (const rule of tenantOverrides) mergedRules.set(rule.code,{code:rule.code,calculation_method:rule.calculation_method,configuration:rule.configuration});
      const rules = [...mergedRules.values()];
      const workers = await m.query("SELECT w.id AS worker_id,w.worker_number,w.first_name,w.middle_name,w.last_name,w.email,c.id AS contract_id,c.engagement_type,c.pay_basis,c.rate_amount::numeric AS rate_amount,c.currency,c.effective_from::text AS effective_from,c.effective_to::text AS effective_to,c.terms,(SELECT count(DISTINCT a.work_date)::int FROM attendance_records a WHERE a.tenant_id=w.tenant_id AND a.worker_id=w.id AND a.status='approved' AND a.work_date BETWEEN GREATEST($2::date,c.effective_from) AND LEAST($3::date,COALESCE(c.effective_to,$3::date))) AS approved_days,(SELECT COALESCE(sum(a.minutes_worked),0)::int FROM attendance_records a WHERE a.tenant_id=w.tenant_id AND a.worker_id=w.id AND a.status='approved' AND a.work_date BETWEEN GREATEST($2::date,c.effective_from) AND LEAST($3::date,COALESCE(c.effective_to,$3::date))) AS approved_minutes,(SELECT COALESCE(sum(o.quantity),0)::numeric FROM worker_output_entries o WHERE o.tenant_id=w.tenant_id AND o.worker_id=w.id AND o.status='approved' AND o.work_date BETWEEN GREATEST($2::date,c.effective_from) AND LEAST($3::date,COALESCE(c.effective_to,$3::date)) AND o.unit_code = ANY(ARRAY(SELECT jsonb_array_elements_text(COALESCE(c.terms->'unitCodes','[]'::jsonb))))) AS approved_units,(SELECT count(*)::int FROM worker_contracts c2 WHERE c2.tenant_id=w.tenant_id AND c2.worker_id=w.id AND c2.effective_from <= $3::date AND (c2.effective_to IS NULL OR c2.effective_to >= $2::date)) AS overlapping_contracts FROM workers w JOIN worker_contracts c ON c.tenant_id=w.tenant_id AND c.worker_id=w.id AND c.effective_from <= $3::date AND (c.effective_to IS NULL OR c.effective_to >= $2::date) WHERE w.tenant_id=$1 AND w.status='active' ORDER BY w.worker_number",[tenantId,run.start_date,run.end_date]);
      if (!workers.length) throw new ConflictException('No active workers with contracts overlap this payroll period.');
      const attendanceWindow = (alias: string) => "BETWEEN GREATEST($2::date,"+alias+".effective_from) AND LEAST($3::date,COALESCE("+alias+".effective_to,$3::date))";
      const allowanceRows = await m.query(
        "SELECT a.id AS assignment_id,a.worker_id,a.allowance_type_id AS type_id,t.code,t.name,t.calculation_method AS method,t.tax_treatment,t.configuration,t.is_enabled AS type_enabled,t.effective_from::text AS type_effective_from,t.effective_to::text AS type_effective_to,a.amount::numeric AS amount,a.effective_from::text AS effective_from,a.effective_to::text AS effective_to,"
        +"(SELECT count(DISTINCT r.work_date)::int FROM attendance_records r WHERE r.tenant_id=a.tenant_id AND r.worker_id=a.worker_id AND r.status='approved' AND r.work_date "+attendanceWindow('a')+") AS approved_days,"
        +"(SELECT COALESCE(sum(r.minutes_worked),0)::int FROM attendance_records r WHERE r.tenant_id=a.tenant_id AND r.worker_id=a.worker_id AND r.status='approved' AND r.work_date "+attendanceWindow('a')+") AS approved_minutes "
        +"FROM worker_allowance_assignments a JOIN tenant_allowance_types t ON t.tenant_id=a.tenant_id AND t.id=a.allowance_type_id "
        +"WHERE a.tenant_id=$1 AND a.status='active' AND a.effective_from <= $3::date AND (a.effective_to IS NULL OR a.effective_to >= $2::date) ORDER BY a.worker_id,t.code,a.id",
        [tenantId,run.start_date,run.end_date]);
      const deductionRows = await m.query(
        "SELECT d.id AS assignment_id,d.worker_id,d.deduction_type_id AS type_id,t.code,t.name,t.calculation_method AS method,t.taxable_treatment,t.configuration,t.is_enabled AS type_enabled,t.effective_from::text AS type_effective_from,t.effective_to::text AS type_effective_to,d.amount::numeric AS amount,d.outstanding_balance::numeric AS outstanding_balance,d.effective_from::text AS effective_from,d.effective_to::text AS effective_to "
        +"FROM worker_deduction_assignments d JOIN tenant_deduction_types t ON t.tenant_id=d.tenant_id AND t.id=d.deduction_type_id "
        +"WHERE d.tenant_id=$1 AND d.status='active' AND d.effective_from <= $3::date AND (d.effective_to IS NULL OR d.effective_to >= $2::date) ORDER BY d.worker_id,t.code,d.id",
        [tenantId,run.start_date,run.end_date]);
      const allowancesByWorker = new Map<string, AllowanceAssignmentInput[]>();
      for (const r of allowanceRows) {
        const list = allowancesByWorker.get(r.worker_id) ?? [];
        list.push({ assignmentId:r.assignment_id,typeId:r.type_id,code:r.code,name:r.name,method:r.method,taxTreatment:r.tax_treatment,configuration:r.configuration ?? {},typeEnabled:r.type_enabled,typeEffectiveFrom:r.type_effective_from,typeEffectiveTo:r.type_effective_to,amount:Number(r.amount),effectiveFrom:r.effective_from,effectiveTo:r.effective_to,approvedDays:Number(r.approved_days),approvedMinutes:Number(r.approved_minutes) });
        allowancesByWorker.set(r.worker_id, list);
      }
      const deductionsByWorker = new Map<string, DeductionAssignmentInput[]>();
      for (const r of deductionRows) {
        const list = deductionsByWorker.get(r.worker_id) ?? [];
        list.push({ assignmentId:r.assignment_id,typeId:r.type_id,code:r.code,name:r.name,method:r.method,taxableTreatment:r.taxable_treatment,configuration:r.configuration ?? {},typeEnabled:r.type_enabled,typeEffectiveFrom:r.type_effective_from,typeEffectiveTo:r.type_effective_to,amount:Number(r.amount),outstandingBalance:r.outstanding_balance===null?null:Number(r.outstanding_balance),effectiveFrom:r.effective_from,effectiveTo:r.effective_to });
        deductionsByWorker.set(r.worker_id, list);
      }
      const warnings: string[] = [];
      const itemSnapshots: any[] = [];
      for (const worker of workers) {
        if (Number(worker.overlapping_contracts) !== 1) throw new ConflictException('Worker '+worker.worker_number+' has overlapping contracts. Resolve contract dates before calculating payroll.');
        if (!['permanent','fixed_term','casual','piece_rate','subcontractor','independent_contractor'].includes(worker.engagement_type)) throw new ConflictException('Worker '+worker.worker_number+' has an unsupported engagement classification.');
        const rate = Number(worker.rate_amount);
        const earningsResult = calculateContractEarnings({
          payBasis: worker.pay_basis,
          rate,
          periodStart: String(run.start_date),
          periodEnd: String(run.end_date),
          contractStart: String(worker.effective_from),
          contractEnd: worker.effective_to ? String(worker.effective_to) : null,
          approvedDays: Number(worker.approved_days),
          approvedMinutes: Number(worker.approved_minutes),
          approvedUnits: Number(worker.approved_units),
        });
        const basicEarnings = earningsResult.amount;
        const allowanceList = allowancesByWorker.get(worker.worker_id) ?? [];
        const seenAllowanceTypes = new Set<string>();
        const duplicateAllowanceWarnings: string[] = [];
        for (const a of allowanceList) {
          if (seenAllowanceTypes.has(a.typeId)) duplicateAllowanceWarnings.push(a.code+':ALLOWANCE_DUPLICATE_ASSIGNMENT');
          seenAllowanceTypes.add(a.typeId);
        }
        const allowances = calculateAllowances({ periodStart:String(run.start_date), periodEnd:String(run.end_date), basicEarnings, assignments: allowanceList });
        const grossPay = round(basicEarnings + allowances.total);
        const statutoryBase = round(basicEarnings + allowances.taxableTotal);
        const otherDeductions = calculateOtherDeductions({ periodStart:String(run.start_date), periodEnd:String(run.end_date), basicEarnings, grossEarnings: grossPay, assignments: deductionsByWorker.get(worker.worker_id) ?? [] });
        const contractorNeedsReview = ['subcontractor','independent_contractor'].includes(worker.engagement_type);
        // Do not apply employee PAYE/SHIF/NSSF deductions to a service contractor by default.
        // Their withholding/VAT treatment is a separate reviewed workflow; payroll finalization remains blocked.
        const statutory = contractorNeedsReview
          ? {
              gross: statutoryBase, taxableIncome: 0, paye: 0, shif: 0, nssf: 0, housingLevy: 0,
              employeeStatutoryDeductions: 0, employerNssf: 0, employerHousingLevy: 0, nita: 0,
              employerContributions: 0, netBeforeOtherDeductions: statutoryBase,
              warnings: ['CONTRACTOR_TAX_TREATMENT_REQUIRES_REVIEW'], lines: [],
            }
          : calculateKenyaMonthlyPayroll(statutoryBase,rules);
        const employeeDeductions = round(statutory.employeeStatutoryDeductions + otherDeductions.total);
        const netPay = round(grossPay - employeeDeductions);
        const classificationWarnings = contractorNeedsReview
          ? ['WORKER_CLASSIFICATION_REQUIRES_STATUTORY_REVIEW']
          : [];
        warnings.push(...earningsResult.warnings.map(w => worker.worker_number+':'+w));
        warnings.push(...classificationWarnings.map(w => worker.worker_number+':'+w));
        warnings.push(...allowances.warnings.map(w => worker.worker_number+':'+w));
        warnings.push(...duplicateAllowanceWarnings.map(w => worker.worker_number+':'+w));
        warnings.push(...otherDeductions.warnings.map(w => worker.worker_number+':'+w));
        if (netPay < 0 && !statutory.warnings.includes('NET_PAY_NEGATIVE')) warnings.push(worker.worker_number+':NET_PAY_NEGATIVE');
        const snapshot = { worker:{id:worker.worker_id,workerNumber:worker.worker_number,firstName:worker.first_name,middleName:worker.middle_name,lastName:worker.last_name,email:worker.email},contract:{id:worker.contract_id,engagementType:worker.engagement_type,payBasis:worker.pay_basis,rate,currency:worker.currency},period:{startDate:run.start_date,endDate:run.end_date},attendance:{approvedDays:Number(worker.approved_days),approvedMinutes:Number(worker.approved_minutes)},earnings:{quantity:earningsResult.quantity,unit:earningsResult.unit,rate,amount:basicEarnings,allowancesTotal:allowances.total,grossPay},allowances:{lines:allowances.lines,taxableTotal:allowances.taxableTotal,nonTaxableTotal:allowances.nonTaxableTotal,total:allowances.total},otherDeductions:{lines:otherDeductions.lines,total:otherDeductions.total},classificationWarnings,statutory,netPay,engineVersion:ENGINE_VERSION };
        itemSnapshots.push({workerId:worker.worker_id,earnings:grossPay,employeeDeductions,employerContributions:statutory.employerContributions,netPay,snapshot});
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

  async transitionRun(tenantId: string, actorId: string, runId: string, action: 'submit'|'approve'|'reject'|'finalize', reason?: string) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query(`SELECT r.*,p.code AS period_code,p.start_date::text AS period_start_date,p.end_date::text AS period_end_date,
        EXISTS(SELECT 1 FROM tenant_statutory_rule_reviews cr WHERE cr.tenant_id=r.tenant_id AND cr.rule_set_id=r.ruleset_id
          AND cr.status='approved' AND cr.effective_from <= p.start_date AND (cr.effective_to IS NULL OR cr.effective_to >= p.end_date)) AS tenant_compliance_approved
        FROM payroll_runs r JOIN payroll_periods p ON p.tenant_id=r.tenant_id AND p.id=r.period_id
        WHERE r.tenant_id=$1 AND r.id=$2 FOR UPDATE OF r`,[tenantId,runId]);
      if(!rows.length) throw new NotFoundException('Payroll run not found.');
      const run=rows[0];
      if(action==='submit') {
        if(run.status!=='calculated') throw new ConflictException('Only a calculated payroll run can be submitted.');
        await m.query("UPDATE payroll_runs SET status='submitted',submitted_by=$3,submitted_at=now(),rejected_by=NULL,rejected_at=NULL,rejection_reason=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,runId,actorId]);
      } else if(action==='approve') {
        if(run.status!=='submitted') throw new ConflictException('Only a submitted payroll run can be approved.');
        if(run.created_by===actorId || run.submitted_by===actorId) throw new BadRequestException('Separation of duties: the payroll creator or submitter cannot approve this run.');
        await m.query("UPDATE payroll_runs SET status='approved',approved_by=$3,approved_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,runId,actorId]);
      } else if(action==='reject') {
        if(run.status!=='submitted') throw new ConflictException('Only a submitted payroll run can be rejected.');
        if(run.created_by===actorId || run.submitted_by===actorId) throw new BadRequestException('Separation of duties: the payroll creator or submitter cannot reject this run.');
        if(!reason?.trim()) throw new BadRequestException('A reason is required when rejecting payroll.');
        await m.query("UPDATE payroll_runs SET status='rejected',rejected_by=$3,rejected_at=now(),rejection_reason=$4,updated_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,runId,actorId,reason.trim()]);
      } else {
        if(run.status!=='approved') throw new ConflictException('Only an approved payroll run can be finalized.');
        if(!run.tenant_compliance_approved) throw new ConflictException('The statutory ruleset has not been reviewed and approved for this company and payroll period. Payroll finalization is blocked.');
        await this.assertApprovedRulesSnapshot(m,tenantId,run.ruleset_id,run.period_start_date,run.period_end_date);
        const warnings=Array.isArray(run.warnings)?run.warnings:JSON.parse(run.warnings ?? '[]');
        const blocking=blockingWarnings(warnings);
        if(blocking.length) throw new ConflictException({message:'Payroll has unresolved blocking warnings.',warnings:blocking});
        if(run.approved_by===actorId) throw new BadRequestException('Separation of duties: the payroll approver cannot finalize the same run.');
        const items=await m.query('SELECT i.id,i.worker_id,i.calculation_snapshot,w.worker_number FROM payroll_run_items i JOIN workers w ON w.tenant_id=i.tenant_id AND w.id=i.worker_id WHERE i.tenant_id=$1 AND i.payroll_run_id=$2',[tenantId,runId]);
        for(const item of items){
          const number=String(run.period_code)+'-'+String(item.worker_number)+'-'+String(run.run_number);
          await m.query('INSERT INTO payslips (tenant_id,payroll_run_id,payroll_run_item_id,worker_id,payslip_number,snapshot) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',[tenantId,runId,item.id,item.worker_id,number,JSON.stringify(item.calculation_snapshot)]);
          const recoveries = (item.calculation_snapshot?.otherDeductions?.lines ?? []).filter((l:any)=>l.method==='balance_recovery' && Number(l.amount)>0);
          for(const line of recoveries){
            const applied=await m.query("UPDATE worker_deduction_assignments SET outstanding_balance=outstanding_balance-$4::numeric,status=CASE WHEN outstanding_balance-$4::numeric<=0 THEN 'completed' ELSE status END WHERE tenant_id=$1 AND id=$2 AND worker_id=$3 AND status='active' AND outstanding_balance >= $4::numeric RETURNING id",[tenantId,line.assignmentId,item.worker_id,line.amount]);
            if(!applied.length) throw new ConflictException('The recovery balance for '+line.code+' (worker '+item.worker_number+') changed since this run was calculated. Recalculate the payroll run before finalizing.');
          }
        }
        await m.query("UPDATE payroll_runs SET status='finalized',finalized_by=$3,finalized_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,runId,actorId]);
      }
      const newStatus=action==='submit'?'submitted':action==='approve'?'approved':action==='reject'?'rejected':'finalized';
      await m.query('INSERT INTO audit_events (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,\'payroll_run\',$4,$5::jsonb)',[tenantId,actorId,'payroll.run.'+action,runId,JSON.stringify({from:run.status,to:newStatus,...(action==='reject'?{reason:reason?.trim()}: {})})]);
      return {id:runId,status:newStatus};
    });
  }

  getRun(tenantId: string, runId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const runs = await m.query('SELECT id,period_id AS "periodId",run_number AS "runNumber",description,status,engine_version AS "engineVersion",totals,warnings,input_hash AS "inputHash",created_at AS "createdAt",updated_at AS "updatedAt",calculated_at AS "calculatedAt",submitted_at AS "submittedAt",approved_at AS "approvedAt",finalized_at AS "finalizedAt",rejected_at AS "rejectedAt",rejection_reason AS "rejectionReason" FROM payroll_runs WHERE tenant_id=$1 AND id=$2',[tenantId,runId]);
      if (!runs.length) throw new NotFoundException('Payroll run not found.');
      const items = await m.query('SELECT id,worker_id AS "workerId",earnings,employee_deductions AS "employeeDeductions",employer_contributions AS "employerContributions",net_pay AS "netPay",calculation_snapshot AS snapshot FROM payroll_run_items WHERE tenant_id=$1 AND payroll_run_id=$2 ORDER BY created_at',[tenantId,runId]);
      return {...runs[0],items};
    });
  }

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

}
