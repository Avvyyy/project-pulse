import { Injectable, Logger } from '@nestjs/common';
import { ProcessableEvent } from '../types/processable-event';

/**
 * NormalizationStage
 *
 * Responsibilities:
 *  - Standardise field formats (lowercase level/env, trim service name)
 *  - Cap field lengths to schema constraints
 *  - Strip PII / sensitive keys from metadata
 *  - Promote a stack trace that the client buried inside metadata
 *  - Guarantee the event has a non-empty message
 */
@Injectable()
export class NormalizationStage {
  private readonly logger = new Logger(NormalizationStage.name);

  process(event: ProcessableEvent): ProcessableEvent {
    const service     = event.service.trim().toLowerCase().slice(0, 100);
    const environment = event.environment.trim().toLowerCase();
    const level       = event.level.trim().toLowerCase();
    const message     = event.message.trim().slice(0, 10_000) || '(no message)';
    const metadata    = this.sanitizeMetadata(event.metadata);
    const stackTrace  = this.resolveStackTrace(event.stackTrace, metadata);

    return {
      ...event,
      service,
      environment,
      level,
      message,
      stackTrace,
      metadata,
    };
  }

  // ─── PII sanitisation ─────────────────────────────────────────────────────
  //
  // Keys matching the pattern are dropped entirely; values are not scanned
  // because the key name is a reliable signal and value scanning is expensive.
  // Add a custom allow-list via config if legitimate keys match the pattern.
  private sanitizeMetadata(raw: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKey =
      /\b(password|passwd|secret|token|api.?key|auth|credential|ssn|credit.?card|cvv|pin|private.?key)\b/i;

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (sensitiveKey.test(key)) {
        this.logger.debug(`Redacted sensitive key: ${key}`);
        continue;
      }
      // Recurse one level for nested objects (e.g. { user: { password: "x" } })
      sanitized[key] =
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? this.sanitizeMetadata(value as Record<string, unknown>)
          : value;
    }
    return sanitized;
  }

  // ─── Stack trace promotion ────────────────────────────────────────────────
  //
  // Some client SDKs embed the stack trace inside metadata rather than
  // the top-level stackTrace field. Common conventions are checked in order.
  private resolveStackTrace(
    explicit: string | null,
    metadata: Record<string, unknown>,
  ): string | null {
    if (explicit?.trim()) return explicit.trim();

    const candidates = [
      metadata['stack_trace'],
      metadata['stackTrace'],
      metadata['stack'],
      (metadata['error'] as any)?.stack,
      (metadata['exception'] as any)?.stacktrace,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim().slice(0, 50_000);
      }
    }
    return null;
  }
}
