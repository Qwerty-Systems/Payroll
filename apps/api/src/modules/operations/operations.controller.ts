import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { IsIn, IsString, MinLength } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import { CreateAttendanceDto, CreateAttendanceCorrectionDto, ReviewAttendanceCorrectionDto, CreateProjectDto, CreateSiteDto, CreateWorkerDto, CreateWorkerContractDto, EndWorkerContractDto, CreateWorkerOutputDto, RejectWorkerOutputDto, CreatePayGradeDto, UpdatePayGradeStatusDto } from './operations.dto';
import { OperationsService } from './operations.service';

type TenantRequest = Request & { tenant: { id: string; userId: string } };
class StatusDto { @IsIn(['active','inactive','suspended','archived','planning','on_hold','completed','cancelled']) status!: string; }
class RejectionDto { @IsString() @MinLength(3) reason!: string; }

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

  @Get('pay-grades') @TenantPermissions('workers.read') payGrades(@Req() req:TenantRequest) { return this.operations.listPayGrades(req.tenant.id); }
  @Post('pay-grades') @TenantPermissions('workers.manage') createPayGrade(@Req() req:TenantRequest,@Body() dto:CreatePayGradeDto) { return this.operations.createPayGrade(req.tenant.id,req.tenant.userId,dto); }
  @Patch('pay-grades/:id/status') @TenantPermissions('workers.manage') updatePayGrade(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:UpdatePayGradeStatusDto) { return this.operations.setPayGradeStatus(req.tenant.id,id,dto.status); }

  @Get('workers') @TenantPermissions('workers.read') workers(@Req() req:TenantRequest) { return this.operations.listWorkers(req.tenant.id); }
  @Post('workers') @TenantPermissions('workers.manage') createWorker(@Req() req:TenantRequest,@Body() dto:CreateWorkerDto) { return this.operations.createWorker(req.tenant.id,dto); }
  @Patch('workers/:id/status') @TenantPermissions('workers.manage') updateWorker(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:StatusDto) { return this.operations.setWorkerStatus(req.tenant.id,id,dto.status); }

  @Get('workers/:workerId/contracts') @TenantPermissions('workers.read') workerContracts(@Req() req:TenantRequest,@Param('workerId',ParseUUIDPipe) workerId:string) { return this.operations.listWorkerContracts(req.tenant.id,workerId); }
  @Post('workers/:workerId/contracts') @TenantPermissions('workers.manage') createWorkerContract(@Req() req:TenantRequest,@Param('workerId',ParseUUIDPipe) workerId:string,@Body() dto:CreateWorkerContractDto) { return this.operations.createWorkerContract(req.tenant.id,req.tenant.userId,workerId,dto); }
  @Patch('workers/:workerId/contracts/:contractId/end') @TenantPermissions('workers.manage') endWorkerContract(@Req() req:TenantRequest,@Param('workerId',ParseUUIDPipe) workerId:string,@Param('contractId',ParseUUIDPipe) contractId:string,@Body() dto:EndWorkerContractDto) { return this.operations.endWorkerContract(req.tenant.id,req.tenant.userId,workerId,contractId,dto.effectiveTo); }

  @Get('worker-outputs') @TenantPermissions('attendance.read') workerOutputs(@Req() req:TenantRequest,@Query('workerId') workerId?:string) { return this.operations.listWorkerOutputs(req.tenant.id,workerId); }
  @Post('worker-outputs') @TenantPermissions('attendance.capture') createWorkerOutput(@Req() req:TenantRequest,@Body() dto:CreateWorkerOutputDto) { return this.operations.createWorkerOutput(req.tenant.id,req.tenant.userId,dto); }
  @Post('worker-outputs/:id/submit') @TenantPermissions('attendance.capture') submitWorkerOutput(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.operations.transitionWorkerOutput(req.tenant.id,req.tenant.userId,id,'submit'); }
  @Post('worker-outputs/:id/approve') @TenantPermissions('attendance.approve') approveWorkerOutput(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.operations.transitionWorkerOutput(req.tenant.id,req.tenant.userId,id,'approve'); }
  @Post('worker-outputs/:id/reject') @TenantPermissions('attendance.approve') rejectWorkerOutput(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:RejectWorkerOutputDto) { return this.operations.transitionWorkerOutput(req.tenant.id,req.tenant.userId,id,'reject',dto.reason); }

  @Get('attendance') @TenantPermissions('attendance.read') attendance(@Req() req:TenantRequest,@Query('workDate') workDate?:string) { return this.operations.listAttendance(req.tenant.id,workDate); }
  @Post('attendance') @TenantPermissions('attendance.capture') createAttendance(@Req() req:TenantRequest,@Body() dto:CreateAttendanceDto) { return this.operations.createAttendance(req.tenant.id,req.tenant.userId,dto); }
  @Post('attendance/:id/submit') @TenantPermissions('attendance.capture') submitAttendance(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.operations.transitionAttendance(req.tenant.id,req.tenant.userId,id,'submit'); }
  @Post('attendance/:id/approve') @TenantPermissions('attendance.approve') approveAttendance(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.operations.transitionAttendance(req.tenant.id,req.tenant.userId,id,'approve'); }
  @Post('attendance/:id/reject') @TenantPermissions('attendance.approve') rejectAttendance(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:RejectionDto) { return this.operations.transitionAttendance(req.tenant.id,req.tenant.userId,id,'reject',dto.reason); }

  @Get('attendance/:id/corrections') @TenantPermissions('attendance.read') attendanceCorrections(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.operations.listAttendanceCorrections(req.tenant.id,id); }
  @Post('attendance/:id/corrections') @TenantPermissions('attendance.capture') requestAttendanceCorrection(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:CreateAttendanceCorrectionDto) { return this.operations.requestAttendanceCorrection(req.tenant.id,req.tenant.userId,id,dto); }
  @Post('attendance-corrections/:id/approve') @TenantPermissions('attendance.approve') approveAttendanceCorrection(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ReviewAttendanceCorrectionDto) { return this.operations.reviewAttendanceCorrection(req.tenant.id,req.tenant.userId,id,'approve',dto.reason); }
  @Post('attendance-corrections/:id/reject') @TenantPermissions('attendance.approve') rejectAttendanceCorrection(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ReviewAttendanceCorrectionDto) { return this.operations.reviewAttendanceCorrection(req.tenant.id,req.tenant.userId,id,'reject',dto.reason); }

}
