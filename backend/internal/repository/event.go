package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/favouruzochukwu/project-pulse/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
)

type EventRepo struct{ db *pgxpool.Pool }

func NewEventRepo(db *pgxpool.Pool) *EventRepo { return &EventRepo{db: db} }

// UpsertErrorGroup performs an atomic upsert: insert a new group or increment occurrence_count.
// Returns the upserted group's ID.
func (r *EventRepo) UpsertErrorGroup(ctx context.Context, fingerprint, service, env, level, title string, ts time.Time) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO error_groups (fingerprint, service, environment, level, title, first_seen_at, last_seen_at)
		VALUES ($1, $2, $3, $4, $5, $6, $6)
		ON CONFLICT (fingerprint) DO UPDATE
		  SET occurrence_count = error_groups.occurrence_count + 1,
		      last_seen_at     = EXCLUDED.last_seen_at
		RETURNING id`,
		fingerprint, service, env, level, title, ts,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("upsert error group: %w", err)
	}
	return id, nil
}

func (r *EventRepo) CreateEvent(ctx context.Context, e *models.Event) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO events
		  (id, service, environment, level, message, fingerprint,
		   error_type, severity_score, http_status_code, tags,
		   parsed_stack, raw_payload, timestamp, received_at, error_group_id)
		VALUES
		  ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
		e.ID, e.Service, e.Environment, e.Level, e.Message, e.Fingerprint,
		e.ErrorType, e.SeverityScore, e.HTTPStatusCode, e.Tags,
		e.ParsedStack, nil, e.Timestamp, e.ReceivedAt, e.ErrorGroupID,
	)
	return err
}
