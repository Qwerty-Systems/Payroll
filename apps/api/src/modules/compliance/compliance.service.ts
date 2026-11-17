import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { CreateFilingDto, CreateRuleChangeDto, FilingRejectionDto, ReviewDecisionDto, SubmitFilingDto, SubmitRuleReviewDto, UpdateRuleChangeDto } from './compliance.dto';

@Injectable()
export class ComplianceService {
  constructor(private readonly tenantDb: TenantTransactionService) {}

  listRuleSets(tenantId: string) {
    return this.tenantDb.run(tenantId, m => m.query(`
      SELECT s.id,s.country_code AS "countryCode",s.name,s.version,s.status,s.is_system AS "isSystem",
        s.published_at AS "publishedAt",a.effective_from::text AS "assignedFrom",a.effective_to::text AS "assignedTo",
        r.id AS "reviewId",r.status AS "reviewStatus",r.effective_from::text AS "reviewEffectiveFrom",
        r.effective_to::text AS "reviewEffectiveTo",r.reviewed_at AS "reviewedAt"
      FROM statutory_rule_sets s
      LEFT JOIN LATERAL (
        SELECT * FROM tenant_statutory_assignments x WHERE x.tenant_id=$1 AND x.rule_set_id=s.id
        ORDER BY x.effective_from DESC LIMIT 1
      ) a ON true
      LEFT JOIN LATERAL (
        SELECT * FROM tenant_statutory_rule_reviews x WHERE x.tenant_id=$1 AND x.rule_set_id=s.id
        ORDER BY x.created_at DESC LIMIT 1
      ) r ON true
      WHERE s.status IN ('published','retired') ORDER BY s.country_code,s.published_at DESC
    `,[tenantId]));
  }

