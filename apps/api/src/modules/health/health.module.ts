import { Controller, Get, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
class HealthController {
  @Get()
  @ApiOperation({ summary: 'Application liveness check' })
  getHealth(): { status: string; service: string } {
    return { status: 'ok', service: 'construction-payroll-api' };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
