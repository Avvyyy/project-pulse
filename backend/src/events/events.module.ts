import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EventsController } from './events.controller';
import { EventsProducer } from './events.producer';
import { EventsProcessor } from './events.processor';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'event-ingestion' }),
    ApiKeysModule,  // provides ApiKeysService for ApiKeyGuard
  ],
  controllers: [EventsController],
  providers: [
    EventsProducer,
    EventsProcessor,
    ApiKeyGuard,
    RateLimitGuard,
  ],
})
export class EventsModule {}
