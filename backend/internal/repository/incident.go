package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/avvyyy/project-pulse/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type IncidentRepo struct{ db *pgxpool.Pool }

func NewIncidentRepo(db *pgxpool.Pool) *IncidentRepo { return &IncidentRepo{db: db} }

// List returns a paginated list. Counts for timeline/errorGroups are fetched with
// correlated subqueries in a single round-trip — no N+1.
func (r *IncidentRepo) List(ctx context.Context, status, severity, service string, page, limit int) (*models.Paginated[models.Incident], error) {
	offset := (page - 1) * limit

	rows, err := r.db.Query(ctx, `
		SELECT
		    i.id, i.title, i.description, i.status, i.severity,
		    i.service, i.environment, i.opened_at, i.resolved_at,
		    (SELECT COUNT(*) FROM incident_timeline  it  WHERE it.incident_id  = i.id) AS timeline_count,
		    (SELECT COUNT(*) FROM incident_error_groups ieg WHERE ieg.incident_id = i.id) AS eg_count,
		    COUNT(*) OVER() AS total
		FROM incidents i
		WHERE ($1::text IS NULL OR i.status   = $1)
		  AND ($2::text IS NULL OR i.severity = $2)
		  AND ($3::text IS NULL OR i.service  = $3)
		ORDER BY i.opened_at DESC
		LIMIT $4 OFFSET $5`,
		nullStr(status), nullStr(severity), nullStr(service), limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var incidents []models.Incident
	var total int64
	for rows.Next() {
		var inc models.Incident
		var tlCount, egCount int
		if err := rows.Scan(
			&inc.ID, &inc.Title, &inc.Description, &inc.Status, &inc.Severity,
			&inc.Service, &inc.Environment, &inc.OpenedAt, &inc.ResolvedAt,
			&tlCount, &egCount, &total,
		); err != nil {
			return nil, err
		}
		inc.Count = &models.IncidentCount{Timeline: tlCount, ErrorGroups: egCount}
		incidents = append(incidents, inc)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if incidents == nil {
		incidents = []models.Incident{}
	}
	return &models.Paginated[models.Incident]{Total: total, Page: page, Limit: limit, Results: incidents}, nil
}

// Get returns a single incident with its timeline and linked error groups.
// Uses 3 targeted queries — no N+1.
func (r *IncidentRepo) Get(ctx context.Context, id string) (*models.Incident, error) {
	var inc models.Incident
	err := r.db.QueryRow(ctx, `
		SELECT id, title, description, status, severity,
		       service, environment, opened_at, resolved_at
		FROM incidents WHERE id = $1`, id,
	).Scan(&inc.ID, &inc.Title, &inc.Description, &inc.Status, &inc.Severity,
		&inc.Service, &inc.Environment, &inc.OpenedAt, &inc.ResolvedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	// Fetch all timeline entries in one query
	tlRows, err := r.db.Query(ctx, `
		SELECT id, incident_id, type, message, actor, occurred_at
		FROM incident_timeline
		WHERE incident_id = $1
		ORDER BY occurred_at ASC`, id)
	if err != nil {
		return nil, err
	}
	defer tlRows.Close()
	for tlRows.Next() {
		var t models.IncidentTimeline
		if err := tlRows.Scan(&t.ID, &t.IncidentID, &t.Type, &t.Message, &t.Actor, &t.OccurredAt); err != nil {
			return nil, err
		}
		inc.Timeline = append(inc.Timeline, t)
	}
	if err := tlRows.Err(); err != nil {
		return nil, err
	}

	// Fetch all linked error groups with their data in one JOIN query
	egRows, err := r.db.Query(ctx, `
		SELECT
		    ieg.incident_id, ieg.error_group_id, ieg.linked_at,
		    eg.id, eg.fingerprint, eg.service, eg.environment,
		    eg.level, eg.title, eg.occurrence_count,
		    eg.first_seen_at, eg.last_seen_at, eg.status, eg.resolved_at
		FROM incident_error_groups ieg
		JOIN error_groups eg ON eg.id = ieg.error_group_id
		WHERE ieg.incident_id = $1
		ORDER BY ieg.linked_at DESC`, id)
	if err != nil {
		return nil, err
	}
	defer egRows.Close()
	for egRows.Next() {
		var ieg models.IncidentErrorGroup
		var eg models.ErrorGroup
		if err := egRows.Scan(
			&ieg.IncidentID, &ieg.ErrorGroupID, &ieg.LinkedAt,
			&eg.ID, &eg.Fingerprint, &eg.Service, &eg.Environment,
			&eg.Level, &eg.Title, &eg.OccurrenceCount,
			&eg.FirstSeenAt, &eg.LastSeenAt, &eg.Status, &eg.ResolvedAt,
		); err != nil {
			return nil, err
		}
		ieg.ErrorGroup = &eg
		inc.ErrorGroups = append(inc.ErrorGroups, ieg)
	}
	if err := egRows.Err(); err != nil {
		return nil, err
	}

	if inc.Timeline == nil {
		inc.Timeline = []models.IncidentTimeline{}
	}
	if inc.ErrorGroups == nil {
		inc.ErrorGroups = []models.IncidentErrorGroup{}
	}
	return &inc, nil
}

func (r *IncidentRepo) Create(ctx context.Context, title, severity string, description, service, environment *string) (*models.Incident, error) {
	var inc models.Incident
	err := r.db.QueryRow(ctx, `
		INSERT INTO incidents (title, severity, description, service, environment)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, title, description, status, severity, service, environment, opened_at, resolved_at`,
		title, severity, description, service, environment,
	).Scan(&inc.ID, &inc.Title, &inc.Description, &inc.Status, &inc.Severity,
		&inc.Service, &inc.Environment, &inc.OpenedAt, &inc.ResolvedAt)
	if err != nil {
		return nil, fmt.Errorf("create incident: %w", err)
	}
	inc.Timeline = []models.IncidentTimeline{}
	inc.ErrorGroups = []models.IncidentErrorGroup{}
	return &inc, nil
}

type IncidentUpdate struct {
	Status      *string
	Severity    *string
	Description *string
}

func (r *IncidentRepo) Update(ctx context.Context, id string, u IncidentUpdate) (*models.Incident, error) {
	var resolvedAt *time.Time
	if u.Status != nil && *u.Status == "resolved" {
		now := time.Now()
		resolvedAt = &now
	}

	var inc models.Incident
	err := r.db.QueryRow(ctx, `
		UPDATE incidents SET
		    status      = COALESCE($2, status),
		    severity    = COALESCE($3, severity),
		    description = COALESCE($4, description),
		    resolved_at = CASE
		                    WHEN $2 = 'resolved' AND resolved_at IS NULL THEN $5
		                    WHEN $2 != 'resolved' THEN NULL
		                    ELSE resolved_at
		                  END
		WHERE id = $1
		RETURNING id, title, description, status, severity, service, environment, opened_at, resolved_at`,
		id, u.Status, u.Severity, u.Description, resolvedAt,
	).Scan(&inc.ID, &inc.Title, &inc.Description, &inc.Status, &inc.Severity,
		&inc.Service, &inc.Environment, &inc.OpenedAt, &inc.ResolvedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("update incident: %w", err)
	}
	return &inc, nil
}

func (r *IncidentRepo) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM incidents WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("incident not found")
	}
	return nil
}

func (r *IncidentRepo) AddTimeline(ctx context.Context, incidentID, tlType, message string, actor *string) (*models.IncidentTimeline, error) {
	var t models.IncidentTimeline
	err := r.db.QueryRow(ctx, `
		INSERT INTO incident_timeline (incident_id, type, message, actor)
		VALUES ($1, $2, $3, $4)
		RETURNING id, incident_id, type, message, actor, occurred_at`,
		incidentID, tlType, message, actor,
	).Scan(&t.ID, &t.IncidentID, &t.Type, &t.Message, &t.Actor, &t.OccurredAt)
	return &t, err
}

func (r *IncidentRepo) LinkErrorGroup(ctx context.Context, incidentID, errorGroupID string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO incident_error_groups (incident_id, error_group_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING`,
		incidentID, errorGroupID)
	return err
}

func (r *IncidentRepo) UnlinkErrorGroup(ctx context.Context, incidentID, errorGroupID string) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM incident_error_groups
		WHERE incident_id = $1 AND error_group_id = $2`,
		incidentID, errorGroupID)
	return err
}

// GetFrequency returns hourly event counts for events linked to this incident's error groups,
// bucketed over the last 7 days — single JOIN query, no N+1.
func (r *IncidentRepo) GetFrequency(ctx context.Context, incidentID string) ([]models.FrequencyPoint, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
		    date_trunc('hour', e.timestamp)::text AS bucket,
		    e.level,
		    COUNT(*) AS count
		FROM events e
		JOIN incident_error_groups ieg ON ieg.error_group_id = e.error_group_id
		WHERE ieg.incident_id = $1
		  AND e.timestamp >= NOW() - INTERVAL '7 days'
		GROUP BY bucket, e.level
		ORDER BY bucket, e.level`, incidentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pts []models.FrequencyPoint
	for rows.Next() {
		var p models.FrequencyPoint
		if err := rows.Scan(&p.Bucket, &p.Level, &p.Count); err != nil {
			return nil, err
		}
		pts = append(pts, p)
	}
	if pts == nil {
		pts = []models.FrequencyPoint{}
	}
	return pts, rows.Err()
}

func nullStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
