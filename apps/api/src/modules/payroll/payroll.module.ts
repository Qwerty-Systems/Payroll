import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PayrollPostFinalizationService } from './payroll-post-finalization.service';
import { PayrollBankReconciliationService } from './payroll-bank-reconciliation.service';

@Module({ imports: [DatabaseModule], controllers: [PayrollController], providers: [PayrollService, PayrollPostFinalizationService, PayrollBankReconciliationService] })
export class PayrollModule {}
