import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';
import type { Request } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import { CreateBranchDto, CreateCostCentreDto, CreateDepartmentDto, CreateWorkerAssignmentDto } from './organization.dto';
import { OrganizationService } from './organization.service';

type TenantRequest=Request & {tenant:{id:string;userId:string}};
class EndAssignmentDto { @IsDateString() effectiveTo!:string; }
@ApiTags('organization')
@ApiBearerAuth()
@Controller('tenant/organization')
export class OrganizationController {
  constructor(private readonly organization:OrganizationService){}
  @Get('branches') @TenantPermissions('company.read') branches(@Req() req:TenantRequest){return this.organization.listBranches(req.tenant.id);}
  @Post('branches') @TenantPermissions('company.manage') createBranch(@Req() req:TenantRequest,@Body() dto:CreateBranchDto){return this.organization.createBranch(req.tenant.id,dto);}
  @Get('departments') @TenantPermissions('company.read') departments(@Req() req:TenantRequest){return this.organization.listDepartments(req.tenant.id);}
  @Post('departments') @TenantPermissions('company.manage') createDepartment(@Req() req:TenantRequest,@Body() dto:CreateDepartmentDto){return this.organization.createDepartment(req.tenant.id,dto);}
  @Get('cost-centres') @TenantPermissions('company.read') costCentres(@Req() req:TenantRequest){return this.organization.listCostCentres(req.tenant.id);}
  @Post('cost-centres') @TenantPermissions('company.manage') createCostCentre(@Req() req:TenantRequest,@Body() dto:CreateCostCentreDto){return this.organization.createCostCentre(req.tenant.id,dto);}
  @Get('worker-assignments') @TenantPermissions('workers.read') assignments(@Req() req:TenantRequest,@Query('workerId') workerId?:string){return this.organization.listWorkerAssignments(req.tenant.id,workerId);}
  @Post('worker-assignments') @TenantPermissions('workers.manage') createAssignment(@Req() req:TenantRequest,@Body() dto:CreateWorkerAssignmentDto){return this.organization.createWorkerAssignment(req.tenant.id,req.tenant.userId,dto);}
  @Patch('worker-assignments/:id/end') @TenantPermissions('workers.manage') endAssignment(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:EndAssignmentDto){return this.organization.endWorkerAssignment(req.tenant.id,id,dto.effectiveTo);}
}
