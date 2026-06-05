import { EventJobPayload } from '../../events/events.producer';

// ─── Stack frames ─────────────────────────────────────────────────────────────

export interface StackFrame {
  fn:    string | null;
  file:  string | null;
  line:  number | null;
  col:   number | null;
  isApp: boolean; // false when file is node_modules / vendor / runtime
}

// ─── Enrichment ───────────────────────────────────────────────────────────────

export interface EventEnrichment {
  severityScore:       number;       // 0–5 (trace=0 … error=4, critical path=5)
  errorType:           string | null; // e.g. "TypeError", "ECONNREFUSED", "HttpError"
  httpStatusCode:      number | null;
  isClientError:       boolean;
  isServerError:       boolean;
  parsedStack:         StackFrame[] | null;
  processingLatencyMs: number;       // receivedAt − timestamp; large = clock drift
  tags:                string[];     // auto-extracted categorical tags
}

// ─── Fingerprints ─────────────────────────────────────────────────────────────

export interface EventFingerprints {
  /**
   * Message-based fingerprint.
   * SHA-256( service + ":" + level + ":" + normalise(message) )
   * Normalisation strips UUIDs, timestamps, integers, hex IDs so that
   * "Database timeout on request 1" ≡ "Database timeout on request 2".
   */
  message: string;

  /**
   * Stack-based fingerprint (more precise grouping when a stack trace exists).
   * SHA-256 over the first 5 app frames (node_modules excluded).
   * Two occurrences with identical throw-site but different messages
   * will share the same stack fingerprint.
   */
  stack: string | null;

  /**
   * The fingerprint used to look up / upsert the ErrorGroup.
   * Prefers `stack` when available because it tolerates message variation.
   */
  primary: string;
}

// ─── Routing ──────────────────────────────────────────────────────────────────

export type StorageDestination = 'postgres' | 'elasticsearch';

export interface EventRouting {
  createErrorGroup: boolean;
  destinations:     StorageDestination[];
  priority:         'normal' | 'high';
  /** When true the event failed a quality check and must not be persisted. */
  drop:             boolean;
  dropReason?:      string;
}

// ─── Processable event ────────────────────────────────────────────────────────
//
// This is the single context object that flows through the pipeline.
// Stages mutate it in place via Object.assign / spread. Each stage is
// responsible for exactly one section of the object.

export interface ProcessableEvent {
  // ── Normalised (set by NormalisationStage) ─────────────────────────────────
  id:          string;
  service:     string;
  environment: string;
  level:       string;
  message:     string;
  stackTrace:  string | null;
  timestamp:   Date;
  metadata:    Record<string, unknown>;
  apiKeyId:    string;
  receivedAt:  Date;

  // ── Set by EnrichmentStage ─────────────────────────────────────────────────
  enrichment:   EventEnrichment | null;

  // ── Set by FingerprintStage ────────────────────────────────────────────────
  fingerprints: EventFingerprints | null;

  // ── Set by RoutingStage ────────────────────────────────────────────────────
  routing:      EventRouting | null;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function fromJobPayload(payload: EventJobPayload): ProcessableEvent {
  return {
    id:          payload.id,
    service:     payload.service,
    environment: payload.environment,
    level:       payload.level,
    message:     payload.message,
    stackTrace:  payload.stackTrace ?? null,
    timestamp:   new Date(payload.timestamp),
    metadata:    payload.metadata ?? {},
    apiKeyId:    payload.apiKeyId,
    receivedAt:  new Date(payload.receivedAt),
    enrichment:   null,
    fingerprints: null,
    routing:      null,
  };
}
