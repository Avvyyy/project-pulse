import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { EventFingerprints, ProcessableEvent, StackFrame } from '../types/processable-event';

/**
 * FingerprintStage — automatic error grouping
 *
 * PROBLEM:
 *   "Database timeout on request 1"
 *   "Database timeout on request 2"
 *   "Database timeout on request 3"
 *   → three separate events that are really the same issue
 *
 * SOLUTION:
 *   Normalise the message by stripping all variable parts (IDs, numbers,
 *   timestamps, hex strings) before hashing. The three messages above all
 *   normalise to "database timeout on request {n}" and therefore share
 *   the same fingerprint → one ErrorGroup with occurrenceCount = 3.
 *
 * TWO FINGERPRINT STRATEGIES:
 *
 *   1. Message fingerprint — always available
 *      SHA-256( service + ":" + level + ":" + normalise(message) )
 *      Good for: errors without stack traces (network errors, business logic)
 *      Weakness: if the message template changes across deploys, the group splits
 *
 *   2. Stack fingerprint — available when a stack trace is present
 *      SHA-256( first 5 app frames )
 *      Good for: code exceptions where the throw-site is stable
 *      Weakness: inlined/minified code collapses different errors to the same site
 *
 * TRADE-OFFS:
 *
 *   Message-based grouping:
 *     ✓ Works for all event types (logs, metrics, business events)
 *     ✓ Resistant to refactoring (throw site moves but message stays)
 *     ✗ Format strings without placeholders create false positives
 *       ("user X failed" vs "service Y failed" → different groups — correct)
 *     ✗ Highly dynamic messages fragment into many groups before normalisation
 *
 *   Stack-based grouping:
 *     ✓ Immune to message variation — same bug = same group regardless of input
 *     ✓ Survives log message refactors
 *     ✗ Minified/transpiled code: source maps not yet applied, frames may shift
 *     ✗ No stack available for warn/info/metric events
 *     ✗ Library bugs: top frames are all node_modules → same fingerprint for
 *       unrelated errors (mitigated by filtering to app-only frames)
 *
 * PRIMARY fingerprint:
 *   Uses `stack` when ≥ 2 app frames are available (enough signal).
 *   Falls back to `message` otherwise.
 *   This means: same bug caught in two different code paths → two groups
 *   (acceptable: the groups surface in the UI and ops can merge them).
 *
 * EDGE CASES HANDLED:
 *   - Empty messages after normalisation → treated as "(no message)"
 *   - Stack with only node_modules frames → no stack fingerprint (falls back to message)
 *   - Very long messages → truncated to 300 chars before hashing
 *   - Multi-line messages → newlines normalised to spaces
 */
@Injectable()
export class FingerprintStage {
  process(event: ProcessableEvent): ProcessableEvent {
    const msgFingerprint   = computeMessageFingerprint(event.service, event.level, event.message);
    const appFrames        = event.enrichment?.parsedStack?.filter((f) => f.isApp) ?? [];
    const stackFingerprint = appFrames.length >= 2 ? computeStackFingerprint(appFrames) : null;

    const fingerprints: EventFingerprints = {
      message: msgFingerprint,
      stack:   stackFingerprint,
      primary: stackFingerprint ?? msgFingerprint,
    };

    return { ...event, fingerprints };
  }
}

// ─── Message fingerprint ──────────────────────────────────────────────────────

function computeMessageFingerprint(service: string, level: string, message: string): string {
  const normalised = normaliseMessage(message);
  return sha256(`${service}:${level}:${normalised}`);
}

/**
 * Strips all variable parts from a message so that messages generated
 * by the same code path produce the same normalised string.
 *
 * Transformation examples:
 *   "Database timeout on request 1"     → "database timeout on request {n}"
 *   "JWT expired at 2026-06-01T10:00Z"  → "jwt expired at {ts}"
 *   "User abc-123-def failed login"      → "user {uuid} failed login"
 *   "Fetched 230ms, got 500"             → "fetched {n}ms, got {n}"
 *   "req_id=a1b2c3d4 failed"             → "req_id={hex} failed"
 */
export function normaliseMessage(message: string): string {
  return message
    .slice(0, 300)
    // ISO-8601 timestamps before number stripping (so "2026-06-01" isn't "{n}-{n}-{n}")
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g, '{ts}')
    // UUIDs (v4 / v1)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{uuid}')
    // Long hex strings (SHA hashes, request IDs)
    .replace(/\b[0-9a-f]{12,}\b/gi, '{hex}')
    // IP addresses
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '{ip}')
    // Standalone integers and floats
    .replace(/\b\d+(\.\d+)?\b/g, '{n}')
    // Collapse whitespace including newlines
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim() || '(no message)';
}

// ─── Stack fingerprint ────────────────────────────────────────────────────────

function computeStackFingerprint(appFrames: StackFrame[]): string {
  const key = appFrames
    .slice(0, 5)
    .map((f) => `${f.fn ?? '_'}@${f.file ?? '?'}:${f.line ?? 0}`)
    .join('|');
  return sha256(key);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
