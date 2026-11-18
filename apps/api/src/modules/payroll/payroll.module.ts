import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PayrollPostFinalizationService } from './payroll-post-finalization.service';

@Module({ imports: [DatabaseModule], controllers: [PayrollController], providers: [PayrollService, PayrollPostFinalizationService] })
export class PayrollModule {}
