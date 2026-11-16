import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client?: Redis;

  constructor() {
    const url = this.connectionUrl();
    if (url) {
      this.client = new Redis(url, {
        lazyConnect: true,
        connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 10000),
        maxRetriesPerRequest: 2,
        retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
        keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'jengaflow:',
      });
      this.client.on('error', (error) => {
        // Keep the process alive; readiness reports dependency failures.
        if (process.env.NODE_ENV === 'development') process.stderr.write(`Redis: ${error.message}\n`);
      });
    }
  }

  private connectionUrl(): string | undefined {
    if (process.env.REDIS_URL?.trim()) return process.env.REDIS_URL.trim();
    const host = process.env.REDIS_HOST?.trim();
    if (!host) return undefined;
    const port = Number(process.env.REDIS_PORT ?? 6379);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('REDIS_PORT must be a valid TCP port.');
    }
    const password = process.env.REDIS_PASSWORD ?? '';
    const protocol = process.env.REDIS_TLS === 'true' ? 'rediss:' : 'redis:';
    const credentials = password ? `:${encodeURIComponent(password)}@` : '';
    return `${protocol}//${credentials}${host}:${port}/0`;
  }

  isConfigured(): boolean { return Boolean(this.client); }

  async ping(): Promise<boolean> {
    if (!this.client) return true;
    if (this.client.status === 'wait') await this.client.connect();
    return (await this.client.ping()) === 'PONG';
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client && this.client.status !== 'end') await this.client.quit();
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
