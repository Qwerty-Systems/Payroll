import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { StorageModule } from './storage/storage.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { TenantAccessGuard } from './auth/tenant-access.guard';
import { OperationsModule } from './operations/operations.module';
import { PayrollModule } from './payroll/payroll.module';
import { UsersModule } from './users/users.module';
import { OrganizationModule } from './organization/organization.module';
import { SyncModule } from './sync/sync.module';
import { WorkerDocumentsModule } from './workers/worker-documents.module';
import { ComplianceModule } from './compliance/compliance.module';
import { WorkforceTimeModule } from './workforce-time/workforce-time.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    DatabaseModule,
    RedisModule,
    HealthModule,
    AuthModule,
    StorageModule,
    OperationsModule,
    PayrollModule,
    UsersModule,
    OrganizationModule,
    SyncModule,
    WorkerDocumentsModule,
    ComplianceModule,
    WorkforceTimeModule,
    IntegrationsModule,
    BillingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantAccessGuard },
  ],
})
export class AppModule {}
