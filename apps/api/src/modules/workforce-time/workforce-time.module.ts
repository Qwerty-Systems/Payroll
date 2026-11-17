import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { WorkforceTimeController } from './workforce-time.controller';
import { WorkforceTimeService } from './workforce-time.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WorkforceTimeController],
  providers: [WorkforceTimeService],
})
export class WorkforceTimeModule {}
