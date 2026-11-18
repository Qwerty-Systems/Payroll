import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import {
  CreateBillingCustomerDto, CreateBillingPlanDto, CreateBillingSubscriptionDto,
  UpdateBillingCustomerDto, UpdateBillingPlanDto, UpdateBillingSubscriptionDto,
} from './billing-customer.dto';
import { BillingCatalogService } from './billing-catalog.service';

type TenantRequest = Request & { tenant: { id: string; userId: string } };

@ApiTags('billing catalog')
@ApiBearerAuth()
@Controller('billing')
export class BillingCatalogController {
  constructor(private readonly service: BillingCatalogService) {}

  @Get('customers')
  @TenantPermissions('compliance.read')
  customers(@Req() req: TenantRequest, @Query('status') status?: string) {
    return this.service.listCustomers(req.tenant.id,status);
  }
  @Post('customers')
  @TenantPermissions('compliance.manage')
  createCustomer(@Req() req: TenantRequest,@Body() dto: CreateBillingCustomerDto) {
    return this.service.createCustomer(req.tenant.id,req.tenant.userId,dto);
  }
  @Patch('customers/:id')
  @TenantPermissions('compliance.manage')
  updateCustomer(@Req() req: TenantRequest,@Param('id',ParseUUIDPipe) id: string,@Body() dto: UpdateBillingCustomerDto) {
    return this.service.updateCustomer(req.tenant.id,req.tenant.userId,id,dto);
  }

  @Get('plans')
  @TenantPermissions('compliance.read')
  plans(@Req() req: TenantRequest,@Query('status') status?: string) {
    return this.service.listPlans(req.tenant.id,status);
  }
  @Post('plans')
  @TenantPermissions('compliance.manage')
  createPlan(@Req() req: TenantRequest,@Body() dto: CreateBillingPlanDto) {
    return this.service.createPlan(req.tenant.id,req.tenant.userId,dto);
  }
  @Patch('plans/:id')
  @TenantPermissions('compliance.manage')
  updatePlan(@Req() req: TenantRequest,@Param('id',ParseUUIDPipe) id: string,@Body() dto: UpdateBillingPlanDto) {
    return this.service.updatePlan(req.tenant.id,req.tenant.userId,id,dto);
  }

  @Get('subscriptions')
  @TenantPermissions('compliance.read')
  subscriptions(@Req() req: TenantRequest,@Query('status') status?: string) {
    return this.service.listSubscriptions(req.tenant.id,status);
  }
  @Post('subscriptions')
  @TenantPermissions('compliance.manage')
  createSubscription(@Req() req: TenantRequest,@Body() dto: CreateBillingSubscriptionDto) {
    return this.service.createSubscription(req.tenant.id,req.tenant.userId,dto);
  }
  @Patch('subscriptions/:id')
  @TenantPermissions('compliance.manage')
  updateSubscription(@Req() req: TenantRequest,@Param('id',ParseUUIDPipe) id: string,@Body() dto: UpdateBillingSubscriptionDto) {
    return this.service.updateSubscription(req.tenant.id,req.tenant.userId,id,dto);
  }
}
