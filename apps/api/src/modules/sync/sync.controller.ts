import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import { RegisterDeviceDto, ResolveSyncConflictDto, SyncBatchDto } from './sync.dto';
import { SyncService } from './sync.service';

type TenantRequest = Request & { tenant: { id: string; userId: string } };

@ApiTags('offline-sync')
@ApiBearerAuth()
@Controller('tenant/sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('devices')
  @TenantPermissions('attendance.capture')
  listDevices(@Req() req: TenantRequest) {
    return this.sync.listDevices(req.tenant.id, req.tenant.userId);
  }

  @Post('devices')
  @TenantPermissions('attendance.capture')
  registerDevice(@Req() req: TenantRequest, @Body() dto: RegisterDeviceDto) {
    return this.sync.registerDevice(req.tenant.id, req.tenant.userId, dto);
  }

  @Post('devices/:id/revoke')
  @TenantPermissions('attendance.capture')
  revokeDevice(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.sync.revokeDevice(req.tenant.id, req.tenant.userId, id);
  }

  @Post('commands')
  @TenantPermissions('attendance.capture')
  processBatch(@Req() req: TenantRequest, @Body() dto: SyncBatchDto) {
    return this.sync.processBatch(req.tenant.id, req.tenant.userId, dto);
  }

  @Get('attendance')
  @TenantPermissions('attendance.read')
  pullAttendance(@Req() req: TenantRequest, @Query('cursor') cursor?: string) {
    return this.sync.pullAttendance(req.tenant.id, cursor);
  }

  @Get('conflicts')
  @TenantPermissions('attendance.approve')
  listConflicts(@Req() req: TenantRequest) {
    return this.sync.listConflicts(req.tenant.id);
  }

  @Post('conflicts/:id/discard')
  @TenantPermissions('attendance.approve')
  discardConflict(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveSyncConflictDto) {
    return this.sync.resolveConflict(req.tenant.id, req.tenant.userId, id, dto.resolution);
  }
}
