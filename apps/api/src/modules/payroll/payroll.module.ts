import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({ imports: [DatabaseModule], controllers: [PayrollController], providers: [PayrollService] })
export class PayrollModule {}
