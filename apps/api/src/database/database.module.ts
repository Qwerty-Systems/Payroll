import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantTransactionService } from './tenant-transaction.service';
import { TenantStatutoryService } from './tenant-statutory.service';

@Module({
  providers: [TenantTransactionService, TenantStatutoryService],
  exports: [TenantTransactionService, TenantStatutoryService],
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
      extra: {
        min: Number(process.env.DATABASE_POOL_MIN ?? 2),
        max: Number(process.env.DATABASE_POOL_MAX ?? 20),
        connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 10000),
      },
      autoLoadEntities: true,
      synchronize: false,
      migrationsRun: false,
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      retryAttempts: 5,
      retryDelay: 3000,
      logging: process.env.NODE_ENV === 'development',
    }),
  ],
})
export class DatabaseModule {}
