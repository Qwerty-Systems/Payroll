import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';

@Module({ imports: [DatabaseModule], controllers: [ComplianceController], providers: [ComplianceService] })
export class ComplianceModule {}
