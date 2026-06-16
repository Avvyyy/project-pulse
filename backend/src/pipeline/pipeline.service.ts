import { Injectable, Logger } from '@nestjs/common';
import { EventJobPayload } from '../events/events.producer';
import { fromJobPayload, ProcessableEvent } from './types/processable-event';
import { NormalizationStage } from './stages/normalization.stage';
import { EnrichmentStage } from './stages/enrichment.stage';
import { FingerprintStage } from './stages/fingerprint.stage';
import { RoutingStage } from './stages/routing.stage';

/**
 * EventProcessingPipeline
 *
 * Runs the four processing stages in order. Each stage returns a new
 * ProcessableEvent (immutable-style); the pipeline accumulates all changes.
 *
 * Stage order is strict — later stages depend on earlier ones:
 *   Normalization → Enrichment → Fingerprint → Routing
 *
 * If any stage throws, the error propagates to the BullMQ worker which
 * will retry the job up to 3 times with exponential backoff before moving
 * it to the failed set.
 */
@Injectable()
export class EventProcessingPipeline {
  private readonly logger = new Logger(EventProcessingPipeline.name);

  constructor(
    private readonly normalization: NormalizationStage,
    private readonly enrichment:   EnrichmentStage,
    private readonly fingerprint:  FingerprintStage,
    private readonly routing:      RoutingStage,
  ) {}

  async process(payload: EventJobPayload): Promise<ProcessableEvent> {
    const start = Date.now();
    let event   = fromJobPayload(payload);

    event = this.normalization.process(event);
    event = this.enrichment.process(event);
    event = this.fingerprint.process(event);
    event = this.routing.process(event);

    const ms = Date.now() - start;

    if (event.routing!.drop) {
      this.logger.warn(
        `[PIPELINE] Dropped event ${event.id}: ${event.routing!.dropReason} (${ms}ms)`,
      );
    } else {
      this.logger.debug(
        `[PIPELINE] ${event.id} processed in ${ms}ms` +
        ` | ${event.service}/${event.level}` +
        ` | tags=[${event.enrichment!.tags.join(',')}]` +
        ` | fingerprint=${event.fingerprints!.primary.slice(0, 8)}` +
        ` | priority=${event.routing!.priority}`,
      );
    }

    return event;
  }
}
