import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { PlatformComplianceController } from './platform-compliance.controller';
import { PlatformComplianceGuard } from './platform-compliance.guard';
import { PlatformComplianceService } from './platform-compliance.service';
@Module({imports:[DatabaseModule],controllers:[PlatformComplianceController],providers:[PlatformComplianceGuard,PlatformComplianceService]})
export class PlatformComplianceModule{}
