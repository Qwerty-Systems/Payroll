import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({ imports: [DatabaseModule], controllers: [IntegrationsController], providers: [IntegrationsService] })
export class IntegrationsModule {}