  async getRuleSet(tenantId: string, ruleSetId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const sets = await m.query('SELECT id,country_code AS "countryCode",name,version,status FROM statutory_rule_sets WHERE id=$1',[ruleSetId]);
      if (!sets.length) throw new NotFoundException('Statutory ruleset not found.');
      const rules = await m.query(`
        SELECT code,label,category,calculation_method AS "calculationMethod",configuration,
          effective_from::text AS "effectiveFrom",effective_to::text AS "effectiveTo",
          source_title AS "sourceTitle",source_url AS "sourceUrl",verified_on::text AS "verifiedOn",notes
        FROM statutory_rules WHERE rule_set_id=$1 ORDER BY code,effective_from
      `,[ruleSetId]);
      const overrides = await m.query(`
        SELECT id,rule_code AS "ruleCode",label,category,calculation_method AS "calculationMethod",
          configuration,effective_from::text AS "effectiveFrom",effective_to::text AS "effectiveTo",
          source_title AS "sourceTitle",source_url AS "sourceUrl",verified_on::text AS "verifiedOn",reason
        FROM tenant_statutory_rule_overrides
        WHERE tenant_id=$1 AND status='approved' AND (rule_set_id=$2 OR rule_set_id IS NULL)
        ORDER BY rule_code,effective_from
      `,[tenantId,ruleSetId]);
      return { ruleset:sets[0],rules,tenantOverrides:overrides };
    });
  }

  submitRuleReview(tenantId: string, actorId: string, ruleSetId: string, dto: SubmitRuleReviewDto) {
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) throw new BadRequestException('The review end date cannot precede its start date.');
    return this.tenantDb.run(tenantId, async m => {
      const sets = await m.query("SELECT id,name,version FROM statutory_rule_sets WHERE id=$1 AND status='published'",[ruleSetId]);
      if (!sets.length) throw new NotFoundException('A published statutory ruleset was not found.');
      const rules = await m.query('SELECT code,label,category,calculation_method,configuration,effective_from::text,effective_to::text,source_title,source_url,verified_on::text FROM statutory_rules WHERE rule_set_id=$1 ORDER BY code,effective_from',[ruleSetId]);
      if (!rules.length) throw new ConflictException('This statutory ruleset contains no rules to review.');
      const hash = createHash('sha256').update(JSON.stringify(rules)).digest('hex');
      const pending = await m.query("SELECT id FROM tenant_statutory_rule_reviews WHERE tenant_id=$1 AND rule_set_id=$2 AND status='submitted' LIMIT 1",[tenantId,ruleSetId]);
      if (pending.length) throw new ConflictException('A review for this ruleset is already awaiting a decision.');
      const rows = await m.query(`
        INSERT INTO tenant_statutory_rule_reviews
          (tenant_id,rule_set_id,status,effective_from,effective_to,rules_snapshot_hash,submission_notes,submitted_by,submitted_at)
        VALUES ($1,$2,'submitted',$3,$4,$5,$6,$7,now())
        RETURNING id,rule_set_id AS "ruleSetId",status,effective_from::text AS "effectiveFrom",
          effective_to::text AS "effectiveTo",rules_snapshot_hash AS "rulesSnapshotHash",submitted_at AS "submittedAt"
      `,[tenantId,ruleSetId,dto.effectiveFrom,dto.effectiveTo ?? null,hash,dto.submissionNotes ?? null,actorId]);
      await this.audit(m,tenantId,actorId,'compliance.ruleset.review_submitted','statutory_rule_review',rows[0].id,{ruleSetId,version:sets[0].version,hash});
      return rows[0];
    });
  }

  decideRuleReview(tenantId: string, actorId: string, reviewId: string, decision: 'approve'|'reject', dto: ReviewDecisionDto) {
    return this.tenantDb.run(tenantId, async m => {
      const rows = await m.query('SELECT * FROM tenant_statutory_rule_reviews WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,reviewId]);
      if (!rows.length) throw new NotFoundException('Statutory ruleset review not found.');
      const review = rows[0];
      if (review.status !== 'submitted') throw new ConflictException('Only a submitted ruleset review can be approved or rejected.');
      if (review.submitted_by === actorId) throw new BadRequestException('Separation of duties: the person who submitted this review cannot decide it.');
      if (decision === 'approve') {
        const currentRules=await m.query('SELECT code,label,category,calculation_method,configuration,effective_from::text,effective_to::text,source_title,source_url,verified_on::text FROM statutory_rules WHERE rule_set_id=$1 ORDER BY code,effective_from',[review.rule_set_id]);
        const currentHash=createHash('sha256').update(JSON.stringify(currentRules)).digest('hex');
        if(currentHash!==String(review.rules_snapshot_hash).trim()) throw new ConflictException('The statutory rules changed after this review was submitted. Submit a fresh review against the current ruleset before approval.');
        const published=await m.query("SELECT id FROM statutory_rule_sets WHERE id=$1 AND status='published'",[review.rule_set_id]);
        if(!published.length) throw new ConflictException('Only a published statutory ruleset can be approved for company payroll.');

        await m.query(`
          UPDATE tenant_statutory_rule_reviews SET status='approved',review_notes=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now()
          WHERE tenant_id=$1 AND id=$2
        `,[tenantId,reviewId,dto.notes,actorId]);
        await m.query(`
          INSERT INTO tenant_statutory_assignments(tenant_id,rule_set_id,effective_from,effective_to,assigned_by)
          VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(tenant_id,rule_set_id,effective_from)
          DO UPDATE SET effective_to=EXCLUDED.effective_to,assigned_by=EXCLUDED.assigned_by
        `,[tenantId,review.rule_set_id,review.effective_from,review.effective_to,actorId]);
      } else {
        await m.query("UPDATE tenant_statutory_rule_reviews SET status='rejected',review_notes=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,reviewId,dto.notes,actorId]);
      }
      await this.audit(m,tenantId,actorId,'compliance.ruleset.review_'+decision,'statutory_rule_review',reviewId,{ruleSetId:review.rule_set_id,notes:dto.notes});
      return {id:reviewId,status:decision==='approve'?'approved':'rejected',reviewedBy:actorId};
    });
  }

  listRuleChanges(tenantId: string) {
    return this.tenantDb.run(tenantId,m=>m.query(`
      SELECT c.id,c.rule_set_id AS "ruleSetId",c.rule_code AS "ruleCode",c.label,c.category,
        c.calculation_method AS "calculationMethod",c.configuration,c.effective_from::text AS "effectiveFrom",
        c.effective_to::text AS "effectiveTo",c.source_title AS "sourceTitle",c.source_url AS "sourceUrl",
        c.verified_on::text AS "verifiedOn",c.reason,c.status,c.submission_notes AS "submissionNotes",
        c.review_notes AS "reviewNotes",c.submitted_at AS "submittedAt",c.reviewed_at AS "reviewedAt",
        c.created_at AS "createdAt"
      FROM tenant_statutory_rule_changes c WHERE c.tenant_id=$1 ORDER BY c.effective_from DESC,c.created_at DESC
    `,[tenantId]));
  }

  createRuleChange(tenantId: string, actorId: string, ruleSetId: string, dto: CreateRuleChangeDto) {
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) throw new BadRequestException('The effective end date cannot precede the start date.');
    return this.tenantDb.run(tenantId,async m=>{
      const set=await m.query("SELECT id FROM statutory_rule_sets WHERE id=$1 AND status='published'",[ruleSetId]);
      if(!set.length) throw new NotFoundException('Published statutory ruleset not found.');
      const baseRule=await m.query('SELECT code,category,calculation_method FROM statutory_rules WHERE rule_set_id=$1 AND code=$2 LIMIT 1',[ruleSetId,dto.ruleCode.trim().toUpperCase()]);
      if(!baseRule.length) throw new BadRequestException('Only an existing rule in the selected statutory ruleset can be changed.');
      if(baseRule[0].calculation_method!==dto.calculationMethod) throw new BadRequestException('Changing the calculation method requires a reviewed payroll-engine implementation; this workflow can safely update the effective-dated rule configuration only.');
      if(baseRule[0].category!==dto.category) throw new BadRequestException('A rule change cannot change the statutory category.');
      const rows=await m.query(`
        INSERT INTO tenant_statutory_rule_changes
          (tenant_id,rule_set_id,rule_code,label,category,calculation_method,configuration,effective_from,effective_to,source_title,source_url,verified_on,reason)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13)
        RETURNING id,rule_code AS "ruleCode",status,effective_from::text AS "effectiveFrom"
      `,[tenantId,ruleSetId,dto.ruleCode.trim().toUpperCase(),dto.label,dto.category,dto.calculationMethod,JSON.stringify(dto.configuration),dto.effectiveFrom,dto.effectiveTo??null,dto.sourceTitle,dto.sourceUrl,dto.verifiedOn,dto.reason]);
      await this.audit(m,tenantId,actorId,'compliance.rule_change.created','statutory_rule_change',rows[0].id,{ruleCode:dto.ruleCode,effectiveFrom:dto.effectiveFrom});
      return rows[0];
    });
  }

  updateRuleChange(tenantId: string,actorId: string,id: string,dto: UpdateRuleChangeDto) {
    if(dto.effectiveTo && dto.effectiveFrom && dto.effectiveTo<dto.effectiveFrom) throw new BadRequestException('The effective end date cannot precede the start date.');
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query('SELECT * FROM tenant_statutory_rule_changes WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!rows.length) throw new NotFoundException('Rule change proposal not found.');
      if(!['draft','rejected'].includes(rows[0].status)) throw new ConflictException('Only draft or rejected proposals can be edited.');
      const r=rows[0];
      if(dto.calculationMethod && dto.calculationMethod!==r.calculation_method) throw new BadRequestException('Changing the calculation method requires a reviewed payroll-engine implementation.');
      if(dto.category && dto.category!==r.category) throw new BadRequestException('A rule change cannot change the statutory category.');
      const effectiveFrom=dto.effectiveFrom??String(r.effective_from).slice(0,10);
      const effectiveTo=dto.effectiveTo===undefined?(r.effective_to?String(r.effective_to).slice(0,10):null):dto.effectiveTo;
      if(effectiveTo && effectiveTo<effectiveFrom) throw new BadRequestException('The effective end date cannot precede the start date.');
      const result=await m.query(`
        UPDATE tenant_statutory_rule_changes SET label=$3,category=$4,calculation_method=$5,configuration=$6::jsonb,
          effective_from=$7,effective_to=$8,source_title=$9,source_url=$10,verified_on=$11,reason=$12,status='draft',
          submission_notes=NULL,review_notes=NULL,submitted_by=NULL,submitted_at=NULL,reviewed_by=NULL,reviewed_at=NULL,updated_at=now()
        WHERE tenant_id=$1 AND id=$2 RETURNING id,status
      `,[tenantId,id,dto.label??r.label,dto.category??r.category,dto.calculationMethod??r.calculation_method,
        JSON.stringify(dto.configuration??r.configuration),effectiveFrom,effectiveTo,
        dto.sourceTitle??r.source_title,dto.sourceUrl??r.source_url,dto.verifiedOn??r.verified_on,dto.reason??r.reason]);
      await this.audit(m,tenantId,actorId,'compliance.rule_change.updated','statutory_rule_change',id,{});
      return result[0];
    });
  }

  submitRuleChange(tenantId: string,actorId: string,id: string,notes: string) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query("UPDATE tenant_statutory_rule_changes SET status='submitted',submission_notes=$3,submitted_by=$4,submitted_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status IN ('draft','rejected') RETURNING id,rule_code AS \"ruleCode\",status",[tenantId,id,notes,actorId]);
      if(!rows.length) throw new ConflictException('Only a draft or rejected rule proposal can be submitted.');
      await this.audit(m,tenantId,actorId,'compliance.rule_change.submitted','statutory_rule_change',id,{});
      return rows[0];
    });
  }

  decideRuleChange(tenantId: string,actorId: string,id: string,decision:'approve'|'reject',dto:ReviewDecisionDto) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query('SELECT * FROM tenant_statutory_rule_changes WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!rows.length) throw new NotFoundException('Rule change proposal not found.');
      const change=rows[0];
      if(change.status!=='submitted') throw new ConflictException('Only a submitted rule change can be decided.');
      if(change.submitted_by===actorId) throw new BadRequestException('Separation of duties: the submitter cannot approve their own rule change.');
      if(decision==='approve'){
        const baseRule=await m.query('SELECT category,calculation_method FROM statutory_rules WHERE rule_set_id=$1 AND code=$2 AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $3::date) ORDER BY effective_from DESC LIMIT 1',[change.rule_set_id,change.rule_code,change.effective_from]);
        if(!baseRule.length || baseRule[0].category!==change.category || baseRule[0].calculation_method!==change.calculation_method) throw new ConflictException('The statutory rule baseline changed or no longer supports this proposal. Recreate the proposal against the current published ruleset.');
        const review=await m.query("SELECT id FROM tenant_statutory_rule_reviews WHERE tenant_id=$1 AND rule_set_id=$2 AND status='approved' AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $3::date) ORDER BY effective_from DESC LIMIT 1",[tenantId,change.rule_set_id,change.effective_from]);
        if(!review.length) throw new ConflictException('Approve the applicable statutory ruleset review before approving a rule change.');
        const overlap=await m.query(`
          SELECT id FROM tenant_statutory_rule_overrides
          WHERE tenant_id=$1 AND rule_set_id=$2 AND rule_code=$3
            AND daterange(effective_from,effective_to,'[]')
              && daterange($4::date,$5::date,'[]')
          LIMIT 1
        `,[tenantId,change.rule_set_id,change.rule_code,change.effective_from,change.effective_to]);
        if(overlap.length) throw new ConflictException('An approved rule override already overlaps these effective dates. Amend the existing effective-dated schedule instead of creating a conflicting version.');
        const overrides=await m.query(`
          INSERT INTO tenant_statutory_rule_overrides
            (tenant_id,rule_set_id,rule_code,label,category,calculation_method,configuration,effective_from,effective_to,reason,approved_by,status,submitted_by,reviewed_at,review_notes,source_title,source_url,verified_on)
          VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,'approved',$12,now(),$13,$14,$15,$16)
          RETURNING id
        `,[tenantId,change.rule_set_id,change.rule_code,change.label,change.category,change.calculation_method,JSON.stringify(change.configuration),change.effective_from,change.effective_to,change.reason,actorId,change.submitted_by,dto.notes,change.source_title,change.source_url,change.verified_on]);
        await m.query("UPDATE tenant_statutory_rule_changes SET status='approved',review_notes=$3,reviewed_by=$4,reviewed_at=now(),applied_override_id=$5,updated_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,id,dto.notes,actorId,overrides[0].id]);
      }else{
        await m.query("UPDATE tenant_statutory_rule_changes SET status='rejected',review_notes=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,id,dto.notes,actorId]);
      }
      await this.audit(m,tenantId,actorId,'compliance.rule_change_'+decision,'statutory_rule_change',id,{ruleCode:change.rule_code,notes:dto.notes});
      return {id,status:decision==='approve'?'approved':'rejected'};
    });
  }

  listFilings(tenantId: string) {
    return this.tenantDb.run(tenantId,m=>m.query(`
      SELECT f.id,f.authority,f.filing_type AS "filingType",f.reference_period AS "referencePeriod",
        f.due_date::text AS "dueDate",f.status,f.currency,f.totals,f.external_reference AS "externalReference",
        f.submission_channel AS "submissionChannel",f.prepared_at AS "preparedAt",f.reviewed_at AS "reviewedAt",
        f.submitted_at AS "submittedAt",f.accepted_at AS "acceptedAt",f.rejected_at AS "rejectedAt",
        f.payroll_period_id AS "payrollPeriodId",f.payroll_run_id AS "payrollRunId",f.created_at AS "createdAt"
      FROM statutory_filing_records f WHERE f.tenant_id=$1 ORDER BY f.due_date NULLS LAST,f.created_at DESC
    `,[tenantId]));
  }

  prepareFiling(tenantId: string,actorId: string,dto:CreateFilingDto) {
    return this.tenantDb.run(tenantId,async m=>{
      const runs=await m.query(`
        SELECT r.id,r.status,r.totals,r.period_id,p.code AS period_code,p.start_date::text AS start_date,p.end_date::text AS end_date
        FROM payroll_runs r JOIN payroll_periods p ON p.tenant_id=r.tenant_id AND p.id=r.period_id
        WHERE r.tenant_id=$1 AND r.id=$2 AND r.period_id=$3
      `,[tenantId,dto.payrollRunId,dto.payrollPeriodId]);
      if(!runs.length) throw new NotFoundException('Payroll run and period combination not found.');
      if(!['approved','finalized'].includes(runs[0].status)) throw new ConflictException('A statutory filing can only be prepared from an approved or finalized payroll run.');
      const sourceItems=await m.query('SELECT calculation_snapshot AS snapshot FROM payroll_run_items WHERE tenant_id=$1 AND payroll_run_id=$2 ORDER BY id',[tenantId,dto.payrollRunId]);
      const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
      const employees=sourceItems.map((row:any)=>{
        const snap=row.snapshot??{};
        const statutory=snap.statutory??{};
        let lines:Array<{code:string;side:'employee'|'employer';amount:number}>=[];
        if(dto.authority==='KRA') lines=[{code:'PAYE',side:'employee',amount:Number(statutory.paye??0)}];
        else if(dto.authority==='NSSF') lines=[{code:'NSSF',side:'employee',amount:Number(statutory.nssf??0)},{code:'NSSF_EMPLOYER',side:'employer',amount:Number(statutory.employerNssf??0)}];
        else if(dto.authority==='SHA') lines=[{code:'SHIF',side:'employee',amount:Number(statutory.shif??0)}];
        else if(dto.authority==='HOUSING_LEVY') lines=[{code:'AHL',side:'employee',amount:Number(statutory.housingLevy??0)},{code:'AHL_EMPLOYER',side:'employer',amount:Number(statutory.employerHousingLevy??0)}];
        else if(dto.authority==='NITA') lines=[{code:'NITA',side:'employer',amount:Number(statutory.nita??0)}];
        else lines=(Array.isArray(statutory.lines)?statutory.lines:[]).map((line:any)=>({code:String(line.code),side:line.side==='employer'?'employer':'employee',amount:Number(line.amount??0)}));
        return {worker:snap.worker??{},grossEarnings:Number(snap.earnings?.grossPay??snap.earnings?.amount??0),netPay:Number(snap.netPay??0),taxableIncome:Number(statutory.taxableIncome??0),lines};
      });
      const totals={
        employeeCount:employees.length,
        grossEarnings:round(employees.reduce((sum:any,e:any)=>sum+e.grossEarnings,0)),
        employeeStatutoryAmount:round(employees.reduce((sum:any,e:any)=>sum+e.lines.filter((l:any)=>l.side==='employee').reduce((n:number,l:any)=>n+l.amount,0),0)),
        employerStatutoryAmount:round(employees.reduce((sum:any,e:any)=>sum+e.lines.filter((l:any)=>l.side==='employer').reduce((n:number,l:any)=>n+l.amount,0),0)),
        netPay:round(employees.reduce((sum:any,e:any)=>sum+e.netPay,0)),
      };
      const snapshot={authority:dto.authority,filingType:dto.filingType,period:{code:runs[0].period_code,startDate:runs[0].start_date,endDate:runs[0].end_date},payrollRunId:dto.payrollRunId,totals,employeeCount:employees.length,employees};
      const rows=await m.query(`
        INSERT INTO statutory_filing_records
          (tenant_id,payroll_period_id,payroll_run_id,authority,filing_type,reference_period,due_date,status,currency,totals,report_snapshot,preparation_notes,prepared_by,prepared_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,'prepared','KES',$8::jsonb,$9::jsonb,$10,$11,now())
        RETURNING id,authority,filing_type AS "filingType",reference_period AS "referencePeriod",due_date::text AS "dueDate",status,totals,prepared_at AS "preparedAt"
      `,[tenantId,dto.payrollPeriodId,dto.payrollRunId,dto.authority,dto.filingType,runs[0].period_code,dto.dueDate??null,JSON.stringify(totals),JSON.stringify(snapshot),dto.preparationNotes??null,actorId]);
      await this.audit(m,tenantId,actorId,'compliance.filing.prepared','statutory_filing',rows[0].id,{authority:dto.authority,filingType:dto.filingType,period:runs[0].period_code});
      return rows[0];
    });
  }

  requestFilingReview(tenantId:string,actorId:string,id:string) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query("UPDATE statutory_filing_records SET status='in_review',updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status='prepared' RETURNING id,prepared_by",[tenantId,id]);
      if(!rows.length) throw new ConflictException('Only a prepared filing can be sent for review.');
      await this.audit(m,tenantId,actorId,'compliance.filing.review_requested','statutory_filing',id,{});
      return {id,status:'in_review'};
    });
  }

  decideFiling(tenantId:string,actorId:string,id:string,decision:'approve'|'reject',dto:FilingRejectionDto) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query('SELECT * FROM statutory_filing_records WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!rows.length) throw new NotFoundException('Statutory filing not found.');
      const filing=rows[0];
      if(filing.status!=='in_review') throw new ConflictException('Only a filing in review can be approved or rejected.');
      if(filing.prepared_by===actorId) throw new BadRequestException('Separation of duties: the preparer cannot approve their own filing.');
      if(decision==='approve'){
        await m.query("UPDATE statutory_filing_records SET status='approved',review_notes=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,id,dto.reason,actorId]);
      }else{
        await m.query("UPDATE statutory_filing_records SET status='rejected',review_notes=$3,rejected_at=now(),rejection_reason=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,id,dto.reason,actorId]);
      }
      await this.audit(m,tenantId,actorId,'compliance.filing_'+decision,'statutory_filing',id,{reason:dto.reason});
      return {id,status:decision==='approve'?'approved':'rejected'};
    });
  }

  recordFilingSubmission(tenantId:string,actorId:string,id:string,dto:SubmitFilingDto) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query(`
        UPDATE statutory_filing_records SET status='submitted',external_reference=$3,submission_channel=$4,
          submission_evidence_url=$5,submitted_by=$6,submitted_at=now(),updated_at=now()
        WHERE tenant_id=$1 AND id=$2 AND status='approved' AND prepared_by IS DISTINCT FROM $6 AND reviewed_by IS DISTINCT FROM $6
        RETURNING id,status,external_reference AS "externalReference",submitted_at AS "submittedAt"
      `,[tenantId,id,dto.externalReference,dto.submissionChannel,dto.submissionEvidenceUrl??null,actorId]);
      if(!rows.length) throw new ConflictException('Only an approved filing can be recorded as submitted. Record the reference returned by the authority.');
      await this.audit(m,tenantId,actorId,'compliance.filing.submission_recorded','statutory_filing',id,{externalReference:dto.externalReference,channel:dto.submissionChannel});
      return {...rows[0],submissionRecorded:true,authorityIntegration:'manual_record_only'};
    });
  }

  recordFilingAcceptance(tenantId:string,actorId:string,id:string,accepted:boolean,reason?:string) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query(`
        UPDATE statutory_filing_records SET status=$3,accepted_at=CASE WHEN $3='accepted' THEN now() ELSE accepted_at END,
          rejected_at=CASE WHEN $3='rejected' THEN now() ELSE rejected_at END,rejection_reason=$4,
          updated_at=now()
        WHERE tenant_id=$1 AND id=$2 AND status='submitted' RETURNING id,status,accepted_at AS "acceptedAt",rejected_at AS "rejectedAt"
      `,[tenantId,id,accepted?'accepted':'rejected',reason??null]);
      if(!rows.length) throw new ConflictException('Only a recorded submission can receive an authority response.');
      await this.audit(m,tenantId,actorId,accepted?'compliance.filing.accepted':'compliance.filing.authority_rejected','statutory_filing',id,{reason:reason??null});
      return rows[0];
    });
  }

  getFiling(tenantId:string,id:string) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query('SELECT id,authority,filing_type AS "filingType",reference_period AS "referencePeriod",due_date::text AS "dueDate",status,currency,totals,report_snapshot AS "reportSnapshot",preparation_notes AS "preparationNotes",review_notes AS "reviewNotes",external_reference AS "externalReference",submission_channel AS "submissionChannel",submission_evidence_url AS "submissionEvidenceUrl",prepared_at AS "preparedAt",reviewed_at AS "reviewedAt",submitted_at AS "submittedAt",accepted_at AS "acceptedAt",rejected_at AS "rejectedAt",rejection_reason AS "rejectionReason" FROM statutory_filing_records WHERE tenant_id=$1 AND id=$2',[tenantId,id]);
      if(!rows.length) throw new NotFoundException('Statutory filing not found.');
      return rows[0];
    });
  }

  listAudit(tenantId:string,limit=100) {
    const safeLimit=Math.max(1,Math.min(250,Number.isFinite(limit)?Math.floor(limit):100));
    return this.tenantDb.run(tenantId,m=>m.query(`
      SELECT e.id,e.actor_user_id AS "actorUserId",u.full_name AS "actorName",u.email AS "actorEmail",
        e.action,e.entity_type AS "entityType",e.entity_id AS "entityId",e.metadata,e.created_at AS "createdAt"
      FROM audit_events e LEFT JOIN platform_users u ON u.id=e.actor_user_id
      WHERE e.tenant_id=$1 AND (e.action LIKE 'compliance.%' OR e.entity_type IN ('statutory_rule_review','statutory_rule_change','statutory_filing'))
      ORDER BY e.created_at DESC LIMIT $2
    `,[tenantId,safeLimit]));
  }

  private async audit(m:any,tenantId:string,actorId:string,action:string,entityType:string,entityId:string,metadata:Record<string,unknown>) {
    await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[tenantId,actorId,action,entityType,entityId,JSON.stringify(metadata)]);
  }
}
