import { Controller, Get, Header, Module, NotFoundException, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { Public } from '../auth/public.decorator';

@ApiTags('health')
@Public()
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
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(@Req() req: Request): Promise<string> {
    const token = process.env.METRICS_BEARER_TOKEN;
    if (!token) throw new NotFoundException();
    if (req.headers.authorization !== `Bearer ${token}`) throw new UnauthorizedException();
    return this.healthService.getMetrics();
  }

}

@Module({ controllers: [HealthController], providers: [HealthService] })
export class HealthModule {}
