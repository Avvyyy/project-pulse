import { Injectable, Logger } from '@nestjs/common';
import { ErrorGroup, Event, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProcessableEvent } from '../pipeline/types/processable-event';

export interface StoredEvent {
  event:      Event;
  errorGroup: ErrorGroup | null;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists a fully processed event.
   *
   * Guarantees:
   *   - Idempotent: duplicate BullMQ retries return the existing row.
   *   - Atomic error group counter: uses Prisma upsert which compiles to
   *     INSERT … ON CONFLICT DO UPDATE — safe under concurrent writes.
   *   - Service/environment registry updates are fire-and-forget.
   */
  async persist(processed: ProcessableEvent): Promise<StoredEvent> {
    const errorGroup = processed.routing!.createErrorGroup
      ? await this.upsertErrorGroup(processed)
      : null;

    const event = await this.createEventIdempotent(processed, errorGroup?.id ?? null);

    void this.updateRegistries(processed);

    return { event, errorGroup };
  }

  // ─── Error group ───────────────────────────────────────────────────────────

  private async upsertErrorGroup(processed: ProcessableEvent): Promise<ErrorGroup> {
    const now         = new Date();
    const fingerprint = processed.fingerprints!.primary;
    const title       = processed.message.slice(0, 500);

    return this.prisma.errorGroup.upsert({
      where:  { fingerprint },
      create: {
        fingerprint,
        service:        processed.service,
        environment:    processed.environment,
        level:          processed.level,
        title,
        occurrenceCount: 1,
        firstSeenAt:    now,
        lastSeenAt:     now,
        status:         'open',
      },
      update: {
        occurrenceCount: { increment: 1 },
        lastSeenAt:      now,
      },
    });
  }

  // ─── Event (idempotent) ────────────────────────────────────────────────────

  private async createEventIdempotent(
    processed: ProcessableEvent,
    errorGroupId: string | null,
  ): Promise<Event> {
    const data: Prisma.EventCreateInput = {
      id:                  processed.id,
      service:             processed.service,
      environment:         processed.environment,
      level:               processed.level,
      message:             processed.message,
      stackTrace:          processed.stackTrace,
      timestamp:           processed.timestamp,
      metadata:            processed.metadata as Prisma.JsonObject,
      fingerprint:         processed.fingerprints!.primary,
      apiKey:              { connect: { id: processed.apiKeyId } },
      receivedAt:          processed.receivedAt,
      // Enrichment columns
      severityScore:       processed.enrichment!.severityScore,
      errorType:           processed.enrichment!.errorType,
      httpStatusCode:      processed.enrichment!.httpStatusCode,
      processingLatencyMs: processed.enrichment!.processingLatencyMs,
      tags:                processed.enrichment!.tags,
      parsedStack:         processed.enrichment!.parsedStack
                             ? (processed.enrichment!.parsedStack as unknown as Prisma.JsonArray)
                             : Prisma.JsonNull,
      ...(errorGroupId ? { errorGroup: { connect: { id: errorGroupId } } } : {}),
    };

    try {
      return await this.prisma.event.create({ data });
    } catch (err: any) {
      if (err.code === 'P2002') {
        // Duplicate job execution — return the already-stored row.
        this.logger.warn(`Duplicate event skipped: ${processed.id}`);
        return this.prisma.event.findUniqueOrThrow({ where: { id: processed.id } });
      }
      throw err;
    }
  }

  // ─── Service + environment registries ─────────────────────────────────────

  private async updateRegistries(processed: ProcessableEvent): Promise<void> {
    const now     = new Date();
    const isError = processed.routing!.createErrorGroup;

    try {
      await Promise.all([
        this.prisma.service.upsert({
          where:  { name: processed.service },
          create: {
            name: processed.service,
            firstSeenAt: now,
            lastSeenAt:  now,
            eventCount:  1,
            errorCount:  isError ? 1 : 0,
          },
          update: {
            lastSeenAt: now,
            eventCount: { increment: 1 },
            ...(isError ? { errorCount: { increment: 1 } } : {}),
          },
        }),
        this.prisma.environment.upsert({
          where:  { name: processed.environment },
          create: { name: processed.environment, firstSeenAt: now, lastSeenAt: now },
          update: { lastSeenAt: now },
        }),
      ]);
    } catch (err: any) {
      this.logger.warn(`Registry update failed: ${err.message}`);
    }
  }
}
