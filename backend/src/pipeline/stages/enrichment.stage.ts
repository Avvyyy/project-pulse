import { Injectable } from '@nestjs/common';
import { EventEnrichment, ProcessableEvent, StackFrame } from '../types/processable-event';

/**
 * EnrichmentStage
 *
 * Adds computed, derived fields that are expensive to reconstruct at query time:
 *   - severityScore    — numeric sort key (higher = more urgent)
 *   - errorType        — normalised exception class / error code
 *   - httpStatusCode   — extracted from message or metadata
 *   - parsedStack      — structured frames from a raw stack trace string
 *   - processingLatencyMs — detects clock drift / buffered events
 *   - tags             — auto-extracted categorical labels
 */
@Injectable()
export class EnrichmentStage {
  process(event: ProcessableEvent): ProcessableEvent {
    const parsedStack   = event.stackTrace ? parseStackTrace(event.stackTrace) : null;
    const httpStatus    = extractHttpStatus(event.message, event.metadata);
    const errorType     = extractErrorType(event.message, event.stackTrace);
    const tags          = extractTags(event.message, event.metadata, event.level);
    const latencyMs     = event.receivedAt.getTime() - event.timestamp.getTime();

    const enrichment: EventEnrichment = {
      severityScore:       SEVERITY_SCORES[event.level] ?? 0,
      errorType,
      httpStatusCode:      httpStatus,
      isClientError:       httpStatus !== null && httpStatus >= 400 && httpStatus < 500,
      isServerError:       httpStatus !== null && httpStatus >= 500,
      parsedStack,
      processingLatencyMs: latencyMs,
      tags,
    };

    return { ...event, enrichment };
  }
}

// ─── Severity ─────────────────────────────────────────────────────────────────

const SEVERITY_SCORES: Record<string, number> = {
  trace:    0,
  debug:    1,
  info:     2,
  warn:     3,
  error:    4,
  critical: 5,
};

// ─── Error type ───────────────────────────────────────────────────────────────
//
// Extracts the leading exception class or well-known error code.
// "TypeError: Cannot read property 'x'" → "TypeError"
// "ECONNREFUSED connect ECONNREFUSED 127.0.0.1:5432" → "ECONNREFUSED"
// "23505 duplicate key value violates unique constraint" → "PostgresError"

const ERROR_TYPE_PATTERNS: Array<[RegExp, string | null]> = [
  // JavaScript / Node built-ins
  [/^(TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|Error):/,            null], // null → use capture group 1
  // Node system errors
  [/\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOENT|EPERM|EACCES|EADDRINUSE)\b/,                 null],
  // Postgres error codes (5-char alphanumeric)
  [/\b([0-9A-Z]{5})\b.*(?:constraint|violates|duplicate|relation)/,                          'PostgresError'],
  // Python
  [/^(ValueError|KeyError|AttributeError|RuntimeError|ImportError|IndexError|TypeError):/,   null],
  // Java-style FQCN exceptions
  [/\b(\w+Exception)\b/,                                                                      null],
  // HTTP errors mentioned in message
  [/\b(4\d{2}|5\d{2})\b/,                                                                    'HttpError'],
];

function extractErrorType(message: string, stack: string | null): string | null {
  const sources = [message.slice(0, 200), (stack ?? '').slice(0, 500)].join(' ');
  for (const [pattern, override] of ERROR_TYPE_PATTERNS) {
    const m = sources.match(pattern);
    if (m) return override ?? m[1] ?? null;
  }
  return null;
}

// ─── HTTP status ──────────────────────────────────────────────────────────────

