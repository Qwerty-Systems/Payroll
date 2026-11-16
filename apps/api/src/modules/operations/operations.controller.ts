import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import { CreateAttendanceDto, CreateProjectDto, CreateSiteDto, CreateWorkerDto } from './operations.dto';
import { OperationsService } from './operations.service';

type TenantRequest = Request & { tenant: { id: string } };
class StatusDto { status!: string; }

@ApiTags('tenant-operations')
@ApiBearerAuth()
@Controller('tenant')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('projects') @TenantPermissions('projects.read') projects(@Req() req: TenantRequest) { return this.operations.listProjects(req.tenant.id); }
  @Post('projects') @TenantPermissions('projects.manage') createProject(@Req() req: TenantRequest, @Body() dto: CreateProjectDto) { return this.operations.createProject(req.tenant.id,dto); }
  @Patch('projects/:id/status') @TenantPermissions('projects.manage') updateProject(@Req() req: TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:StatusDto) { return this.operations.updateProject(req.tenant.id,id,dto.status); }

  @Get('sites') @TenantPermissions('projects.read') sites(@Req() req:TenantRequest,@Query('projectId') projectId?:string) { return this.operations.listSites(req.tenant.id,projectId); }
  @Post('sites') @TenantPermissions('projects.manage') createSite(@Req() req:TenantRequest,@Body() dto:CreateSiteDto) { return this.operations.createSite(req.tenant.id,dto); }

  @Get('workers') @TenantPermissions('workers.read') workers(@Req() req:TenantRequest) { return this.operations.listWorkers(req.tenant.id); }
  @Post('workers') @TenantPermissions('workers.manage') createWorker(@Req() req:TenantRequest,@Body() dto:CreateWorkerDto) { return this.operations.createWorker(req.tenant.id,dto); }
  @Patch('workers/:id/status') @TenantPermissions('workers.manage') updateWorker(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:StatusDto) { return this.operations.setWorkerStatus(req.tenant.id,id,dto.status); }

  @Get('attendance') @TenantPermissions('attendance.read') attendance(@Req() req:TenantRequest,@Query('workDate') workDate?:string) { return this.operations.listAttendance(req.tenant.id,workDate); }
  @Post('attendance') @TenantPermissions('attendance.capture') createAttendance(@Req() req:TenantRequest,@Body() dto:CreateAttendanceDto) { return this.operations.createAttendance(req.tenant.id,dto); }
  @Post('attendance/:id/submit') @TenantPermissions('attendance.capture') submitAttendance(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.operations.transitionAttendance(req.tenant.id,id,'submit'); }
  @Post('attendance/:id/approve') @TenantPermissions('attendance.approve') approveAttendance(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.operations.transitionAttendance(req.tenant.id,id,'approve'); }
  @Post('attendance/:id/reject') @TenantPermissions('attendance.approve') rejectAttendance(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.operations.transitionAttendance(req.tenant.id,id,'reject'); }
}
