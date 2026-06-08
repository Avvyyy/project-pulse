CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS api_keys (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  TEXT        NOT NULL,
    key_hash              TEXT        NOT NULL UNIQUE,
    rate_limit_per_minute INT         NOT NULL DEFAULT 1000,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS error_groups (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint      TEXT        NOT NULL UNIQUE,
    service          TEXT        NOT NULL,
    environment      TEXT        NOT NULL,
    level            TEXT        NOT NULL,
    title            TEXT        NOT NULL,
    occurrence_count INT         NOT NULL DEFAULT 1,
    first_seen_at    TIMESTAMPTZ NOT NULL,
    last_seen_at     TIMESTAMPTZ NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'open',
    resolved_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_error_groups_fingerprint ON error_groups(fingerprint);
CREATE INDEX IF NOT EXISTS idx_error_groups_service     ON error_groups(service);
CREATE INDEX IF NOT EXISTS idx_error_groups_status      ON error_groups(status);
CREATE INDEX IF NOT EXISTS idx_error_groups_last_seen   ON error_groups(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS events (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    service          TEXT        NOT NULL,
    environment      TEXT        NOT NULL DEFAULT 'production',
    level            TEXT        NOT NULL,
    message          TEXT        NOT NULL,
    fingerprint      TEXT        NOT NULL,
    error_type       TEXT,
    severity_score   INT         NOT NULL DEFAULT 0,
    http_status_code INT,
    tags             TEXT[]      NOT NULL DEFAULT '{}',
    parsed_stack     JSONB,
    raw_payload      JSONB,
    timestamp        TIMESTAMPTZ NOT NULL,
    received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    error_group_id   UUID        REFERENCES error_groups(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_events_service     ON events(service);
CREATE INDEX IF NOT EXISTS idx_events_fingerprint ON events(fingerprint);
CREATE INDEX IF NOT EXISTS idx_events_timestamp   ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_error_group ON events(error_group_id);
CREATE INDEX IF NOT EXISTS idx_events_level       ON events(level);

CREATE TABLE IF NOT EXISTS incidents (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT        NOT NULL,
    description TEXT,
    status      TEXT        NOT NULL DEFAULT 'open',
    severity    TEXT        NOT NULL,
    service     TEXT,
    environment TEXT,
    opened_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_incidents_status   ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_opened   ON incidents(opened_at DESC);

CREATE TABLE IF NOT EXISTS incident_timeline (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID        NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    type        TEXT        NOT NULL,
    message     TEXT        NOT NULL,
    actor       TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_timeline_incident ON incident_timeline(incident_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS incident_error_groups (
    incident_id    UUID        NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    error_group_id UUID        NOT NULL REFERENCES error_groups(id) ON DELETE CASCADE,
    linked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (incident_id, error_group_id)
);
CREATE INDEX IF NOT EXISTS idx_ieg_incident    ON incident_error_groups(incident_id);
CREATE INDEX IF NOT EXISTS idx_ieg_error_group ON incident_error_groups(error_group_id);

CREATE TABLE IF NOT EXISTS alerts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    description TEXT,
    service     TEXT,
    environment TEXT,
    level       TEXT,
    condition   JSONB       NOT NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_triggers (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id     UUID        NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at  TIMESTAMPTZ,
    context      JSONB
);
CREATE INDEX IF NOT EXISTS idx_triggers_alert ON alert_triggers(alert_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_triggers_open  ON alert_triggers(alert_id) WHERE resolved_at IS NULL;
