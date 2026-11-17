import { createHash } from 'crypto';
import { PayrollService } from './payroll.service';

describe('Payroll statutory compliance gate', () => {
  const tenantId='00000000-0000-4000-8000-000000000001';
  const rulesetId='00000000-0000-4000-8000-000000000002';
  const start='2026-11-01';
  const end='2026-11-30';

  it('blocks a statutory rule that becomes effective partway through a payroll period', async () => {
    const query=jest.fn().mockResolvedValueOnce([{code:'SHIF'}]);
    const service=new PayrollService({run:jest.fn()} as any);
    await expect((service as any).assertApprovedRulesSnapshot({query},tenantId,rulesetId,start,end))
      .rejects.toThrow(/changes during this payroll period/i);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('requires an approved ruleset review covering the entire payroll period', async () => {
    const query=jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const service=new PayrollService({run:jest.fn()} as any);
    await expect((service as any).assertApprovedRulesSnapshot({query},tenantId,rulesetId,start,end))
      .rejects.toThrow(/entire payroll period/i);
    expect(query).toHaveBeenNthCalledWith(3,expect.stringContaining("status='approved'"),[tenantId,rulesetId,start,end]);
  });

  it('rejects a ruleset whose statutory snapshot changed after approval', async () => {
    const currentRules=[{code:'PAYE',label:'PAYE',category:'tax',calculation_method:'progressive_annualized',configuration:{rate:0.2}}];
    const query=jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:'review-1',rules_snapshot_hash:'0'.repeat(64)}]).mockResolvedValueOnce(currentRules);
    const service=new PayrollService({run:jest.fn()} as any);
    await expect((service as any).assertApprovedRulesSnapshot({query},tenantId,rulesetId,start,end))
      .rejects.toThrow(/changed after compliance approval/i);
  });

  it('accepts an unchanged snapshot approved for the complete period', async () => {
    const currentRules=[{code:'PAYE',label:'PAYE',category:'tax',calculation_method:'progressive_annualized',configuration:{rate:0.2}}];
    const hash=createHash('sha256').update(JSON.stringify(currentRules)).digest('hex');
    const query=jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:'review-1',rules_snapshot_hash:hash}]).mockResolvedValueOnce(currentRules);
    const service=new PayrollService({run:jest.fn()} as any);
    await expect((service as any).assertApprovedRulesSnapshot({query},tenantId,rulesetId,start,end))
      .resolves.toMatchObject({id:'review-1'});
  });
});
