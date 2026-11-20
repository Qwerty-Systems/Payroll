import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import { ReportsService } from './reports.service';

type TenantRequest = Request & { tenant: { id: string } };

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('payroll')
  @TenantPermissions('payroll.read')
  payrollSummary(@Req() req:TenantRequest,@Query('periodId') periodId?:string) {
    return this.reports.payrollSummary(req.tenant.id,periodId);
  }

  @Get('payroll/runs/:id')
  @TenantPermissions('payroll.read')
  payrollRunDetail(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) {
    return this.reports.payrollRunDetail(req.tenant.id,id);
  }
}
