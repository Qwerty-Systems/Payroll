import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantTransactionService } from './tenant-transaction.service';
import { TenantStatutoryService } from './tenant-statutory.service';
import { getPostgresConfig } from './postgres.config';

@Module({
  providers: [TenantTransactionService, TenantStatutoryService],
  exports: [TenantTransactionService, TenantStatutoryService],
  imports: [
    TypeOrmModule.forRoot({
      ...getPostgresConfig(),
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
