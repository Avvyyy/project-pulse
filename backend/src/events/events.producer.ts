import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { IngestEventDto } from './dto/ingest-event.dto';
import { BatchIngestDto } from './dto/batch-ingest.dto';

export interface EventJobPayload {
  id:          string;
  service:     string;
  environment: string;
  level:       string;
  message:     string;
  stackTrace?: string;
  timestamp:   string;
  metadata?:   Record<string, unknown>;
  apiKeyId:    string;
  receivedAt:  string;
}

const JOB_OPTIONS = {
  removeOnComplete: { count: 10_000 },
  removeOnFail:     { count: 5_000, age: 24 * 3600 },
  attempts: 3,
  backoff:  { type: 'exponential', delay: 1_000 },
} as const;

@Injectable()
export class EventsProducer {
  constructor(
    @InjectQueue('event-ingestion') private readonly queue: Queue,
  ) {}

  async publish(dto: IngestEventDto, apiKeyId: string): Promise<{ id: string; receivedAt: Date }> {
    const id         = uuidv4();
    const receivedAt = new Date();

    await this.queue.add('process-event', this.toPayload(dto, id, apiKeyId, receivedAt), {
      ...JOB_OPTIONS,
      jobId: id,
    });

    return { id, receivedAt };
  }

  async publishBatch(dto: BatchIngestDto, apiKeyId: string): Promise<{ count: number; receivedAt: Date }> {
    const receivedAt = new Date();

    const jobs = dto.events.map((event) => {
      const id = uuidv4();
      return {
        name: 'process-event' as const,
        data: this.toPayload(event, id, apiKeyId, receivedAt),
        opts: { ...JOB_OPTIONS, jobId: id },
      };
    });

    await this.queue.addBulk(jobs);
    return { count: jobs.length, receivedAt };
  }

  private toPayload(
    dto: IngestEventDto,
    id: string,
    apiKeyId: string,
    receivedAt: Date,
  ): EventJobPayload {
    return {
      id,
      service:     dto.service,
      environment: dto.environment,
      level:       dto.level,
      message:     dto.message,
      stackTrace:  dto.stackTrace,
      timestamp:   dto.timestamp,
      metadata:    dto.metadata,
      apiKeyId,
      receivedAt:  receivedAt.toISOString(),
    };
  }
}
