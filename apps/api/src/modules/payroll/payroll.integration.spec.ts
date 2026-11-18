/**
 * Real-PostgreSQL integration test for the payroll flow. Skipped unless a migrated
 * database is supplied, so the normal `pnpm test` stays hermetic.
 *
 *   TEST_DATABASE_URL      owner/superuser URL, used only to seed and inspect data
 *   TEST_APP_DATABASE_URL  NON-superuser runtime role URL, so RLS is really enforced
 *
 * Run the migrations first. Never point these at a database that holds real data.
 */
import 'reflect-metadata';
import { createHash, randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Pool } from 'pg';
import { ConflictException } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { blockingWarnings } from './adjustments';
import { ComplianceService } from '../compliance/compliance.service';
import { PayrollPostFinalizationService } from './payroll-post-finalization.service';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { TenantStatutoryService } from '../../database/tenant-statutory.service';
import { calculateKenyaMonthlyPayroll, type StatutoryRule } from './kenya-payroll-calculator';

const OWNER_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const suite = OWNER_URL && APP_URL ? describe : describe.skip;

suite('Payroll flow against PostgreSQL (RLS enforced)', () => {
  let owner: Pool;
  let ds: DataSource;
  let service: PayrollService;
  let tenantId: string;
  let workerId: string;
  let creator: string, approver: string, finalizer: string;
  let rulesetId: string;
  let originalApproval: string | null;
  let rules: StatutoryRule[];
  const q = async (sql: string, params: unknown[] = []) => (await owner.query(sql, params)).rows;

  beforeAll(async () => {
    owner = new Pool({ connectionString: OWNER_URL });
    ds = new DataSource({ type: 'postgres', url: APP_URL, entities: [], synchronize: false });
    await ds.initialize();
    const tenantTx = new TenantTransactionService(ds);
    service = new PayrollService(tenantTx);

    const slug = 'it-' + randomUUID().slice(0, 8);
    tenantId = (await q("INSERT INTO tenants (slug,legal_name,display_name) VALUES ($1,$2,$2) RETURNING id", [slug, 'Integration Test Ltd']))[0].id;
    const users: string[] = [];
    for (const n of ['creator', 'approver', 'finalizer']) {
      users.push((await q("INSERT INTO platform_users (email,full_name) VALUES ($1,$2) RETURNING id", [`${n}-${slug}@example.test`, n]))[0].id);
    }
    [creator, approver, finalizer] = users as [string, string, string];

    await new TenantStatutoryService(tenantTx).assignDefaultKenyaPack(tenantId, '2026-01-01');
    const set = (await q("SELECT id,compliance_approved_at FROM statutory_rule_sets WHERE country_code='KE' AND version='KE-2026.11'"))[0];
    rulesetId = set.id; originalApproval = set.compliance_approved_at;
    await q("UPDATE statutory_rule_sets SET compliance_approved_at=now() WHERE id=$1", [rulesetId]);
    rules = await q("SELECT code,calculation_method,configuration FROM statutory_rules WHERE rule_set_id=$1", [rulesetId]);
    // Payroll runs require a tenant-scoped review of the exact effective-dated rule snapshot.
    const reviewRules = await q(`
      SELECT code,label,category,calculation_method,configuration,effective_from::text,effective_to::text,
        source_title,source_url,verified_on::text
      FROM statutory_rules WHERE rule_set_id=$1 ORDER BY code,effective_from
    `, [rulesetId]);
    const rulesSnapshotHash = createHash('sha256').update(JSON.stringify(reviewRules)).digest('hex');
    await q(`
      INSERT INTO tenant_statutory_rule_reviews
        (tenant_id,rule_set_id,status,effective_from,effective_to,rules_snapshot_hash,
         submission_notes,review_notes,submitted_by,submitted_at,reviewed_by,reviewed_at)
      VALUES($1,$2,'approved','2026-01-01',NULL,$3,'Integration test setup',
        'Reviewed by a separate test approver',$4,now(),$5,now())
    `, [tenantId,rulesetId,rulesSnapshotHash,creator,approver]);

    workerId = (await q("INSERT INTO workers (tenant_id,worker_number,first_name,last_name,status) VALUES ($1,'W001','Amani','Otieno','active') RETURNING id", [tenantId]))[0].id;
    await q("INSERT INTO worker_contracts (tenant_id,worker_id,engagement_type,pay_basis,rate_amount,effective_from) VALUES ($1,$2,'permanent','monthly',100000,'2026-01-01')", [tenantId, workerId]);
    // Tax treatments are reviewed per tenant; the seeded default is review_required.
    await q("UPDATE tenant_allowance_types SET tax_treatment='taxable' WHERE tenant_id=$1 AND code='TRANSPORT'", [tenantId]);
    await q("UPDATE tenant_allowance_types SET tax_treatment='non_taxable' WHERE tenant_id=$1 AND code='TOOL_ALLOWANCE'", [tenantId]);
    await q("UPDATE tenant_deduction_types SET taxable_treatment='post_tax' WHERE tenant_id=$1", [tenantId]);
  });

  afterAll(async () => {
    if (rulesetId) await q("UPDATE statutory_rule_sets SET compliance_approved_at=$2 WHERE id=$1", [rulesetId, originalApproval]);
    await ds?.destroy();
    await owner?.end();
  });

  const assignAllowance = (code: string, amount: number) => q(
    "INSERT INTO worker_allowance_assignments (tenant_id,worker_id,allowance_type_id,amount,effective_from) SELECT $1,$2,id,$4,'2026-01-01' FROM tenant_allowance_types WHERE tenant_id=$1 AND code=$3",
    [tenantId, workerId, code, amount]);
  const assignDeduction = (code: string, amount: number, balance: number | null) => q(
    "INSERT INTO worker_deduction_assignments (tenant_id,worker_id,deduction_type_id,amount,outstanding_balance,effective_from) SELECT $1,$2,id,$4,$5,'2026-01-01' FROM tenant_deduction_types WHERE tenant_id=$1 AND code=$3",
    [tenantId, workerId, code, amount, balance]);
  const loan = async () => (await q("SELECT outstanding_balance::float AS bal,status FROM worker_deduction_assignments WHERE tenant_id=$1 AND worker_id=$2 AND amount=5000", [tenantId, workerId]))[0];

  async function newRun(code: string, start: string, end: string) {
    const period: any = await service.createPeriod(tenantId, creator, { code, name: code, startDate: start, endDate: end });
    const run: any = await service.createRun(tenantId, creator, period.id);
    return run.id as string;
  }
  async function finalize(runId: string) {
    await service.transitionRun(tenantId, creator, runId, 'submit');
    await service.transitionRun(tenantId, approver, runId, 'approve');
    return service.transitionRun(tenantId, finalizer, runId, 'finalize');
  }

  it('calculates, finalizes and recovers a loan across runs using real SQL', async () => {
    await assignAllowance('TRANSPORT', 10000);
    await assignAllowance('TOOL_ALLOWANCE', 5000);
    await assignDeduction('SACCO_CONTRIBUTION', 2000, null);
    await assignDeduction('STAFF_LOAN_RECOVERY', 5000, 12000);

    // November 2026 crosses the 2026-11-16 NITA and PAYE-allowable-deduction
    // rule effective dates. Keep this end-to-end loan test on a full month after both.
    const decRun = await newRun('2026-12', '2026-12-01', '2026-12-31');
    const calc: any = await service.calculateRun(tenantId, creator, decRun);
    const statutory = calculateKenyaMonthlyPayroll(110000, rules); // 100k basic + 10k taxable allowance
    const expectedNet = Math.round((115000 - statutory.employeeStatutoryDeductions - 7000) * 100) / 100;

    expect(calc.totals).toMatchObject({ workerCount: 1, grossEarnings: 115000, netPay: expectedNet });
    expect(calc.warnings.filter((w: string) => /REQUIRES_REVIEW|NOT_AVAILABLE|NET_PAY|NOT_INCLUDED/.test(w))).toEqual([]);
    expect((await loan()).bal).toBe(12000); // calculation must not touch balances

    await finalize(decRun);
    expect(await loan()).toEqual({ bal: 7000, status: 'active' });
    const payslips: any[] = await service.listPayslips(tenantId, decRun);
    expect(payslips).toHaveLength(1);
    expect(payslips[0].snapshot.otherDeductions.total).toBe(7000);

    // Final instalment is capped at what remains, then the assignment completes.
    await q("UPDATE worker_deduction_assignments SET outstanding_balance=3000 WHERE tenant_id=$1 AND amount=5000", [tenantId]);
    const janRun = await newRun('2027-01', '2027-01-01', '2027-01-31');
    const jan: any = await service.calculateRun(tenantId, creator, janRun);
    expect(jan.totals.employeeDeductions).toBeCloseTo(calculateKenyaMonthlyPayroll(110000, rules).employeeStatutoryDeductions + 2000 + 3000, 2);
    await finalize(janRun);
    expect(await loan()).toEqual({ bal: 0, status: 'completed' });
  });

  it('blocks finalization when an hours-based allowance has no approved-hours source', async () => {
    await assignAllowance('OVERTIME', 300);
    const runId = await newRun('2027-02', '2027-02-01', '2027-02-28');
    const calc: any = await service.calculateRun(tenantId, creator, runId);
    expect(calc.warnings).toContain('W001:OVERTIME:ALLOWANCE_HOURS_SOURCE_NOT_AVAILABLE');
    await service.transitionRun(tenantId, creator, runId, 'submit');
    await service.transitionRun(tenantId, approver, runId, 'approve');
    await expect(service.transitionRun(tenantId, finalizer, runId, 'finalize')).rejects.toBeInstanceOf(ConflictException);
  });

  describe('approved overtime', () => {
    const approveOvertime = (date: string, minutes: number) => q(
      "INSERT INTO overtime_requests (tenant_id,worker_id,work_date,requested_minutes,approved_minutes,reason,status,reviewed_by,reviewed_at) VALUES ($1,$2,$3,$4,$4,'Site deadline','approved',$5,now())",
      [tenantId, workerId, date, minutes, approver]);
    let unpaidGross = 0;

    it('does not pay approved overtime until the tenant configures a multiplier, and blocks finalization', async () => {
      await approveOvertime('2027-03-10', 240);
      const runId = await newRun('2027-03', '2027-03-01', '2027-03-31');
      const calc: any = await service.calculateRun(tenantId, creator, runId);
      expect(blockingWarnings(calc.warnings)).toContain('W001:OVERTIME_POLICY_MULTIPLIER_NOT_CONFIGURED');
      unpaidGross = calc.totals.grossEarnings;
      const [snap] = await q('SELECT calculation_snapshot AS s FROM payroll_run_items WHERE tenant_id=$1 AND payroll_run_id=$2', [tenantId, runId]);
      expect(snap.s.overtime).toMatchObject({ approvedMinutes: 240, amount: 0 });
    });

    it('pays configured overtime into gross and the statutory base, stamping the engine version', async () => {
      await q("UPDATE tenant_payroll_settings SET overtime_policy=overtime_policy || '{\"multiplier\":1.5}'::jsonb WHERE tenant_id=$1", [tenantId]);
      await approveOvertime('2027-04-10', 240);
      const runId = await newRun('2027-04', '2027-04-01', '2027-04-30');
      const calc: any = await service.calculateRun(tenantId, creator, runId);
      // 100,000 / (26 days * 8 h) = 480.7692/h; 4 h * 1.5 = 2,884.62
      expect(calc.totals.grossEarnings).toBeCloseTo(unpaidGross + 2884.62, 2);
      expect(blockingWarnings(calc.warnings).filter((w: string) => w.includes('OVERTIME_POLICY'))).toEqual([]);
      const [item] = await q('SELECT calculation_snapshot AS s FROM payroll_run_items WHERE tenant_id=$1 AND payroll_run_id=$2', [tenantId, runId]);
      expect(item.s.earnings.overtimeAmount).toBe(2884.62);
      expect(item.s.overtime).toMatchObject({ hours: 4, multiplier: 1.5, amount: 2884.62 });
      expect(item.s.statutory.gross).toBeCloseTo(100000 + 2884.62 + 10000, 2); // basic + overtime + taxable allowance
      const [run] = await q('SELECT engine_version FROM payroll_runs WHERE tenant_id=$1 AND id=$2', [tenantId, runId]);
      expect(run.engine_version).toBe('jengaflow-ke-0.4.0');
    });

    it('updates the overtime policy via real jsonb merge, preserving existing keys, with an audit row', async () => {
      const compliance = new ComplianceService(new TenantTransactionService(ds));
      const before: any = await compliance.getOvertimePolicy(tenantId);
      const updated: any = await compliance.updateOvertimePolicy(tenantId, creator, { attendanceIncludesOvertime: true });
      expect(updated.overtimePolicy).toMatchObject({ ...before.overtimePolicy, attendanceIncludesOvertime: true });
      expect(updated.overtimePolicy.multiplier).toBe(1.5); // untouched by a partial patch
      const audit = await q("SELECT metadata FROM audit_events WHERE tenant_id=$1 AND action='payroll.overtime_policy.updated'", [tenantId]);
      expect(audit).toHaveLength(1);
      await compliance.updateOvertimePolicy(tenantId, creator, { attendanceIncludesOvertime: false });
    });

    it('flags timesheet overtime that has no approved request, without paying it', async () => {
      const ts = (await q("INSERT INTO timesheets (tenant_id,worker_id,period_start,period_end,status,submitted_at,reviewed_at) VALUES ($1,$2,'2027-05-01','2027-05-31','approved',now(),now()) RETURNING id", [tenantId, workerId]))[0].id;
      await q("INSERT INTO timesheet_lines (tenant_id,timesheet_id,work_date,minutes_worked,overtime_minutes) VALUES ($1,$2,'2027-05-12',600,120)", [tenantId, ts]);
      const runId = await newRun('2027-05', '2027-05-01', '2027-05-31');
      const calc: any = await service.calculateRun(tenantId, creator, runId);
      expect(calc.warnings).toContain('W001:TIMESHEET_OVERTIME_EXCEEDS_APPROVED_REQUESTS');
      expect(calc.totals.grossEarnings).toBeCloseTo(unpaidGross, 2);
    });

    it('prints the overtime line on a finalized payslip', async () => {
      // Clean slate: earlier tests left an unreviewable hours-based allowance that blocks finalization.
      await q('DELETE FROM worker_allowance_assignments WHERE tenant_id=$1', [tenantId]);
      await assignAllowance('TRANSPORT', 10000);
      await approveOvertime('2027-06-10', 120);
      const runId = await newRun('2027-06', '2027-06-01', '2027-06-30');
      const calc: any = await service.calculateRun(tenantId, creator, runId);
      expect(blockingWarnings(calc.warnings)).toEqual([]);
      await finalize(runId);
      const [{ id }] = (await service.listPayslips(tenantId, runId)) as any[];
      const html = await new PayrollPostFinalizationService(new TenantTransactionService(ds)).payslipHtml(tenantId, id);
      expect(html).toContain('Overtime (2 h)');
      expect(html).toContain('1,442.31'); // 100,000 * 120 * 1.5 / (60*8*26)
    });
  });
});
