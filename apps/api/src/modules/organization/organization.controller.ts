import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';
import type { Request } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import { CreateBranchDto, CreateCostCentreDto, CreateDepartmentDto, CreateWorkerAssignmentDto, UpdateBranchDto, UpdateCostCentreDto, UpdateDepartmentDto, UpdateWorkerAssignmentDto } from './organization.dto';
import { OrganizationService } from './organization.service';

type TenantRequest = Request & { tenant: { id: string; userId: string } };
class EndAssignmentDto { @IsDateString() effectiveTo!: string; }

@ApiTags('organization')
@ApiBearerAuth()
@Controller('tenant/organization')
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}
  @Get('branches') @TenantPermissions('company.read') branches(@Req() req: TenantRequest) { return this.organization.listBranches(req.tenant.id); }
  @Post('branches') @TenantPermissions('company.manage') createBranch(@Req() req: TenantRequest, @Body() dto: CreateBranchDto) { return this.organization.createBranch(req.tenant.id,dto); }
  @Get('departments') @TenantPermissions('company.read') departments(@Req() req: TenantRequest) { return this.organization.listDepartments(req.tenant.id); }
  @Post('departments') @TenantPermissions('company.manage') createDepartment(@Req() req: TenantRequest, @Body() dto: CreateDepartmentDto) { return this.organization.createDepartment(req.tenant.id,dto); }
  @Get('cost-centres') @TenantPermissions('company.read') costCentres(@Req() req: TenantRequest) { return this.organization.listCostCentres(req.tenant.id); }
  @Post('cost-centres') @TenantPermissions('company.manage') createCostCentre(@Req() req: TenantRequest, @Body() dto: CreateCostCentreDto) { return this.organization.createCostCentre(req.tenant.id,dto); }

  @Get('branches/:id') @TenantPermissions('company.read') getBranch(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string){return this.organization.getBranch(req.tenant.id,id);}
  @Patch('branches/:id') @TenantPermissions('company.manage') updateBranch(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:UpdateBranchDto){return this.organization.updateBranch(req.tenant.id,req.tenant.userId,id,dto);}
  @Delete('branches/:id') @TenantPermissions('company.manage') archiveBranch(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string){return this.organization.archiveBranch(req.tenant.id,req.tenant.userId,id);}
  @Get('departments/:id') @TenantPermissions('company.read') getDepartment(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string){return this.organization.getDepartment(req.tenant.id,id);}
  @Patch('departments/:id') @TenantPermissions('company.manage') updateDepartment(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:UpdateDepartmentDto){return this.organization.updateDepartment(req.tenant.id,req.tenant.userId,id,dto);}
  @Delete('departments/:id') @TenantPermissions('company.manage') archiveDepartment(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string){return this.organization.archiveDepartment(req.tenant.id,req.tenant.userId,id);}
  @Get('cost-centres/:id') @TenantPermissions('company.read') getCostCentre(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string){return this.organization.getCostCentre(req.tenant.id,id);}
  @Patch('cost-centres/:id') @TenantPermissions('company.manage') updateCostCentre(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:UpdateCostCentreDto){return this.organization.updateCostCentre(req.tenant.id,req.tenant.userId,id,dto);}
  @Delete('cost-centres/:id') @TenantPermissions('company.manage') archiveCostCentre(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string){return this.organization.archiveCostCentre(req.tenant.id,req.tenant.userId,id);}
  @Get('worker-assignments') @TenantPermissions('workers.read') assignments(@Req() req: TenantRequest,@Query('workerId') workerId?: string) { return this.organization.listWorkerAssignments(req.tenant.id,workerId); }
  @Post('worker-assignments') @TenantPermissions('workers.manage') createAssignment(@Req() req: TenantRequest,@Body() dto: CreateWorkerAssignmentDto) { return this.organization.createWorkerAssignment(req.tenant.id,req.tenant.userId,dto); }
  @Get('worker-assignments/:id') @TenantPermissions('workers.read') getAssignment(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string){return this.organization.getWorkerAssignment(req.tenant.id,id);}
  @Patch('worker-assignments/:id') @TenantPermissions('workers.manage') updateAssignment(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:UpdateWorkerAssignmentDto){return this.organization.updateWorkerAssignment(req.tenant.id,req.tenant.userId,id,dto);}
  @Patch('worker-assignments/:id/end') @TenantPermissions('workers.manage') endAssignment(@Req() req: TenantRequest,@Param('id',ParseUUIDPipe) id: string,@Body() dto: EndAssignmentDto) { return this.organization.endWorkerAssignment(req.tenant.id,id,dto.effectiveTo); }
}
