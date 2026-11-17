import { ConflictException } from '@nestjs/common';
import { PayrollService } from './payroll.service';

const tenantId='123e4567-e89b-42d3-a456-426614174000';
const actorId='123e4567-e89b-42d3-a456-426614174001';
const runId='123e4567-e89b-42d3-a456-426614174002';

function makeService(query: jest.Mock) {
  const manager={query};
  const tenantDb={run:jest.fn(async(_tenant:string,work:(m:{query:jest.Mock})=>Promise<unknown>)=>work(manager))};
  return new PayrollService(tenantDb as never);
}

describe('Payroll CRUD safeguards',()=>{
  it('does not allow deletion of finalized payroll runs',async()=>{
    const query=jest.fn().mockResolvedValueOnce([{id:runId,status:'finalized'}]);
    const service=makeService(query);
    await expect(service.deleteRun(tenantId,actorId,runId)).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('deletes only an eligible draft run and its calculation items with an audit event',async()=>{
    const query=jest.fn()
      .mockResolvedValueOnce([{id:runId,status:'draft',period_id:'period-1',run_number:1}])
      .mockResolvedValueOnce([{count:0}])
      .mockResolvedValueOnce([{count:0}])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const service=makeService(query);
    await expect(service.deleteRun(tenantId,actorId,runId)).resolves.toEqual({id:runId,deleted:true});
    expect(query.mock.calls[3][0]).toContain('DELETE FROM payroll_run_items');
    expect(query.mock.calls[4][0]).toContain('payroll.run.deleted');
    expect(query.mock.calls[5][0]).toContain('DELETE FROM payroll_runs');
  });

  it('records a rejection reason and moves a submitted run back to the rejected state',async()=>{
    const query=jest.fn()
      .mockResolvedValueOnce([{id:runId,status:'submitted',created_by:'creator',submitted_by:'submitter'}])
      .mockResolvedValueOnce([{id:runId,status:'rejected'}])
      .mockResolvedValueOnce([]);
    const service=makeService(query);
    await expect(service.transitionRun(tenantId,actorId,runId,'reject','Please correct the attendance inputs.'))
      .resolves.toEqual({id:runId,status:'rejected'});
    expect(query.mock.calls[1][0]).toContain("status='rejected'");
    expect(query.mock.calls[1][1]).toContain('Please correct the attendance inputs.');
  });

  it('does not allow a payroll creator to reject their own run',async()=>{
    const query=jest.fn().mockResolvedValueOnce([{id:runId,status:'submitted',created_by:actorId,submitted_by:'submitter'}]);
    const service=makeService(query);
    await expect(service.transitionRun(tenantId,actorId,runId,'reject','Please correct this payroll.'))
      .rejects.toThrow('Separation of duties');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