function extractHttpStatus(message: string, metadata: Record<string, unknown>): number | null {
  // Prefer explicit metadata keys
  for (const key of ['statusCode', 'status_code', 'httpStatus', 'http_status', 'status']) {
    const v = metadata[key];
    if (typeof v === 'number' && v >= 100 && v < 600) return v;
    if (typeof v === 'string') {
      const n = parseInt(v, 10);
      if (!isNaN(n) && n >= 100 && n < 600) return n;
    }
  }
  // Fall back to message pattern: "404 Not Found", "HTTP 500 Internal Server Error"
  const m = message.match(/\b(4\d{2}|5\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

// ─── Tags ─────────────────────────────────────────────────────────────────────
//
// Tags are additive labels used for faceted filtering in the UI.
// Sources: message patterns, metadata keys, level.

const TAG_RULES: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\b(database|db|sql|postgres|mysql|mongo|redis|query|migration)\b/i,      tag: 'database'    },
  { pattern: /\b(auth|authentication|authorization|jwt|oauth|session|login|permission|token)\b/i, tag: 'auth' },
  { pattern: /\b(http|request|response|api|endpoint|route|graphql|rest|grpc)\b/i,      tag: 'http'        },
  { pattern: /\b(cache|cached|invalidat|hit|miss|evict)\b/i,                           tag: 'cache'       },
  { pattern: /\b(queue|kafka|bullmq|job|worker|consumer|producer|message)\b/i,         tag: 'queue'       },
  { pattern: /\b(timeout|timed.?out|deadline.?exceeded|context.?canceled)\b/i,         tag: 'timeout'     },
  { pattern: /\b(memory|heap|oom|out.?of.?memory|leak|gc|garbage)\b/i,                tag: 'memory'      },
  { pattern: /\b(network|connection|socket|tcp|dns|ECONNREFUSED|ETIMEDOUT)\b/i,        tag: 'network'     },
  { pattern: /\b(file|disk|fs|filesystem|io|read|write|ENOENT|storage)\b/i,           tag: 'filesystem'  },
  { pattern: /\b(config|configuration|env|environment.variable|missing.var)\b/i,      tag: 'config'      },
  { pattern: /\b(deploy|deployment|migration|rollout|release|version)\b/i,             tag: 'deployment'  },
  { pattern: /\b(payment|billing|invoice|charge|stripe|subscription)\b/i,             tag: 'payment'     },
  { pattern: /\b(email|sms|notification|push|webhook|event)\b/i,                      tag: 'notification'},
];

function extractTags(
  message: string,
  metadata: Record<string, unknown>,
  level: string,
): string[] {
  const tags = new Set<string>();

  tags.add(level); // level is always a tag

  const corpus = message + ' ' + Object.keys(metadata).join(' ');
  for (const { pattern, tag } of TAG_RULES) {
    if (pattern.test(corpus)) tags.add(tag);
  }

  // Promote explicit metadata.tags / metadata.labels arrays
  for (const key of ['tags', 'labels', 'categories']) {
    const val = metadata[key];
    if (Array.isArray(val)) val.forEach((t) => typeof t === 'string' && tags.add(t.toLowerCase()));
  }

  return Array.from(tags);
}

// ─── Stack trace parser ───────────────────────────────────────────────────────
//
// Handles the two most common multi-runtime formats:
//
//   Node.js / V8:
//     at functionName (file.ts:42:12)
//     at Object.<anonymous> (/app/src/main.ts:10:5)
//
//   Generic:
//     at file.ts:42
//
// Falls back gracefully to a single-frame sentinel on unknown formats.

const V8_FRAME = /^\s*at\s+(?:(.+?)\s+\((.+?):(\d+):(\d+)\)|(.+?):(\d+):(\d+))/;
// Paths containing these substrings are considered non-app frames.
const NON_APP = /node_modules|\/internal\/|node:internal|node:events|<anonymous>/;

function parseStackTrace(raw: string): StackFrame[] {
  const frames: StackFrame[] = [];

  for (const line of raw.split('\n')) {
    const m = line.match(V8_FRAME);
    if (!m) continue;

    // Group 1–4: "at fn (file:line:col)"
    // Group 5–7: "at file:line:col"
    const fn   = m[1] ?? null;
    const file = m[2] ?? m[5] ?? null;
    const line2 = parseInt(m[3] ?? m[6] ?? '0', 10) || null;
    const col  = parseInt(m[4] ?? m[7] ?? '0', 10) || null;

    frames.push({
      fn:    fn ? normalizeFrameFn(fn) : null,
      file:  file ? normalizeFrameFile(file) : null,
      line:  line2,
      col,
      isApp: file ? !NON_APP.test(file) : false,
    });

    if (frames.length >= 30) break; // cap to 30 frames
  }

  return frames;
}

function normalizeFrameFn(fn: string): string {
  return fn.replace(/^Object\.<anonymous>/, '<anonymous>').trim();
}

function normalizeFrameFile(file: string): string {
  // Strip common absolute path prefixes that vary between deploys
  return file.replace(/^.*?\/(src|app|dist)\//, '$1/').trim();
}
