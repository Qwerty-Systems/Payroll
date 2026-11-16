import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from '../../redis/redis.module';
import { ObjectStorageService } from '../storage/object-storage.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly storage: ObjectStorageService,
  ) {}

  getLiveness(): { status: 'ok'; service: string } {
    return { status: 'ok', service: 'jengaflow-api' };
  }

  async getReadiness(): Promise<{ status: 'ready'; database: 'connected'; redis: 'connected' | 'not_configured' }> {
    try {
      await this.dataSource.query('SELECT 1');
      await this.redisService.ping();
      const storage = await this.storage.check();
      return {
        status: 'ready',
        database: 'connected',
        redis: this.redisService.isConfigured() ? 'connected' : 'not_configured',
        storage,
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        dependencies: 'database_redis_or_storage_unavailable',
      });
    }
  }
}
