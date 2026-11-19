import { BadRequestException } from '@nestjs/common';
import { OrganizationService } from './organization.service';

const tenantId='123e4567-e89b-42d3-a456-426614174000';
const actorId='123e4567-e89b-42d3-a456-426614174001';
const workerId='123e4567-e89b-42d3-a456-426614174002';

function makeService(query: jest.Mock) {
  const manager={query};
  const tenantDb={run:jest.fn(async(_tenant:string,work:(m:{query:jest.Mock})=>Promise<unknown>)=>work(manager))};
  return new OrganizationService(tenantDb as never);
}

describe('Organization assignment integrity',()=>{
  it('rejects inactive workers before inserting an assignment',async()=>{
    const query=jest.fn().mockResolvedValueOnce([]);
    const service=makeService(query);
    await expect(service.createWorkerAssignment(tenantId,actorId,{
      workerId,effectiveFrom:'2026-11-01',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("status='active'");
  });

  it('rejects a department that belongs to a different selected branch',async()=>{
    const query=jest.fn()
      .mockResolvedValueOnce([{id:workerId}])
      .mockResolvedValueOnce([{id:'branch-a'}])
      .mockResolvedValueOnce([{branch_id:'branch-b'}]);
    const service=makeService(query);
    await expect(service.createWorkerAssignment(tenantId,actorId,{
      workerId,branchId:'branch-a',departmentId:'department-b',effectiveFrom:'2026-11-01',
    })).rejects.toThrow('does not belong to the selected branch');
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('rejects a site that belongs to a different selected project',async()=>{
    const query=jest.fn()
      .mockResolvedValueOnce([{id:workerId}])
      .mockResolvedValueOnce([{id:'branch-a'}])
      .mockResolvedValueOnce([{branch_id:'branch-a'}])
      .mockResolvedValueOnce([{id:'cost-a'}])
      .mockResolvedValueOnce([{id:'project-a'}])
      .mockResolvedValueOnce([{project_id:'project-b'}]);
    const service=makeService(query);
    await expect(service.createWorkerAssignment(tenantId,actorId,{
      workerId,branchId:'branch-a',departmentId:'department-a',costCentreId:'cost-a',
      projectId:'project-a',siteId:'site-b',effectiveFrom:'2026-11-01',
    })).rejects.toThrow('does not belong to the selected project');
    expect(query).toHaveBeenCalledTimes(6);
  });

  it('requires an active branch when creating a department',async()=>{
    const query=jest.fn().mockResolvedValueOnce([]);
    const service=makeService(query);
    await expect(service.createDepartment(tenantId,actorId,{
      code:'OPS',name:'Operations',branchId:'branch-inactive',
    })).rejects.toThrow('branch is not active');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
