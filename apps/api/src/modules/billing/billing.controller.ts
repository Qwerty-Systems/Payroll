import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import { BillingService } from './billing.service';
import { ConvertQuoteDto, CreateInvoiceDto, CreateQuoteDto, CreateRecurringScheduleDto, CreateSubscriptionRequestDto, ReconcileBillingPaymentDto, RecordBillingPaymentDto } from './billing.dto';
type TenantRequest=Request & {tenant:{id:string;userId:string}};
@ApiTags('tenant-billing')
@ApiBearerAuth()
@Controller('tenant/billing')
export class BillingController{
 constructor(private readonly billing:BillingService){}
 @Get('plans') @TenantPermissions('billing.read') plans(@Req() req:TenantRequest){return this.billing.listPlans(req.tenant.id);}
 @Get('subscriptions') @TenantPermissions('billing.read') subscriptions(@Req() req:TenantRequest){return this.billing.listSubscriptions(req.tenant.id);}
 @Post('subscriptions') @TenantPermissions('billing.manage') requestSubscription(@Req() req:TenantRequest,@Body() dto:CreateSubscriptionRequestDto){return this.billing.requestSubscription(req.tenant.id,req.tenant.userId,dto);}
 @Get('quotes') @TenantPermissions('billing.read') quotes(@Req() req:TenantRequest){return this.billing.listQuotes(req.tenant.id);}
 @Post('quotes') @TenantPermissions('billing.manage') createQuote(@Req() req:TenantRequest,@Body() dto:CreateQuoteDto){return this.billing.createQuote(req.tenant.id,req.tenant.userId,dto);}
 @Post('quotes/:id/issue') @TenantPermissions('billing.manage') issueQuote(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string){return this.billing.transitionQuote(req.tenant.id,req.tenant.userId,id,'issue');}
 @Post('quotes/:id/accept') @TenantPermissions('billing.manage') acceptQuote(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string){return this.billing.transitionQuote(req.tenant.id,req.tenant.userId,id,'accept');}
 @Post('quotes/:id/reject') @TenantPermissions('billing.manage') rejectQuote(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string){return this.billing.transitionQuote(req.tenant.id,req.tenant.userId,id,'reject');}
 @Post('quotes/:id/convert') @TenantPermissions('billing.manage') convertQuote(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ConvertQuoteDto){return this.billing.convertQuoteToInvoice(req.tenant.id,req.tenant.userId,id,dto.dueDate);}
 @Get('invoices') @TenantPermissions('billing.read') invoices(@Req() req:TenantRequest){return this.billing.listInvoices(req.tenant.id);}
 @Get('invoices/:id') @TenantPermissions('billing.read') invoice(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string){return this.billing.getInvoice(req.tenant.id,id);}
 @Post('invoices') @TenantPermissions('billing.manage') createInvoice(@Req() req:TenantRequest,@Body() dto:CreateInvoiceDto){return this.billing.createInvoice(req.tenant.id,req.tenant.userId,dto);}
 @Get('payments') @TenantPermissions('billing.read') payments(@Req() req:TenantRequest){return this.billing.listPayments(req.tenant.id);}
 @Post('payments') @TenantPermissions('billing.manage') recordPayment(@Req() req:TenantRequest,@Body() dto:RecordBillingPaymentDto){return this.billing.recordPayment(req.tenant.id,req.tenant.userId,dto);}
 @Post('payments/:id/reconcile') @TenantPermissions('billing.manage') reconcilePayment(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ReconcileBillingPaymentDto){return this.billing.reconcilePayment(req.tenant.id,req.tenant.userId,id,dto.action as 'confirm'|'reverse',dto.reason);}
 @Get('recurring-schedules') @TenantPermissions('billing.read') recurringSchedules(@Req() req:TenantRequest){return this.billing.listRecurringSchedules(req.tenant.id);}
 @Post('recurring-schedules') @TenantPermissions('billing.manage') createRecurringSchedule(@Req() req:TenantRequest,@Body() dto:CreateRecurringScheduleDto){return this.billing.createRecurringSchedule(req.tenant.id,req.tenant.userId,dto);}
 @Post('recurring-schedules/generate-due') @TenantPermissions('billing.manage') generateDueInvoices(@Req() req:TenantRequest){return this.billing.generateDueRecurringInvoices(req.tenant.id,req.tenant.userId);}
}
