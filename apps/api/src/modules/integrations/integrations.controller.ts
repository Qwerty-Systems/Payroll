import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import { UpdateIntegrationSettingsDto } from './integrations.dto';
import { SaveAccountMappingDto } from './accounting-mapping.dto';
import { CreatePayoutIntentDto, QueueIntegrationDeliveryDto, CreateReconciliationItemDto } from './integration-workflow.dto';
import { IntegrationsService } from './integrations.service';

type TenantRequest = Request & { tenant: { id: string; userId: string } };

@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('settings')
  @TenantPermissions('compliance.read')
  list(@Req() req: TenantRequest) {
    return this.integrations.list(req.tenant.id);
  }

  @Post('settings')
  @TenantPermissions('compliance.manage')
  save(@Req() req: TenantRequest, @Body() dto: UpdateIntegrationSettingsDto) {
    return this.integrations.save(req.tenant.id, req.tenant.userId, dto);
  }

  @Get('accounting/mappings')
  @TenantPermissions('compliance.read')
  listAccountMappings(@Req() req: TenantRequest) {
    return this.integrations.listAccountMappings(req.tenant.id);
  }

  @Post('accounting/mappings')
  @TenantPermissions('compliance.manage')
  saveAccountMapping(@Req() req: TenantRequest, @Body() dto: SaveAccountMappingDto) {
    return this.integrations.saveAccountMapping(req.tenant.id, req.tenant.userId, dto);
  }


  @Post('payout-intents')
  @TenantPermissions('compliance.manage')
  createPayoutIntent(@Req() req: TenantRequest, @Body() dto: CreatePayoutIntentDto) {
    return this.integrations.createPayoutIntent(req.tenant.id, req.tenant.userId, dto);
  }

  @Get('payout-intents')
  @TenantPermissions('compliance.read')
  listPayoutIntents(@Req() req: TenantRequest) {
    return this.integrations.listPayoutIntents(req.tenant.id);
  }

  @Post('delivery-jobs')
  @TenantPermissions('compliance.manage')
  queueDelivery(@Req() req: TenantRequest, @Body() dto: QueueIntegrationDeliveryDto) {
    return this.integrations.queueDelivery(req.tenant.id, req.tenant.userId, dto);
  }

  @Get('delivery-jobs')
  @TenantPermissions('compliance.read')
  listDeliveryJobs(@Req() req: TenantRequest) {
    return this.integrations.listDeliveryJobs(req.tenant.id);
  }

  @Post('reconciliation')
  @TenantPermissions('compliance.manage')
  createReconciliationItem(@Req() req: TenantRequest, @Body() dto: CreateReconciliationItemDto) {
    return this.integrations.createReconciliationItem(req.tenant.id, req.tenant.userId, dto);
  }

  @Get('reconciliation')
  @TenantPermissions('compliance.read')
  listReconciliationItems(@Req() req: TenantRequest) {
    return this.integrations.listReconciliationItems(req.tenant.id);
  }

  @Post('daraja/test-sandbox')
  @TenantPermissions('compliance.manage')
  testDaraja(@Req() req: TenantRequest) {
    return this.integrations.testDarajaSandbox(req.tenant.id);
  }
}
