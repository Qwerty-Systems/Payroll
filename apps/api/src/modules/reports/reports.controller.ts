import { BadRequestException,Controller,Get,Header,Param,ParseUUIDPipe,Query,Req,Res } from '@nestjs/common';
import { ApiBearerAuth,ApiTags } from '@nestjs/swagger';
import type { Request,Response } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import { ReportsService } from './reports.service';
type TenantRequest=Request & {tenant:{id:string}};
@ApiTags('tenant-reports') @ApiBearerAuth() @Controller('tenant/reports')
export class ReportsController{
 constructor(private readonly reports:ReportsService){}
 @Get('dashboard') @TenantPermissions('reports.read') dashboard(@Req() req:TenantRequest){return this.reports.dashboard(req.tenant.id);}
 @Get('attendance.csv') @TenantPermissions('reports.read') @Header('Content-Type','text/csv; charset=utf-8') attendance(@Req() req:TenantRequest,@Query('from') from:string,@Query('to') to:string,@Res({passthrough:true}) res:Response){if(!from||!to)throw new BadRequestException('from and to dates are required.');res.setHeader('Content-Disposition',`attachment; filename="attendance-${from}-${to}.csv"`);return this.reports.attendanceCsv(req.tenant.id,from,to);}
 @Get('payroll/:periodId.csv') @TenantPermissions('reports.read') @Header('Content-Type','text/csv; charset=utf-8') payroll(@Req() req:TenantRequest,@Param('periodId',ParseUUIDPipe) periodId:string,@Res({passthrough:true}) res:Response){res.setHeader('Content-Disposition',`attachment; filename="payroll-${periodId}.csv"`);return this.reports.payrollCsv(req.tenant.id,periodId);}
 @Get('audit.csv') @TenantPermissions('audit.read') @Header('Content-Type','text/csv; charset=utf-8') audit(@Req() req:TenantRequest,@Query('from') from:string,@Query('to') to:string,@Res({passthrough:true}) res:Response){if(!from||!to)throw new BadRequestException('from and to dates are required.');res.setHeader('Content-Disposition',`attachment; filename="audit-${from}-${to}.csv"`);return this.reports.auditCsv(req.tenant.id,from,to);}
}
