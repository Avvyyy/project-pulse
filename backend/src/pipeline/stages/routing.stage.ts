import { Injectable } from '@nestjs/common';
import { EventRouting, ProcessableEvent, StorageDestination } from '../types/processable-event';

/**
 * RoutingStage
 *
 * Inspects the normalised + enriched + fingerprinted event and decides:
 *   1. Which storage destinations to write to (postgres, elasticsearch)
 *   2. Whether to create / update an ErrorGroup
 *   3. Whether the event should be dropped entirely
 *   4. Priority level (affects BullMQ queue priority in future work)
 *
 * This is the only stage that may DROP an event. A dropped event is acked
 * from the queue but not persisted — used for spam / noise filtering.
 */
@Injectable()
export class RoutingStage {
  process(event: ProcessableEvent): ProcessableEvent {
    const drop = this.shouldDrop(event);
    if (drop) {
      return {
        ...event,
        routing: {
          createErrorGroup: false,
          destinations:     [],
          priority:         'normal',
          drop:             true,
          dropReason:       drop,
        },
      };
    }

    const createErrorGroup = GROUPED_LEVELS.has(event.level);
    const destinations     = this.resolveDestinations(event);
    const priority         = this.resolvePriority(event);

    const routing: EventRouting = {
      createErrorGroup,
      destinations,
      priority,
      drop: false,
    };

    return { ...event, routing };
  }

  // ─── Drop conditions ──────────────────────────────────────────────────────
  //
  // Returns a string (the reason) if the event should be dropped, null otherwise.

  private shouldDrop(event: ProcessableEvent): string | null {
    // 1. Future timestamp drift > 1 hour (indicates misconfigured client clock)
    const futureMs = event.timestamp.getTime() - event.receivedAt.getTime();
    if (futureMs > 60 * 60 * 1_000) {
      return `event timestamp is ${Math.round(futureMs / 60_000)}m in the future`;
    }

    // 2. Extremely stale events older than 30 days
    const ageMs = event.receivedAt.getTime() - event.timestamp.getTime();
    if (ageMs > 30 * 24 * 60 * 60 * 1_000) {
      return 'event is older than 30 days';
    }

    return null;
  }

  // ─── Destinations ─────────────────────────────────────────────────────────

  private resolveDestinations(event: ProcessableEvent): StorageDestination[] {
    const dest: StorageDestination[] = ['postgres', 'elasticsearch'];
    return dest;
  }

  // ─── Priority ─────────────────────────────────────────────────────────────
  //
  // High-priority events are processed before normal ones.
  // Currently: error-level events are high priority.
  // Future: add alert-match check here to mark critical incidents.

  private resolvePriority(event: ProcessableEvent): 'normal' | 'high' {
    const score = event.enrichment?.severityScore ?? 0;
    return score >= 4 ? 'high' : 'normal';
  }
}

const GROUPED_LEVELS = new Set(['error', 'warn']);
