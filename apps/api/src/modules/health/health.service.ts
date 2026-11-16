import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  getLiveness(): { status: 'ok'; service: string } {
    return { status: 'ok', service: 'crewledger-api' };
  }

  async getReadiness(): Promise<{ status: 'ready'; database: 'connected' }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ready', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: 'unavailable',
      });
    }
  }
}
