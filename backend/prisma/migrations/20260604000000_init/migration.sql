-- ─────────────────────────────────────────────────────────────────────────────
-- Initial schema migration for project-pulse
--
-- Table creation order respects foreign key dependencies:
--   api_keys → error_groups → events
--   alerts   → alert_triggers
--   incidents → incident_error_groups / incident_timeline
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- ── api_keys ──────────────────────────────────────────────────────────────────
CREATE TABLE "api_keys" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "name"         VARCHAR(100) NOT NULL,
    -- SHA-256 hex digest of the raw key (64 chars).
    -- Never store the plaintext key.
    "key_hash"     CHAR(64)     NOT NULL,
    "key_prefix"   VARCHAR(12)  NOT NULL,
    -- requests per minute limit for this key
    "rate_limit"   INTEGER      NOT NULL DEFAULT 1000,
    "is_active"    BOOLEAN      NOT NULL DEFAULT true,
    "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "revoked_at"   TIMESTAMPTZ,
    "last_used_at" TIMESTAMPTZ,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX "api_keys_is_active_idx"       ON "api_keys"("is_active");

-- ── error_groups ──────────────────────────────────────────────────────────────
--
-- Indexes rationale:
--   (service, environment, status) — dashboard "open errors for service X in prod"
--   last_seen_at DESC              — "recently active issues" default sort
--   (status, level)                — "all open errors" filter
--
-- occurrence_count uses the Postgres UPSERT (ON CONFLICT DO UPDATE) pattern in
-- application code to guarantee atomic increment without a read-modify-write.
CREATE TABLE "error_groups" (
    "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
    "fingerprint"      CHAR(64)     NOT NULL,
    "service"          VARCHAR(100) NOT NULL,
    "environment"      VARCHAR(20)  NOT NULL,
    "level"            VARCHAR(10)  NOT NULL,
    "title"            VARCHAR(500) NOT NULL,
    "occurrence_count" INTEGER      NOT NULL DEFAULT 1,
    "first_seen_at"    TIMESTAMPTZ  NOT NULL,
    "last_seen_at"     TIMESTAMPTZ  NOT NULL,
    "resolved_at"      TIMESTAMPTZ,
    "status"           VARCHAR(20)  NOT NULL DEFAULT 'open',

    CONSTRAINT "error_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "error_groups_fingerprint_key"      ON "error_groups"("fingerprint");
CREATE INDEX "error_groups_svc_env_status_idx"          ON "error_groups"("service", "environment", "status");
CREATE INDEX "error_groups_last_seen_at_idx"            ON "error_groups"("last_seen_at" DESC);
CREATE INDEX "error_groups_status_level_idx"            ON "error_groups"("status", "level");

-- ── events ────────────────────────────────────────────────────────────────────
--
-- Indexes rationale:
--   (service, timestamp DESC)     — most common dashboard query: "events for X today"
--   (level, timestamp DESC)       — "show all errors in the last hour"
--   (environment, timestamp DESC) — cross-service environment view
--   error_group_id                — "all occurrences of this issue"
--   api_key_id                    — "all events from this integration"
--
-- Scalability:
--   Declare this table as PARTITION BY RANGE (timestamp) once row count exceeds
--   ~10 M rows. Each monthly child partition can be DROPped instantly for
--   retention without locking the parent.
--
--   Example (run after this migration as a separate DBA migration):
--     CREATE TABLE events_2026_06 PARTITION OF events
--       FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE "events" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "service"        VARCHAR(100) NOT NULL,
    "environment"    VARCHAR(20)  NOT NULL,
    "level"          VARCHAR(10)  NOT NULL,
    "message"        TEXT         NOT NULL,
    "stack_trace"    TEXT,
    "timestamp"      TIMESTAMPTZ  NOT NULL,
    "metadata"       JSONB                 DEFAULT '{}',
    -- Denormalised: same value as error_groups.fingerprint for this event.
    -- Avoids a JOIN when loading an event's group context.
    "fingerprint"    CHAR(64),
    "error_group_id" UUID,
    "api_key_id"     UUID         NOT NULL,
    "received_at"    TIMESTAMPTZ  NOT NULL,
    "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- Pipeline enrichment columns
    -- Stored here so dashboards can filter without touching Elasticsearch.
    "severity_score"         SMALLINT,
    "error_type"             VARCHAR(100),
    "http_status_code"       SMALLINT,
    "processing_latency_ms"  INTEGER,
    "tags"                   TEXT[]        DEFAULT '{}',
    "parsed_stack"           JSONB,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "events_service_ts_idx"     ON "events"("service",     "timestamp" DESC);
CREATE INDEX "events_level_ts_idx"       ON "events"("level",       "timestamp" DESC);
CREATE INDEX "events_env_ts_idx"         ON "events"("environment", "timestamp" DESC);
CREATE INDEX "events_error_group_id_idx" ON "events"("error_group_id");
CREATE INDEX "events_api_key_id_idx"     ON "events"("api_key_id");
CREATE INDEX "events_error_type_idx"     ON "events"("error_type");
-- GIN index on the tags array: supports "WHERE tags @> ARRAY['database']" efficiently
CREATE INDEX "events_tags_gin_idx"       ON "events" USING GIN ("tags");

-- Foreign keys added after both tables exist
ALTER TABLE "events"
    ADD CONSTRAINT "events_error_group_id_fkey"
        FOREIGN KEY ("error_group_id") REFERENCES "error_groups"("id")
        ON DELETE SET NULL,
    ADD CONSTRAINT "events_api_key_id_fkey"
        FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id");

-- ── services ──────────────────────────────────────────────────────────────────
--
-- Auto-populated registry of every service name seen in ingested events.
-- event_count / error_count are approximate; incremented asynchronously.
CREATE TABLE "services" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "name"         VARCHAR(100) NOT NULL,
    "first_seen_at" TIMESTAMPTZ NOT NULL,
    "last_seen_at"  TIMESTAMPTZ NOT NULL,
    "event_count"  BIGINT       NOT NULL DEFAULT 0,
    "error_count"  BIGINT       NOT NULL DEFAULT 0,

    CONSTRAINT "services_pkey"    PRIMARY KEY ("id"),
    CONSTRAINT "services_name_key" UNIQUE ("name")
);

