import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { CreateBranchDto, CreateCostCentreDto, CreateDepartmentDto, CreateWorkerAssignmentDto, UpdateBranchDto, UpdateCostCentreDto, UpdateDepartmentDto, UpdateWorkerAssignmentDto } from './organization.dto';

@Injectable()
export class OrganizationService {
  constructor(private readonly tenantDb: TenantTransactionService) {}
  listBranches(tenantId: string) { return this.tenantDb.run(tenantId, m => m.query('SELECT id,code,name,address,status FROM tenant_branches WHERE tenant_id=$1 ORDER BY name',[tenantId])); }
  createBranch(tenantId: string, actorId: string, dto: CreateBranchDto) { return this.tenantDb.run(tenantId, async m => { const row=(await m.query('INSERT INTO tenant_branches(tenant_id,code,name,address) VALUES($1,$2,$3,$4) RETURNING id,code,name,address,status',[tenantId,dto.code.trim(),dto.name.trim(),dto.address?.trim()||null]))[0]; await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'organization.branch.created','tenant_branch',$3,$4::jsonb)",[tenantId,actorId,row.id,JSON.stringify(row)]); return row; }); }
  listDepartments(tenantId: string) { return this.tenantDb.run(tenantId, m => m.query('SELECT id,branch_id AS "branchId",code,name,status FROM tenant_departments WHERE tenant_id=$1 ORDER BY name',[tenantId])); }
  createDepartment(tenantId: string, actorId: string, dto: CreateDepartmentDto) { return this.tenantDb.run(tenantId, async m => { const row=(await m.query('INSERT INTO tenant_departments(tenant_id,branch_id,code,name) VALUES($1,$2,$3,$4) RETURNING id,branch_id AS "branchId",code,name,status',[tenantId,dto.branchId??null,dto.code.trim(),dto.name.trim()]))[0]; await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'organization.department.created','tenant_department',$3,$4::jsonb)",[tenantId,actorId,row.id,JSON.stringify(row)]); return row; }); }
  listCostCentres(tenantId: string) { return this.tenantDb.run(tenantId, m => m.query('SELECT id,code,name,status FROM tenant_cost_centres WHERE tenant_id=$1 ORDER BY name',[tenantId])); }
  createCostCentre(tenantId: string, actorId: string, dto: CreateCostCentreDto) { return this.tenantDb.run(tenantId, async m => { const row=(await m.query('INSERT INTO tenant_cost_centres(tenant_id,code,name) VALUES($1,$2,$3) RETURNING id,code,name,status',[tenantId,dto.code.trim(),dto.name.trim()]))[0]; await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'organization.cost_centre.created','tenant_cost_centre',$3,$4::jsonb)",[tenantId,actorId,row.id,JSON.stringify(row)]); return row; }); }
  listWorkerAssignments(tenantId: string, workerId?: string) { return this.tenantDb.run(tenantId, m => m.query('SELECT id,worker_id AS "workerId",branch_id AS "branchId",department_id AS "departmentId",cost_centre_id AS "costCentreId",project_id AS "projectId",site_id AS "siteId",effective_from AS "effectiveFrom",effective_to AS "effectiveTo",status FROM worker_assignments WHERE tenant_id=$1 AND ($2::uuid IS NULL OR worker_id=$2) ORDER BY effective_from DESC LIMIT 1000',[tenantId,workerId??null])); }
  createWorkerAssignment(tenantId: string, actorId: string, dto: CreateWorkerAssignmentDto) {
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) throw new BadRequestException('Assignment end date must not precede its start date.');
    return this.tenantDb.run(tenantId, async m => {
      const rows = await m.query('INSERT INTO worker_assignments(tenant_id,worker_id,branch_id,department_id,cost_centre_id,project_id,site_id,effective_from,effective_to,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,worker_id AS "workerId",branch_id AS "branchId",department_id AS "departmentId",cost_centre_id AS "costCentreId",project_id AS "projectId",site_id AS "siteId",effective_from AS "effectiveFrom",effective_to AS "effectiveTo",status',[tenantId,dto.workerId,dto.branchId??null,dto.departmentId??null,dto.costCentreId??null,dto.projectId??null,dto.siteId??null,dto.effectiveFrom,dto.effectiveTo??null,actorId]);
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'worker.assignment.created','worker_assignment',$3,$4::jsonb)",[tenantId,actorId,rows[0].id,JSON.stringify({workerId:dto.workerId,effectiveFrom:dto.effectiveFrom,effectiveTo:dto.effectiveTo??null})]);
      return rows[0];
    });
  }
  endWorkerAssignment(tenantId:string,actorId:string,id:string,effectiveTo:string) {
    return this.tenantDb.run(tenantId,async m=>{
      const beforeRows=await m.query('SELECT id,worker_id AS "workerId",effective_from::text AS "effectiveFrom",effective_to::text AS "effectiveTo",status FROM worker_assignments WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!beforeRows.length) throw new NotFoundException('Worker assignment not found.');
      if(beforeRows[0].status!=='active') throw new BadRequestException('Only active assignments can be ended.');
      const rows=await m.query("UPDATE worker_assignments SET status='ended',effective_to=$3 WHERE tenant_id=$1 AND id=$2 AND status='active' AND $3::date >= effective_from RETURNING id,status,effective_to AS \"effectiveTo\"",[tenantId,id,effectiveTo]);
      if(!rows.length) throw new BadRequestException('Assignment end date must not precede its start date.');
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'worker.assignment.ended','worker_assignment',$3,$4::jsonb)",[tenantId,actorId,id,JSON.stringify({before:beforeRows[0],after:rows[0]})]);
      return rows[0];
    });
  }

  deleteWorkerAssignment(tenantId:string,actorId:string,id:string) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query('SELECT id,worker_id AS "workerId",branch_id AS "branchId",department_id AS "departmentId",cost_centre_id AS "costCentreId",project_id AS "projectId",site_id AS "siteId",effective_from::text AS "effectiveFrom",effective_to::text AS "effectiveTo",status FROM worker_assignments WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!rows.length) throw new NotFoundException('Worker assignment not found.');
      try { await m.query('DELETE FROM worker_assignments WHERE tenant_id=$1 AND id=$2',[tenantId,id]); }
      catch(error) {
        if(typeof error==='object' && error!==null && 'code' in error && (error as {code?:string}).code==='23503') throw new BadRequestException('This assignment is referenced by other records and cannot be deleted. End it instead to preserve payroll history.');
        throw error;
      }
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'worker.assignment.deleted','worker_assignment',$3,$4::jsonb)",[tenantId,actorId,id,JSON.stringify({deleted:rows[0]})]);
      return {id,deleted:true};
    });
  }

  getBranch(tenantId:string,id:string) { return this.tenantDb.run(tenantId,async m=>{ const rows=await m.query('SELECT id,code,name,address,status,created_at AS "createdAt",updated_at AS "updatedAt" FROM tenant_branches WHERE tenant_id=$1 AND id=$2',[tenantId,id]); if(!rows.length) throw new NotFoundException('Branch not found.'); return rows[0]; }); }
  updateBranch(tenantId:string,actorId:string,id:string,dto:UpdateBranchDto) { return this.tenantDb.run(tenantId,async m=>{
    const current=await m.query('SELECT code,name,address,status FROM tenant_branches WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]); if(!current.length) throw new NotFoundException('Branch not found.');
    const before=current[0]; const code=dto.code===undefined?before.code:dto.code.trim(); const name=dto.name===undefined?before.name:dto.name.trim(); const address=dto.address===undefined?before.address:dto.address; const status=dto.status??before.status;
    if(!['active','inactive'].includes(status)) throw new BadRequestException('Branch status must be active or inactive.');
    const rows=await m.query('UPDATE tenant_branches SET code=$3,name=$4,address=$5,status=$6,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,code,name,address,status,updated_at AS "updatedAt"',[tenantId,id,code,name,address,status]);
    await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'organization.branch.updated','tenant_branch',$3,$4::jsonb)",[tenantId,actorId,id,JSON.stringify({before,after:rows[0]})]); return rows[0];
  }); }
  archiveBranch(tenantId:string,actorId:string,id:string) { return this.tenantDb.run(tenantId,async m=>{
    const used=await m.query("SELECT 1 FROM tenant_departments WHERE tenant_id=$1 AND branch_id=$2 AND status='active' UNION ALL SELECT 1 FROM worker_assignments WHERE tenant_id=$1 AND branch_id=$2 AND status='active' LIMIT 1",[tenantId,id]);
    if(used.length) throw new BadRequestException('Move or end active department and worker assignments before archiving this branch.');
    const rows=await m.query("UPDATE tenant_branches SET status='inactive',updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status",[tenantId,id]); if(!rows.length) throw new NotFoundException('Branch not found.');
    await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'organization.branch.archived','tenant_branch',$3)",[tenantId,actorId,id]); return rows[0];
  }); }
  getDepartment(tenantId:string,id:string) { return this.tenantDb.run(tenantId,async m=>{const rows=await m.query('SELECT id,branch_id AS "branchId",code,name,status,created_at AS "createdAt",updated_at AS "updatedAt" FROM tenant_departments WHERE tenant_id=$1 AND id=$2',[tenantId,id]); if(!rows.length) throw new NotFoundException('Department not found.'); return rows[0];}); }
  updateDepartment(tenantId:string,actorId:string,id:string,dto:UpdateDepartmentDto) { return this.tenantDb.run(tenantId,async m=>{
    const current=await m.query('SELECT branch_id AS "branchId",code,name,status FROM tenant_departments WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]); if(!current.length) throw new NotFoundException('Department not found.');
    const before=current[0]; const code=dto.code===undefined?before.code:dto.code.trim(); const name=dto.name===undefined?before.name:dto.name.trim(); const branchId=dto.branchId===undefined?before.branchId:dto.branchId; const status=dto.status??before.status;
    if(!['active','inactive'].includes(status)) throw new BadRequestException('Department status must be active or inactive.');
    if(branchId){const branch=await m.query("SELECT id FROM tenant_branches WHERE tenant_id=$1 AND id=$2 AND status='active'",[tenantId,branchId]);if(!branch.length)throw new BadRequestException('The selected branch is not active in this workspace.');}
    const rows=await m.query('UPDATE tenant_departments SET code=$3,name=$4,branch_id=$5,status=$6,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,branch_id AS "branchId",code,name,status,updated_at AS "updatedAt"',[tenantId,id,code,name,branchId,status]);
    await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'organization.department.updated','tenant_department',$3,$4::jsonb)",[tenantId,actorId,id,JSON.stringify({before,after:rows[0]})]); return rows[0];
  }); }
  archiveDepartment(tenantId:string,actorId:string,id:string) { return this.tenantDb.run(tenantId,async m=>{
    const used=await m.query("SELECT 1 FROM worker_assignments WHERE tenant_id=$1 AND department_id=$2 AND status='active' LIMIT 1",[tenantId,id]); if(used.length) throw new BadRequestException('End or reassign active workers before archiving this department.');
    const rows=await m.query("UPDATE tenant_departments SET status='inactive',updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status",[tenantId,id]); if(!rows.length) throw new NotFoundException('Department not found.');
    await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'organization.department.archived','tenant_department',$3)",[tenantId,actorId,id]); return rows[0];
  }); }
  getCostCentre(tenantId:string,id:string) { return this.tenantDb.run(tenantId,async m=>{const rows=await m.query('SELECT id,code,name,status,created_at AS "createdAt",updated_at AS "updatedAt" FROM tenant_cost_centres WHERE tenant_id=$1 AND id=$2',[tenantId,id]); if(!rows.length) throw new NotFoundException('Cost centre not found.'); return rows[0];}); }
  updateCostCentre(tenantId:string,actorId:string,id:string,dto:UpdateCostCentreDto) { return this.tenantDb.run(tenantId,async m=>{
    const current=await m.query('SELECT code,name,status FROM tenant_cost_centres WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]); if(!current.length) throw new NotFoundException('Cost centre not found.');
    const before=current[0]; const code=dto.code===undefined?before.code:dto.code.trim(); const name=dto.name===undefined?before.name:dto.name.trim(); const status=dto.status??before.status;
    if(!['active','inactive'].includes(status)) throw new BadRequestException('Cost centre status must be active or inactive.');
    const rows=await m.query('UPDATE tenant_cost_centres SET code=$3,name=$4,status=$5,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,code,name,status,updated_at AS "updatedAt"',[tenantId,id,code,name,status]);
    await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'organization.cost_centre.updated','tenant_cost_centre',$3,$4::jsonb)",[tenantId,actorId,id,JSON.stringify({before,after:rows[0]})]); return rows[0];
  }); }
  archiveCostCentre(tenantId:string,actorId:string,id:string) { return this.tenantDb.run(tenantId,async m=>{
    const used=await m.query("SELECT 1 FROM worker_assignments WHERE tenant_id=$1 AND cost_centre_id=$2 AND status='active' LIMIT 1",[tenantId,id]); if(used.length) throw new BadRequestException('End or reassign active workers before archiving this cost centre.');
    const rows=await m.query("UPDATE tenant_cost_centres SET status='inactive',updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status",[tenantId,id]); if(!rows.length) throw new NotFoundException('Cost centre not found.');
    await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'organization.cost_centre.archived','tenant_cost_centre',$3)",[tenantId,actorId,id]); return rows[0];
  }); }

  getWorkerAssignment(tenantId:string,id:string) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query(`SELECT id,worker_id AS "workerId",branch_id AS "branchId",department_id AS "departmentId",
        cost_centre_id AS "costCentreId",project_id AS "projectId",site_id AS "siteId",
        effective_from AS "effectiveFrom",effective_to AS "effectiveTo",status,created_by AS "createdBy",created_at AS "createdAt"
        FROM worker_assignments WHERE tenant_id=$1 AND id=$2`,[tenantId,id]);
      if(!rows.length) throw new NotFoundException('Worker assignment not found.');
      return rows[0];
    });
  }

  updateWorkerAssignment(tenantId:string,actorId:string,id:string,dto:UpdateWorkerAssignmentDto) {
    if(dto.effectiveFrom && dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) {
      throw new BadRequestException('Assignment end date must not precede its start date.');
    }
    return this.tenantDb.run(tenantId,async m=>{
      const currentRows=await m.query(`SELECT id,worker_id AS "workerId",branch_id AS "branchId",department_id AS "departmentId",
        cost_centre_id AS "costCentreId",project_id AS "projectId",site_id AS "siteId",
        effective_from::text AS "effectiveFrom",effective_to::text AS "effectiveTo",status
        FROM worker_assignments WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,[tenantId,id]);
      if(!currentRows.length) throw new NotFoundException('Worker assignment not found.');
      const before=currentRows[0];
      if(before.status!=='active') throw new BadRequestException('Ended assignments are immutable. Create a new effective-dated assignment instead.');
      const after={
        workerId:dto.workerId===undefined?before.workerId:dto.workerId,
        branchId:dto.branchId===undefined?before.branchId:dto.branchId,
        departmentId:dto.departmentId===undefined?before.departmentId:dto.departmentId,
        costCentreId:dto.costCentreId===undefined?before.costCentreId:dto.costCentreId,
        projectId:dto.projectId===undefined?before.projectId:dto.projectId,
        siteId:dto.siteId===undefined?before.siteId:dto.siteId,
        effectiveFrom:dto.effectiveFrom??before.effectiveFrom,
        effectiveTo:dto.effectiveTo===undefined?before.effectiveTo:dto.effectiveTo,
      };
      if(after.effectiveTo && after.effectiveTo < after.effectiveFrom) throw new BadRequestException('Assignment end date must not precede its start date.');
      const rows=await m.query(`UPDATE worker_assignments SET worker_id=$3,branch_id=$4,department_id=$5,cost_centre_id=$6,
        project_id=$7,site_id=$8,effective_from=$9,effective_to=$10,
        status=CASE WHEN $10::date IS NOT NULL THEN 'ended' ELSE 'active' END
        WHERE tenant_id=$1 AND id=$2 RETURNING id,worker_id AS "workerId",branch_id AS "branchId",
        department_id AS "departmentId",cost_centre_id AS "costCentreId",project_id AS "projectId",site_id AS "siteId",
        effective_from AS "effectiveFrom",effective_to AS "effectiveTo",status`,
        [tenantId,id,after.workerId,after.branchId,after.departmentId,after.costCentreId,after.projectId,after.siteId,after.effectiveFrom,after.effectiveTo]);
      await m.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
        VALUES($1,$2,'worker.assignment.updated','worker_assignment',$3,$4::jsonb)`,
        [tenantId,actorId,id,JSON.stringify({before,after:rows[0]})]);
      return rows[0];
    });
  }

}
