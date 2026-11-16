import { Controller, Get, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Application liveness check' })
  getLiveness(): { status: 'ok'; service: string } {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Database readiness check' })
  getReadiness(): Promise<{ status: 'ready'; database: 'connected'; redis: 'connected' | 'not_configured'; storage: 'connected' | 'not_configured' }> {
    return this.healthService.getReadiness();
  }
}

@Module({ controllers: [HealthController], providers: [HealthService] })
export class HealthModule {}