-- ── environments ──────────────────────────────────────────────────────────────
CREATE TABLE "environments" (
    "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
    "name"          VARCHAR(20) NOT NULL,
    "first_seen_at" TIMESTAMPTZ NOT NULL,
    "last_seen_at"  TIMESTAMPTZ NOT NULL,

    CONSTRAINT "environments_pkey"     PRIMARY KEY ("id"),
    CONSTRAINT "environments_name_key"  UNIQUE ("name")
);

-- ── alerts ────────────────────────────────────────────────────────────────────
--
-- condition column schema variants (all stored as JSONB):
--   { "type": "threshold",    "metric": "error_count", "threshold": 10, "windowSeconds": 300 }
--   { "type": "new_error_group" }
--   { "type": "recurrence",   "minutes": 60 }
--   { "type": "spike",        "multiplier": 3, "baselineWindowSeconds": 3600 }
--
-- Indexing: only is_active is indexed because alert evaluation is a write-time
-- concern (done by the processor), not a read-time query.
CREATE TABLE "alerts" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "name"        VARCHAR(255) NOT NULL,
    "description" TEXT,
    "service"     VARCHAR(100),
    "environment" VARCHAR(20),
    "level"       VARCHAR(10),
    "condition"   JSONB        NOT NULL,
    "is_active"   BOOLEAN      NOT NULL DEFAULT true,
    "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "alerts_is_active_idx" ON "alerts"("is_active");

-- ── alert_triggers ────────────────────────────────────────────────────────────
--
-- Each row = one firing of an alert.
-- context: { error_count: 50, window: "5m", sample_event_ids: [...] }
CREATE TABLE "alert_triggers" (
    "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "alert_id"     UUID        NOT NULL,
    "triggered_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "resolved_at"  TIMESTAMPTZ,
    "context"      JSONB,

    CONSTRAINT "alert_triggers_pkey"     PRIMARY KEY ("id"),
    CONSTRAINT "alert_triggers_alert_fkey" FOREIGN KEY ("alert_id")
        REFERENCES "alerts"("id") ON DELETE CASCADE
);

CREATE INDEX "alert_triggers_alert_ts_idx" ON "alert_triggers"("alert_id", "triggered_at" DESC);

-- ── incidents ─────────────────────────────────────────────────────────────────
CREATE TABLE "incidents" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "title"       VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status"      VARCHAR(20)  NOT NULL DEFAULT 'open',
    "severity"    VARCHAR(10)  NOT NULL,
    "service"     VARCHAR(100),
    "environment" VARCHAR(20),
    "opened_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "incidents_status_opened_idx" ON "incidents"("status", "opened_at" DESC);
CREATE INDEX "incidents_svc_opened_idx"    ON "incidents"("service",  "opened_at" DESC);

-- ── incident_error_groups ─────────────────────────────────────────────────────
CREATE TABLE "incident_error_groups" (
    "incident_id"    UUID        NOT NULL,
    "error_group_id" UUID        NOT NULL,
    "linked_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "incident_error_groups_pkey"
        PRIMARY KEY ("incident_id", "error_group_id"),
    CONSTRAINT "ieg_incident_fkey"
        FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE,
    CONSTRAINT "ieg_error_group_fkey"
        FOREIGN KEY ("error_group_id") REFERENCES "error_groups"("id") ON DELETE CASCADE
);

-- ── incident_timeline ─────────────────────────────────────────────────────────
--
-- Immutable audit trail — rows are never updated, only inserted.
-- type values: opened | status_change | comment | error_linked | resolved | severity_change
CREATE TABLE "incident_timeline" (
    "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
    "incident_id" UUID        NOT NULL,
    "type"        VARCHAR(50) NOT NULL,
    "message"     TEXT        NOT NULL,
    "actor"       VARCHAR(255),
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "incident_timeline_pkey"     PRIMARY KEY ("id"),
    CONSTRAINT "incident_timeline_inc_fkey" FOREIGN KEY ("incident_id")
        REFERENCES "incidents"("id") ON DELETE CASCADE
);

CREATE INDEX "incident_timeline_inc_ts_idx" ON "incident_timeline"("incident_id", "occurred_at" DESC);
