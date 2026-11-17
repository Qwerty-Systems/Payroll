import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { WorkerDocumentsController } from './worker-documents.controller';
import { WorkerDocumentsService } from './worker-documents.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WorkerDocumentsController],
  providers: [WorkerDocumentsService],
})
export class WorkerDocumentsModule {}
