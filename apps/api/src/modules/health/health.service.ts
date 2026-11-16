import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from '../../redis/redis.module';

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  getLiveness(): { status: 'ok'; service: string } {
    return { status: 'ok', service: 'jengaflow-api' };
  }

  async getReadiness(): Promise<{ status: 'ready'; database: 'connected'; redis: 'connected' | 'not_configured' }> {
    try {
      await this.dataSource.query('SELECT 1');
      await this.redisService.ping();
      return {
        status: 'ready',
        database: 'connected',
        redis: this.redisService.isConfigured() ? 'connected' : 'not_configured',
        storage: 'not_configured',
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        dependencies: 'database_or_redis_unavailable',
      });
    }
  }
}
