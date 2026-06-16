import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { ConfigService } from '@nestjs/config';

// ─── Document shapes ─────────────────────────────────────────────────────────

export interface EventDocument {
  id:              string;
  service:         string;
  environment:     string;
  level:           string;
  message:         string;
  timestamp:       Date;
  metadata?:       Record<string, unknown>;
  errorGroupId?:   string;
  fingerprint?:    string;
  apiKeyId:        string;
  receivedAt:      Date;
  createdAt:       Date;
  // Enrichment
  severityScore?:  number;
  errorType?:      string;
  httpStatusCode?: number;
  tags?:           string[];
}

export interface ErrorGroupDocument {
  id:              string;
  fingerprint:     string;
  service:         string;
  environment:     string;
  level:           string;
  title:           string;
  occurrenceCount: number;
  firstSeenAt:     Date;
  lastSeenAt:      Date;
  status:          string;
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger      = new Logger(SearchService.name);
  private readonly eventsIndex: string;
  private readonly groupsIndex: string;

  constructor(
    private readonly es:     ElasticsearchService,
    private readonly config: ConfigService,
  ) {
    this.eventsIndex = config.get<string>('elasticsearch.indexEvents', 'pulse_events');
    this.groupsIndex = `${this.eventsIndex}_error_groups`;
  }

  async onModuleInit() {
    await this.setupEventsIndex();
    await this.setupErrorGroupsIndex();
  }

  async ping(): Promise<boolean> {
    try { await this.es.ping(); return true; }
    catch { return false; }
  }

  // ─── Events index ─────────────────────────────────────────────────────────

  async indexEvent(doc: EventDocument): Promise<void> {
    await this.es.index({
      index:    this.eventsIndex,
      id:       doc.id,
      document: this.toEventDoc(doc),
    });
  }

  async indexEventBatch(docs: EventDocument[]): Promise<void> {
    if (docs.length === 0) return;

    const operations = docs.flatMap((doc) => [
      { index: { _index: this.eventsIndex, _id: doc.id } },
      this.toEventDoc(doc),
    ]);

    const { errors, items } = await this.es.bulk({ operations });
    if (errors) {
      const n = items.filter((i) => i.index?.error).length;
      this.logger.warn(`Event bulk index: ${n}/${docs.length} failed`);
    }
  }

  // ─── Error group index ────────────────────────────────────────────────────

  async upsertErrorGroup(doc: ErrorGroupDocument): Promise<void> {
    await this.es.index({
      index:    this.groupsIndex,
      id:       doc.id,
      document: {
        fingerprint:      doc.fingerprint,
        service:          doc.service,
        environment:      doc.environment,
        level:            doc.level,
        title:            doc.title,
        occurrence_count: doc.occurrenceCount,
        first_seen_at:    doc.firstSeenAt,
        last_seen_at:     doc.lastSeenAt,
        status:           doc.status,
      },
    });
  }

  // ─── Setup ────────────────────────────────────────────────────────────────

  /**
   * Events index setup with ILM policy.
   *
   * Production scalability strategy:
   *
   *   ILM phases:
   *     hot  (0-7d)    — active writes; rollover when index > 5 GB or 7 days old
   *     warm (7-30d)   — read-only; forceMerge to 1 segment; shrink to 1 shard
   *     cold (30-90d)  — frozen; accessed rarely (incident investigation)
   *     delete (>90d)  — dropped automatically
   *
   *   This means no manual DELETE queries, no table locks, and storage costs
   *   stay bounded regardless of ingestion volume.
   *
   *   In development (single node, no replicas), ILM is created but rollover
   *   will not fire until the index exceeds 5 GB or 7 days — which is fine.
   */
  private async setupEventsIndex(): Promise<void> {
    try {
      await this.ensureIlmPolicy();
      await this.ensureIndexTemplate();

      const writeAlias = this.eventsIndex;
      const aliasExists = await this.es.indices.existsAlias({ name: writeAlias }).catch(() => false);

      if (!aliasExists) {
        const initialIndex = `${writeAlias}-000001`;
        await this.es.indices.create({
          index: initialIndex,
          settings: {
            number_of_shards:              1,
            number_of_replicas:            0,
            'index.lifecycle.name':        'pulse-events-ilm',
            'index.lifecycle.rollover_alias': writeAlias,
          },
          mappings: { properties: eventsMapping },
          aliases:  { [writeAlias]: { is_write_index: true } },
        });
        this.logger.log(`Created events index: ${initialIndex} (alias: ${writeAlias})`);
      }
    } catch (err: any) {
      this.logger.warn(`Events index setup failed (non-fatal): ${err.message}`);
    }
  }

