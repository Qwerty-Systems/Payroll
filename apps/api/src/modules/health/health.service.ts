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

  async getReadiness(): Promise<{ status: 'ready'; database: 'connected'; redis: 'connected' | 'not_configured'; storage: 'connected' | 'not_configured' }> {
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

  async getMetrics():Promise<string>{
    const [database,redis,storage]=await Promise.all([
      this.dataSource.query('SELECT 1').then(()=>1).catch(()=>0),
      this.redisService.ping().then(()=>1).catch(()=>0),
      this.storage.check().then(value=>value==='connected'?1:0).catch(()=>0),
    ]);
    const memory=process.memoryUsage();
    const lines=[
      '# HELP jengaflow_process_uptime_seconds Process uptime in seconds.',
      '# TYPE jengaflow_process_uptime_seconds gauge',
      `jengaflow_process_uptime_seconds ${Math.floor(process.uptime())}`,
      '# HELP jengaflow_process_resident_memory_bytes Resident memory in bytes.',
      '# TYPE jengaflow_process_resident_memory_bytes gauge',
      `jengaflow_process_resident_memory_bytes ${memory.rss}`,
      '# HELP jengaflow_process_heap_used_bytes Heap used in bytes.',
      '# TYPE jengaflow_process_heap_used_bytes gauge',
      `jengaflow_process_heap_used_bytes ${memory.heapUsed}`,
      '# HELP jengaflow_dependency_ready Dependency readiness (1 ready, 0 not ready or not configured).',
      '# TYPE jengaflow_dependency_ready gauge',
      `jengaflow_dependency_ready{dependency="database"} ${database}`,
      `jengaflow_dependency_ready{dependency="redis"} ${redis}`,
      `jengaflow_dependency_ready{dependency="object_storage"} ${storage}`,
    ];
    return lines.join('\\n')+'\\n';
  }

}
