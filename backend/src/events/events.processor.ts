import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventProcessingPipeline } from '../pipeline/pipeline.service';
import { StorageService } from '../storage/storage.service';
import { SearchService } from '../search/search.service';
import { EventJobPayload } from './events.producer';

@Processor('event-ingestion', { concurrency: 10 })
export class EventsProcessor extends WorkerHost {
  private readonly logger = new Logger(EventsProcessor.name);

  constructor(
    private readonly pipeline: EventProcessingPipeline,
    private readonly storage:  StorageService,
    private readonly search:   SearchService,
  ) {
    super();
  }

  async process(job: Job<EventJobPayload>): Promise<void> {
    // 1. Run through the four-stage processing pipeline.
    const processed = await this.pipeline.process(job.data);

    // 2. Honour routing decisions.
    if (processed.routing!.drop) return;

    // 3. Persist to Postgres (includes error group upsert + registry update).
    const { event, errorGroup } = await this.storage.persist(processed);

    // 4. Index in Elasticsearch.
    if (processed.routing!.destinations.includes('elasticsearch')) {
      await this.search.indexEvent({
        id:           event.id,
        service:      event.service,
        environment:  event.environment,
        level:        event.level,
        message:      event.message,
        timestamp:    event.timestamp,
        metadata:     processed.metadata,
        errorGroupId: event.errorGroupId ?? undefined,
        fingerprint:  event.fingerprint ?? undefined,
        apiKeyId:     event.apiKeyId,
        receivedAt:   event.receivedAt,
        createdAt:    event.createdAt,
        // Enrichment fields for richer ES queries
        severityScore:       event.severityScore ?? undefined,
        errorType:           event.errorType ?? undefined,
        httpStatusCode:      event.httpStatusCode ?? undefined,
        tags:                event.tags,
      });

      if (errorGroup) {
        await this.search.upsertErrorGroup({
          id:              errorGroup.id,
          fingerprint:     errorGroup.fingerprint,
          service:         errorGroup.service,
          environment:     errorGroup.environment,
          level:           errorGroup.level,
          title:           errorGroup.title,
          occurrenceCount: errorGroup.occurrenceCount,
          firstSeenAt:     errorGroup.firstSeenAt,
          lastSeenAt:      errorGroup.lastSeenAt,
          status:          errorGroup.status,
        });
      }
    }
  }
}
