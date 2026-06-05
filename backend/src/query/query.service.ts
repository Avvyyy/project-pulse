import { Injectable, Logger } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { ConfigService } from '@nestjs/config';
import { SearchEventsDto, SearchErrorGroupsDto } from './dto/search-events.dto';

export interface SearchHit<T = Record<string, unknown>> {
  id:     string;
  score:  number | null;
  source: T;
}

export interface SearchResult<T> {
  total:   number;
  page:    number;
  limit:   number;
  results: SearchHit<T>[];
}

@Injectable()
export class QueryService {
  private readonly logger      = new Logger(QueryService.name);
  private readonly eventsIndex: string;
  private readonly groupsIndex: string;

  constructor(
    private readonly es:     ElasticsearchService,
    private readonly config: ConfigService,
  ) {
    this.eventsIndex = config.get<string>('elasticsearch.indexEvents', 'pulse_events');
    this.groupsIndex = `${this.eventsIndex}_error_groups`;
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  async searchEvents(dto: SearchEventsDto): Promise<SearchResult<unknown>> {
    const { textQuery, filters } = parseQueryString(dto.q);
    const from = (dto.page ?? 0) * (dto.limit ?? 50);

    const must:   unknown[] = [];
    const filter: unknown[] = [];

    // Free-text on message
    const text = textQuery?.trim();
    if (text) {
      must.push({
        multi_match: {
          query:  text,
          fields: ['message^3', 'message.keyword', 'error_type'],
          type:   'best_fields',
          fuzziness: 'AUTO',
        },
      });
    }

    // Structured filters — from DTO fields + parsed query tokens
    const merged = mergeFilters(filters, {
      service:          dto.service,
      environment:      dto.environment,
      level:            dto.level,
      error_type:       dto.errorType,
      http_status_code: dto.httpStatusCode,
      fingerprint:      dto.fingerprint,
    });

    for (const [field, value] of Object.entries(merged)) {
      if (value !== undefined && value !== null) {
        filter.push({ term: { [field]: value } });
      }
    }

    // Tags (must contain ALL specified tags)
    if (dto.tags?.length) {
      for (const tag of dto.tags) {
        filter.push({ term: { tags: tag } });
      }
    }

    // Date range
    if (dto.from || dto.to) {
      filter.push({
        range: {
          timestamp: {
            ...(dto.from ? { gte: dto.from } : {}),
            ...(dto.to   ? { lte: dto.to   } : {}),
          },
        },
      });
    }

    const sortField = dto.sortBy ?? 'timestamp';
    const sortOrder = dto.sortOrder ?? 'desc';

    const response = await this.es.search({
      index: this.eventsIndex,
      from,
      size:  dto.limit ?? 50,
      query: {
        bool: {
          must:   must.length   ? must   : [{ match_all: {} }],
          filter: filter.length ? filter : undefined,
        },
      },
      sort: [
        { [sortField]: { order: sortOrder } },
        { _score: { order: 'desc' } },
      ],
      track_total_hits: true,
    });

    return this.toResult(response, dto.page ?? 0, dto.limit ?? 50);
  }

  // ─── Error groups ─────────────────────────────────────────────────────────

  async searchErrorGroups(dto: SearchErrorGroupsDto): Promise<SearchResult<unknown>> {
    const { textQuery, filters } = parseQueryString(dto.q);
    const from = (dto.page ?? 0) * (dto.limit ?? 50);

    const must:   unknown[] = [];
    const filter: unknown[] = [];

    const text = textQuery?.trim();
    if (text) {
      must.push({
        multi_match: {
          query:  text,
          fields: ['title^3', 'title.keyword'],
          type:   'best_fields',
          fuzziness: 'AUTO',
        },
      });
    }

    const merged = mergeFilters(filters, {
      service:     dto.service,
      environment: dto.environment,
      level:       dto.level,
      status:      dto.status,
    });

    for (const [field, value] of Object.entries(merged)) {
      if (value !== undefined && value !== null) {
        filter.push({ term: { [field]: value } });
      }
    }

    // Default: only show open groups unless status is explicitly set
    if (!merged.status && !dto.status) {
      filter.push({ term: { status: 'open' } });
    }

    const sortField = dto.sortBy === 'occurrenceCount' ? 'occurrence_count'
                    : dto.sortBy === 'firstSeenAt'     ? 'first_seen_at'
                    : 'last_seen_at';

    const response = await this.es.search({
      index: this.groupsIndex,
      from,
      size:  dto.limit ?? 50,
      query: {
        bool: {
          must:   must.length   ? must   : [{ match_all: {} }],
          filter: filter.length ? filter : undefined,
        },
      },
      sort: [{ [sortField]: { order: dto.sortOrder ?? 'desc' } }],
      track_total_hits: true,
    });

    return this.toResult(response, dto.page ?? 0, dto.limit ?? 50);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private toResult(response: any, page: number, limit: number): SearchResult<unknown> {
    const total   = typeof response.hits.total === 'number'
      ? response.hits.total
      : response.hits.total?.value ?? 0;

    const results = (response.hits.hits ?? []).map((hit: any) => ({
      id:     hit._id,
      score:  hit._score ?? null,
      source: hit._source,
    }));

    return { total, page, limit, results };
  }
}

// ─── Query language parser ────────────────────────────────────────────────────
//
// Parses a query string with "field:value" tokens into structured filters
// plus a free-text remainder.
//
// Input:  "service:payments level:error timeout"
// Output: { filters: { service: "payments", level: "error" }, textQuery: "timeout" }
//
// Supported field aliases:
//   svc / service, env / environment, lvl / level, type / error_type, status

const FIELD_ALIASES: Record<string, string> = {
  svc:         'service',
  env:         'environment',
  lvl:         'level',
  type:        'error_type',
  http:        'http_status_code',
  fingerprint: 'fingerprint',
  status:      'status',
};

function parseQueryString(q?: string): {
  textQuery: string | undefined;
  filters: Record<string, unknown>;
} {
  if (!q?.trim()) return { textQuery: undefined, filters: {} };

  const filters: Record<string, unknown> = {};
  const textParts: string[] = [];

  for (const token of q.trim().split(/\s+/)) {
    const colonIdx = token.indexOf(':');
    if (colonIdx > 0) {
      const rawField = token.slice(0, colonIdx).toLowerCase();
      const value    = token.slice(colonIdx + 1);
      const field    = FIELD_ALIASES[rawField] ?? rawField;
      if (value) filters[field] = value;
    } else {
      textParts.push(token);
    }
  }

  return {
    textQuery: textParts.length ? textParts.join(' ') : undefined,
    filters,
  };
}

// Merges parsed query-language filters with explicit DTO fields.
// DTO fields win on conflict (they're more intentional).
function mergeFilters(
  parsed: Record<string, unknown>,
  explicit: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...parsed };
  for (const [k, v] of Object.entries(explicit)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}
