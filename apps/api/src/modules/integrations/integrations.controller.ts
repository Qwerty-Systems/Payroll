import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import { UpdateIntegrationSettingsDto } from './integrations.dto';
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

  @Post('daraja/test-sandbox')
  @TenantPermissions('compliance.manage')
  testDaraja(@Req() req: TenantRequest) {
    return this.integrations.testDarajaSandbox(req.tenant.id);
  }
}
