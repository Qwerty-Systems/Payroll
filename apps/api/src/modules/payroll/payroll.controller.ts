import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import { ConfirmPayrollPaymentDto, CreatePayrollPeriodDto, CreatePayrollRunDto, PayrollPaymentBatchDto } from './payroll.dto';
import { PayrollService } from './payroll.service';

type TenantRequest = Request & { tenant: { id: string; userId: string } };
@ApiTags('payroll')
@ApiBearerAuth()
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('periods') @TenantPermissions('payroll.read') listPeriods(@Req() req:TenantRequest) { return this.payroll.listPeriods(req.tenant.id); }
  @Get('runs') @TenantPermissions('payroll.read') listRuns(@Req() req:TenantRequest,@Query('periodId') periodId?:string) { return this.payroll.listRuns(req.tenant.id,periodId); }
  @Post('periods') @TenantPermissions('payroll.calculate') createPeriod(@Req() req:TenantRequest,@Body() dto:CreatePayrollPeriodDto) { return this.payroll.createPeriod(req.tenant.id,req.tenant.userId,dto); }
  @Post('runs') @TenantPermissions('payroll.calculate') createRun(@Req() req:TenantRequest,@Body() dto:CreatePayrollRunDto) { return this.payroll.createRun(req.tenant.id,req.tenant.userId,dto.periodId); }
  @Post('runs/:id/calculate') @TenantPermissions('payroll.calculate') calculate(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.payroll.calculateRun(req.tenant.id,req.tenant.userId,id); }
  @Get('runs/:id') @TenantPermissions('payroll.read') getRun(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.payroll.getRun(req.tenant.id,id); }
  @Post('runs/:id/submit') @TenantPermissions('payroll.calculate') submit(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.payroll.transitionRun(req.tenant.id,req.tenant.userId,id,'submit'); }
  @Post('runs/:id/approve') @TenantPermissions('payroll.approve') approve(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.payroll.transitionRun(req.tenant.id,req.tenant.userId,id,'approve'); }
  @Post('runs/:id/finalize') @TenantPermissions('payroll.finalize') finalize(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.payroll.transitionRun(req.tenant.id,req.tenant.userId,id,'finalize'); }

  @Get('runs/:id/payslips') @TenantPermissions('payslips.read') listPayslips(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.payroll.listPayslips(req.tenant.id,id); }
  @Get('payslips/:id') @TenantPermissions('payslips.read') getPayslip(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.payroll.getPayslip(req.tenant.id,id); }
  @Post('runs/:id/payment-batches') @TenantPermissions('payroll.finalize') createPaymentBatch(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:PayrollPaymentBatchDto) { return this.payroll.createPaymentBatch(req.tenant.id,req.tenant.userId,id,dto.paymentMethod); }
  @Post('payment-batches/:id/approve') @TenantPermissions('payroll.approve') approvePaymentBatch(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.payroll.approvePaymentBatch(req.tenant.id,req.tenant.userId,id); }
  @Post('payment-batches/:id/items/:itemId/confirm') @TenantPermissions('payroll.finalize') confirmPayment(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Param('itemId',ParseUUIDPipe) itemId:string,@Body() dto:ConfirmPayrollPaymentDto) { return this.payroll.confirmPayment(req.tenant.id,req.tenant.userId,id,itemId,dto.providerReference); }
}
