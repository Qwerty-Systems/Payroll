import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PlatformBillingController } from './platform-billing.controller';
import { PlatformBillingGuard } from './platform-billing.guard';
import { PlatformBillingService } from './platform-billing.service';
@Module({imports:[DatabaseModule],controllers:[BillingController,PlatformBillingController],providers:[BillingService,PlatformBillingGuard,PlatformBillingService]})
export class BillingModule{}
