package models

import (
	"encoding/json"
	"time"
)

// ── API Keys ──────────────────────────────────────────────────────────────────

type APIKey struct {
	ID                 string    `json:"id"`
	Name               string    `json:"name"`
	RateLimitPerMinute int       `json:"rateLimitPerMinute"`
	CreatedAt          time.Time `json:"createdAt"`
	// FullKey is set only on creation
	FullKey *string `json:"fullKey,omitempty"`
	// KeyHash is never serialized to JSON
	KeyHash string `json:"-"`
}

// ── Events ────────────────────────────────────────────────────────────────────

type IngestPayload struct {
	Service     string          `json:"service"     validate:"required,max=100"`
	Environment string          `json:"environment"`
	Level       string          `json:"level"       validate:"required,oneof=error warn info debug"`
	Message     string          `json:"message"     validate:"required,max=5000"`
	Timestamp   *time.Time      `json:"timestamp"`
	ErrorType   string          `json:"errorType"`
	Tags        []string        `json:"tags"`
	Extra       json.RawMessage `json:"extra"`
}

type Event struct {
	ID             string          `json:"id"`
	Service        string          `json:"service"`
	Environment    string          `json:"environment"`
	Level          string          `json:"level"`
	Message        string          `json:"message"`
	Fingerprint    string          `json:"fingerprint"`
	ErrorType      *string         `json:"errorType"`
	SeverityScore  int             `json:"severityScore"`
	HTTPStatusCode *int            `json:"httpStatusCode"`
	Tags           []string        `json:"tags"`
	ParsedStack    json.RawMessage `json:"parsedStack"`
	Timestamp      time.Time       `json:"timestamp"`
	ReceivedAt     time.Time       `json:"receivedAt"`
	ErrorGroupID   *string         `json:"errorGroupId"`
}

// ── Error Groups ──────────────────────────────────────────────────────────────

type ErrorGroup struct {
	ID              string     `json:"id"`
	Fingerprint     string     `json:"fingerprint"`
	Service         string     `json:"service"`
	Environment     string     `json:"environment"`
	Level           string     `json:"level"`
	Title           string     `json:"title"`
	OccurrenceCount int        `json:"occurrenceCount"`
	FirstSeenAt     time.Time  `json:"firstSeenAt"`
	LastSeenAt      time.Time  `json:"lastSeenAt"`
	Status          string     `json:"status"`
	ResolvedAt      *time.Time `json:"resolvedAt"`
}

// ── Incidents ─────────────────────────────────────────────────────────────────

type Incident struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description *string    `json:"description"`
	Status      string     `json:"status"`
	Severity    string     `json:"severity"`
	Service     *string    `json:"service"`
	Environment *string    `json:"environment"`
	OpenedAt    time.Time  `json:"openedAt"`
	ResolvedAt  *time.Time `json:"resolvedAt"`

	Timeline    []IncidentTimeline    `json:"timeline,omitempty"`
	ErrorGroups []IncidentErrorGroup  `json:"errorGroups,omitempty"`
	Count       *IncidentCount        `json:"_count,omitempty"`
}

type IncidentCount struct {
	ErrorGroups int `json:"errorGroups"`
	Timeline    int `json:"timeline"`
}

type IncidentTimeline struct {
	ID         string    `json:"id"`
	IncidentID string    `json:"incidentId"`
	Type       string    `json:"type"`
	Message    string    `json:"message"`
	Actor      *string   `json:"actor"`
	OccurredAt time.Time `json:"occurredAt"`
}

type IncidentErrorGroup struct {
	IncidentID   string      `json:"incidentId"`
	ErrorGroupID string      `json:"errorGroupId"`
	LinkedAt     time.Time   `json:"linkedAt"`
	ErrorGroup   *ErrorGroup `json:"errorGroup"`
}

type FrequencyPoint struct {
	Bucket string `json:"bucket"`
	Level  string `json:"level"`
	Count  int    `json:"count"`
}

// ── Alerts ────────────────────────────────────────────────────────────────────

type Alert struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description *string         `json:"description"`
	Service     *string         `json:"service"`
	Environment *string         `json:"environment"`
	Level       *string         `json:"level"`
	Condition   json.RawMessage `json:"condition"`
	IsActive    bool            `json:"isActive"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`

	Triggers []AlertTrigger `json:"triggers,omitempty"`
	Count    *AlertCount    `json:"_count,omitempty"`
}

type AlertCount struct {
	Triggers int `json:"triggers"`
}

type AlertTrigger struct {
	ID          string          `json:"id"`
	AlertID     string          `json:"alertId"`
	TriggeredAt time.Time       `json:"triggeredAt"`
	ResolvedAt  *time.Time      `json:"resolvedAt"`
	Context     json.RawMessage `json:"context"`
}

// ── Pagination ────────────────────────────────────────────────────────────────

type Paginated[T any] struct {
	Total   int64 `json:"total"`
	Page    int   `json:"page"`
	Limit   int   `json:"limit"`
	Results []T   `json:"results"`
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

type DashboardData struct {
	Period         string          `json:"period"`
	GeneratedAt    time.Time       `json:"generatedAt"`
	Overview       Overview        `json:"overview"`
	VolumeTrend    []VolumePoint   `json:"volumeTrend"`
	ServiceHealth  []ServiceHealth `json:"serviceHealth"`
	TopErrorGroups []TopErrorGroup `json:"topErrorGroups"`
	IncidentSummary IncidentSummary `json:"incidentSummary"`
	TopErrorTypes  []TopErrorType  `json:"topErrorTypes"`
}

type Overview struct {
	EventsThisPeriod int64   `json:"eventsThisPeriod"`
	EventsPrevPeriod int64   `json:"eventsPrevPeriod"`
	ErrorsThisPeriod int64   `json:"errorsThisPeriod"`
	ErrorsPrevPeriod int64   `json:"errorsPrevPeriod"`
	ErrorRate        float64 `json:"errorRate"`
	ActiveIncidents  int64   `json:"activeIncidents"`
	FiringAlerts     int64   `json:"firingAlerts"`
	OpenErrorGroups  int64   `json:"openErrorGroups"`
}

type VolumePoint struct {
	Bucket string `json:"bucket"`
	Total  int64  `json:"total"`
	Errors int64  `json:"errors"`
	Warns  int64  `json:"warns"`
}

type ServiceHealth struct {
	Service         string  `json:"service"`
	EventsTotal     int64   `json:"eventsTotal"`
	ErrorsTotal     int64   `json:"errorsTotal"`
	ErrorRate       float64 `json:"errorRate"`
	OpenErrorGroups int64   `json:"openErrorGroups"`
	Status          string  `json:"status"` // healthy | degraded | critical
}

type TopErrorGroup struct {
	ID              string    `json:"id"`
	Title           string    `json:"title"`
	Service         string    `json:"service"`
	Level           string    `json:"level"`
	OccurrenceCount int64     `json:"occurrenceCount"`
	LastSeenAt      time.Time `json:"lastSeenAt"`
}

type IncidentSummary struct {
	Open             int64            `json:"open"`
	Investigating    int64            `json:"investigating"`
	ResolvedInPeriod int64            `json:"resolvedInPeriod"`
	BySeverity       map[string]int64 `json:"bySeverity"`
}

type TopErrorType struct {
	ErrorType string `json:"errorType"`
	Count     int64  `json:"count"`
}
