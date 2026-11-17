import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import {
  CreateLeaveRequestDto, CreateLeaveTypeDto, CreateOvertimeRequestDto, CreateShiftDto,
  ReviewLeaveRequestDto, ReviewOvertimeRequestDto, SetLeaveBalanceDto, UpdateShiftDto,
} from './workforce-time.dto';
import { WorkforceTimeService } from './workforce-time.service';

type TenantRequest = Request & { tenant: { id: string; userId: string } };

@ApiTags('tenant-workforce-time')
@ApiBearerAuth()
@Controller('tenant')
export class WorkforceTimeController {
  constructor(private readonly service: WorkforceTimeService) {}

  @Get('shifts')
  @TenantPermissions('attendance.read')
  listShifts(@Req() req: TenantRequest) { return this.service.listShifts(req.tenant.id); }

  @Post('shifts')
  @TenantPermissions('attendance.approve')
  createShift(@Req() req: TenantRequest, @Body() dto: CreateShiftDto) {
    return this.service.createShift(req.tenant.id, req.tenant.userId, dto);
  }

  @Patch('shifts/:id')
  @TenantPermissions('attendance.approve')
  updateShift(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShiftDto) {
    return this.service.updateShift(req.tenant.id, req.tenant.userId, id, dto);
  }

  @Delete('shifts/:id')
  @TenantPermissions('attendance.approve')
  deactivateShift(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.updateShift(req.tenant.id, req.tenant.userId, id, { status: 'inactive' });
  }

  @Get('leave-types')
  @TenantPermissions('attendance.read')
  listLeaveTypes(@Req() req: TenantRequest) { return this.service.listLeaveTypes(req.tenant.id); }

  @Post('leave-types')
  @TenantPermissions('attendance.approve')
  createLeaveType(@Req() req: TenantRequest, @Body() dto: CreateLeaveTypeDto) {
    return this.service.createLeaveType(req.tenant.id, req.tenant.userId, dto);
  }

  @Get('leave-balances')
  @TenantPermissions('attendance.read')
  listLeaveBalances(@Req() req: TenantRequest, @Query('workerId') workerId?: string, @Query('year') year?: string) {
    const parsedYear = year === undefined ? undefined : Number(year);
    return this.service.listLeaveBalances(req.tenant.id, workerId, parsedYear);
  }

  @Put('leave-balances')
  @TenantPermissions('attendance.approve')
  setLeaveBalance(@Req() req: TenantRequest, @Body() dto: SetLeaveBalanceDto) {
    return this.service.setLeaveBalance(req.tenant.id, req.tenant.userId, dto);
  }

  @Get('leave-requests')
  @TenantPermissions('attendance.read')
  listLeaveRequests(@Req() req: TenantRequest, @Query('status') status?: string) {
    return this.service.listLeaveRequests(req.tenant.id, status);
  }

  @Post('leave-requests')
  @TenantPermissions('attendance.capture')
  createLeaveRequest(@Req() req: TenantRequest, @Body() dto: CreateLeaveRequestDto) {
    return this.service.createLeaveRequest(req.tenant.id, req.tenant.userId, dto);
  }

  @Post('leave-requests/:id/approve')
  @TenantPermissions('attendance.approve')
  approveLeaveRequest(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewLeaveRequestDto) {
    return this.service.reviewLeaveRequest(req.tenant.id, req.tenant.userId, id, 'approve', dto);
  }

  @Post('leave-requests/:id/reject')
  @TenantPermissions('attendance.approve')
  rejectLeaveRequest(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewLeaveRequestDto) {
    return this.service.reviewLeaveRequest(req.tenant.id, req.tenant.userId, id, 'reject', dto);
  }

  @Post('leave-requests/:id/cancel')
  @TenantPermissions('attendance.capture')
  cancelLeaveRequest(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancelLeaveRequest(req.tenant.id, req.tenant.userId, id);
  }

  @Get('overtime-requests')
  @TenantPermissions('attendance.read')
  listOvertimeRequests(@Req() req: TenantRequest, @Query('status') status?: string) {
    return this.service.listOvertimeRequests(req.tenant.id, status);
  }

  @Post('overtime-requests')
  @TenantPermissions('attendance.capture')
  createOvertimeRequest(@Req() req: TenantRequest, @Body() dto: CreateOvertimeRequestDto) {
    return this.service.createOvertimeRequest(req.tenant.id, req.tenant.userId, dto);
  }

  @Post('overtime-requests/:id/approve')
  @TenantPermissions('attendance.approve')
  approveOvertimeRequest(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewOvertimeRequestDto) {
    return this.service.reviewOvertimeRequest(req.tenant.id, req.tenant.userId, id, 'approve', dto);
  }

  @Post('overtime-requests/:id/reject')
  @TenantPermissions('attendance.approve')
  rejectOvertimeRequest(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewOvertimeRequestDto) {
    return this.service.reviewOvertimeRequest(req.tenant.id, req.tenant.userId, id, 'reject', dto);
  }
}
