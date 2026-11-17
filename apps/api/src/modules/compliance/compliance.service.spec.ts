import { BadRequestException, ConflictException } from '@nestjs/common';
import { ComplianceService } from './compliance.service';

describe('ComplianceService', () => {
  const tenantId='123e4567-e89b-42d3-a456-426614174000';
  const actorId='123e4567-e89b-42d3-a456-426614174001';
  const otherActor='123e4567-e89b-42d3-a456-426614174002';
  const ruleSetId='123e4567-e89b-42d3-a456-426614174003';
  const reviewId='123e4567-e89b-42d3-a456-426614174004';

  function service(query:jest.Mock) {
    const tenantDb={run:jest.fn(async (_tenant:string,work:(manager:{query:jest.Mock})=>Promise<unknown>)=>work({query}))};
    return new ComplianceService(tenantDb as never);
  }

  it('submits a ruleset review with a deterministic rule snapshot hash and audit event',async()=>{
    const query=jest.fn()
      .mockResolvedValueOnce([{id:ruleSetId,name:'Kenya statutory payroll baseline',version:'KE-2026.11'}])
      .mockResolvedValueOnce([{code:'PAYE',calculation_method:'progressive_annualized',configuration:{annualBands:[]}}])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:reviewId,status:'submitted'}])
      .mockResolvedValueOnce([]);
    const svc=service(query);
    await expect(svc.submitRuleReview(tenantId,actorId,ruleSetId,{
      effectiveFrom:'2026-11-01',submissionNotes:'Reviewed source references.',
    })).resolves.toMatchObject({id:reviewId,status:'submitted'});
    expect(query.mock.calls[3][0]).toContain('rules_snapshot_hash');
    expect(query.mock.calls[3][1][4]).toMatch(/^[a-f0-9]{64}$/);
    expect(query.mock.calls[4][1][2]).toBe('compliance.ruleset.review_submitted');
  });

  it('prevents a ruleset reviewer from approving their own submission',async()=>{
    const query=jest.fn().mockResolvedValueOnce([{id:reviewId,status:'submitted',submitted_by:actorId,rule_set_id:ruleSetId}]);
    const svc=service(query);
    await expect(svc.decideRuleReview(tenantId,actorId,reviewId,'approve',{notes:'Reviewed.'}))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('requires an independently approved ruleset before a rule change can be approved',async()=>{
    const changeId='123e4567-e89b-42d3-a456-426614174005';
    const query=jest.fn()
      .mockResolvedValueOnce([{id:changeId,status:'submitted',submitted_by:otherActor,rule_set_id:ruleSetId,rule_code:'PAYE',category:'tax',calculation_method:'progressive_annualized',effective_from:'2026-11-01'}])
      .mockResolvedValueOnce([{category:'tax',calculation_method:'progressive_annualized'}])
      .mockResolvedValueOnce([]);
    const svc=service(query);
    await expect(svc.decideRuleChange(tenantId,actorId,changeId,'approve',{notes:'Reviewed source.'}))
      .rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls[2][0]).toContain("status='approved'");
  });

  it('does not prepare a statutory filing from an unapproved payroll run',async()=>{
    const query=jest.fn().mockResolvedValueOnce([{id:'run-1',status:'calculated'}]);
    const svc=service(query);
    await expect(svc.prepareFiling(tenantId,actorId,{
      payrollPeriodId:'123e4567-e89b-42d3-a456-426614174006',
      payrollRunId:'123e4567-e89b-42d3-a456-426614174007',
      authority:'KRA',filingType:'PAYE',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('prevents the filing reviewer from recording the external submission',async()=>{
    const query=jest.fn().mockResolvedValueOnce([]);
    const svc=service(query);
    await expect(svc.recordFilingSubmission(tenantId,actorId,'123e4567-e89b-42d3-a456-426614174008',{
      externalReference:'KRA-REF-001',submissionChannel:'iTax',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls[0][0]).toContain('reviewed_by IS DISTINCT FROM');
  });
});
