import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { IngestionLoggerInterceptor } from '../common/interceptors/ingestion-logger.interceptor';
import { EventsProducer } from './events.producer';
import { IngestEventDto } from './dto/ingest-event.dto';
import { BatchIngestDto } from './dto/batch-ingest.dto';

@Controller('ingest')
@UseGuards(ApiKeyGuard, RateLimitGuard)
@UseInterceptors(IngestionLoggerInterceptor)
export class EventsController {
  constructor(private readonly producer: EventsProducer) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async ingest(@Body() dto: IngestEventDto, @Req() req: Request) {
    const apiKey = (req as any).apiKey;
    const { id, receivedAt } = await this.producer.publish(dto, apiKey.id);

    return {
      event_id:    id,
      received_at: receivedAt,
      status:      'accepted',
    };
  }

  @Post('batch')
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestBatch(@Body() dto: BatchIngestDto, @Req() req: Request) {
    const apiKey = (req as any).apiKey;
    const { count, receivedAt } = await this.producer.publishBatch(dto, apiKey.id);

    return {
      accepted:    count,
      received_at: receivedAt,
      status:      'accepted',
    };
  }
}