  private async ensureIlmPolicy(): Promise<void> {
    const name = 'pulse-events-ilm';
    try {
      await this.es.ilm.getLifecycle({ name });
    } catch {
      await this.es.ilm.putLifecycle({
        name,
        policy: {
          phases: {
            hot: {
              min_age: '0ms',
              actions: {
                rollover:     { max_size: '5gb', max_age: '7d' },
                set_priority: { priority: 100 },
              },
            },
            warm: {
              min_age: '7d',
              actions: {
                shrink:       { number_of_shards: 1 },
                forcemerge:   { max_num_segments: 1 },
                set_priority: { priority: 50 },
              },
            },
            cold: {
              min_age: '30d',
              actions: { set_priority: { priority: 0 } },
            },
            delete: {
              min_age: '90d',
              actions: { delete: {} },
            },
          },
        },
      } as any);
      this.logger.log('Created ILM policy: pulse-events-ilm');
    }
  }

  private async ensureIndexTemplate(): Promise<void> {
    const name = 'pulse-events-template';
    try {
      await this.es.indices.getIndexTemplate({ name });
    } catch {
      await this.es.indices.putIndexTemplate({
        name,
        index_patterns: [`${this.eventsIndex}-*`],
        template: {
          settings: {
            number_of_shards:              1,
            number_of_replicas:            0,
            'index.lifecycle.name':        'pulse-events-ilm',
            'index.lifecycle.rollover_alias': this.eventsIndex,
          },
          mappings: { properties: eventsMapping },
        },
      } as any);
      this.logger.log(`Created index template: ${name}`);
    }
  }

  private async setupErrorGroupsIndex(): Promise<void> {
    try {
      const exists = await this.es.indices.exists({ index: this.groupsIndex });
      if (exists) return;

      await this.es.indices.create({
        index: this.groupsIndex,
        settings: { number_of_shards: 1, number_of_replicas: 0 },
        mappings: {
          properties: {
            fingerprint:      { type: 'keyword' },
            service:          { type: 'keyword' },
            environment:      { type: 'keyword' },
            level:            { type: 'keyword' },
            title:            { type: 'text', analyzer: 'standard', fields: { keyword: { type: 'keyword', ignore_above: 500 } } },
            occurrence_count: { type: 'integer' },
            first_seen_at:    { type: 'date' },
            last_seen_at:     { type: 'date' },
            status:           { type: 'keyword' },
          },
        },
      });
      this.logger.log(`Created error groups index: ${this.groupsIndex}`);
    } catch (err: any) {
      this.logger.warn(`Error groups index setup failed (non-fatal): ${err.message}`);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private toEventDoc(doc: EventDocument) {
    return {
      service:          doc.service,
      environment:      doc.environment,
      level:            doc.level,
      message:          doc.message,
      timestamp:        doc.timestamp,
      metadata:         doc.metadata ?? {},
      error_group_id:   doc.errorGroupId,
      fingerprint:      doc.fingerprint,
      api_key_id:       doc.apiKeyId,
      received_at:      doc.receivedAt,
      created_at:       doc.createdAt,
      // Enrichment — enables richer ES aggregations without re-processing
      severity_score:   doc.severityScore,
      error_type:       doc.errorType,
      http_status_code: doc.httpStatusCode,
      tags:             doc.tags ?? [],
    };
  }
}

// ─── Mapping constants ────────────────────────────────────────────────────────
//
// Kept outside the class so the type annotation is a plain object literal
// accepted by the ES client's loose any-typed mapping field.
const eventsMapping = {
  service:          { type: 'keyword' },
  environment:      { type: 'keyword' },
  level:            { type: 'keyword' },
  // Full-text search on message; keyword sub-field for exact-match / aggregations.
  message:          { type: 'text', analyzer: 'standard', fields: { keyword: { type: 'keyword', ignore_above: 512 } } },
  timestamp:        { type: 'date' },
  // Dynamic object — arbitrary keys from the client's metadata bag.
  metadata:         { type: 'object', dynamic: true },
  error_group_id:   { type: 'keyword' },
  fingerprint:      { type: 'keyword' },
  api_key_id:       { type: 'keyword' },
  received_at:      { type: 'date' },
  created_at:       { type: 'date' },
  // Pipeline enrichment fields
  severity_score:   { type: 'byte' },
  error_type:       { type: 'keyword' },
  http_status_code: { type: 'short' },
  tags:             { type: 'keyword' },
} as const;
