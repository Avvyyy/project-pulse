package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/favouruzochukwu/project-pulse/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AlertRepo struct{ db *pgxpool.Pool }

func NewAlertRepo(db *pgxpool.Pool) *AlertRepo { return &AlertRepo{db: db} }

// List returns paginated alerts. Each alert includes its latest trigger and total trigger count —
// fetched via CTEs in a single query to avoid N+1.
func (r *AlertRepo) List(ctx context.Context, isActive *bool, service string, page, limit int) (*models.Paginated[models.Alert], error) {
	offset := (page - 1) * limit

	rows, err := r.db.Query(ctx, `
		WITH latest_trigger AS (
		    SELECT DISTINCT ON (alert_id)
		        id, alert_id, triggered_at, resolved_at, context
		    FROM alert_triggers
		    ORDER BY alert_id, triggered_at DESC
		),
		trigger_counts AS (
		    SELECT alert_id, COUNT(*) AS cnt
		    FROM alert_triggers
		    GROUP BY alert_id
		)
		SELECT
		    a.id, a.name, a.description, a.service, a.environment, a.level,
		    a.condition, a.is_active, a.created_at, a.updated_at,
		    lt.id, lt.triggered_at, lt.resolved_at, lt.context,
		    COALESCE(tc.cnt, 0),
		    COUNT(*) OVER() AS total
		FROM alerts a
		LEFT JOIN latest_trigger  lt ON lt.alert_id = a.id
		LEFT JOIN trigger_counts  tc ON tc.alert_id = a.id
		WHERE ($1::boolean IS NULL OR a.is_active = $1)
		  AND ($2::text    IS NULL OR a.service   = $2)
		ORDER BY a.created_at DESC
		LIMIT $3 OFFSET $4`,
		isActive, nullStr(service), limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var alerts []models.Alert
	var total int64
	for rows.Next() {
		var a models.Alert
		var triggerCount int64
		var tID *string
		var tTriggeredTime *time.Time
		var tResolvedTime *time.Time
		var tContextRaw json.RawMessage

		if err := rows.Scan(
			&a.ID, &a.Name, &a.Description, &a.Service, &a.Environment, &a.Level,
			&a.Condition, &a.IsActive, &a.CreatedAt, &a.UpdatedAt,
			&tID, &tTriggeredTime, &tResolvedTime, &tContextRaw,
			&triggerCount, &total,
		); err != nil {
			return nil, err
		}

		a.Count = &models.AlertCount{Triggers: int(triggerCount)}
		if tID != nil && tTriggeredTime != nil {
			a.Triggers = []models.AlertTrigger{{
				ID:          *tID,
				AlertID:     a.ID,
				TriggeredAt: *tTriggeredTime,
				ResolvedAt:  tResolvedTime,
				Context:     tContextRaw,
			}}
		} else {
			a.Triggers = []models.AlertTrigger{}
		}
		alerts = append(alerts, a)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if alerts == nil {
		alerts = []models.Alert{}
	}
	return &models.Paginated[models.Alert]{Total: total, Page: page, Limit: limit, Results: alerts}, nil
}

// Get returns a single alert with its latest trigger embedded.
func (r *AlertRepo) Get(ctx context.Context, id string) (*models.Alert, error) {
	var a models.Alert
	err := r.db.QueryRow(ctx, `
		SELECT id, name, description, service, environment, level,
		       condition, is_active, created_at, updated_at
		FROM alerts WHERE id = $1`, id,
	).Scan(&a.ID, &a.Name, &a.Description, &a.Service, &a.Environment, &a.Level,
		&a.Condition, &a.IsActive, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	var count int64
	_ = r.db.QueryRow(ctx, `SELECT COUNT(*) FROM alert_triggers WHERE alert_id = $1`, id).Scan(&count)
	a.Count = &models.AlertCount{Triggers: int(count)}

	// Latest trigger
	var t models.AlertTrigger
	var tContextRaw json.RawMessage
	err = r.db.QueryRow(ctx, `
		SELECT id, alert_id, triggered_at, resolved_at, context
		FROM alert_triggers WHERE alert_id = $1
		ORDER BY triggered_at DESC LIMIT 1`, id,
	).Scan(&t.ID, &t.AlertID, &t.TriggeredAt, &t.ResolvedAt, &tContextRaw)
	if err == nil {
		t.Context = tContextRaw
		a.Triggers = []models.AlertTrigger{t}
	} else {
		a.Triggers = []models.AlertTrigger{}
	}

	return &a, nil
}

func (r *AlertRepo) Create(ctx context.Context, name string, description, service, environment, level *string, condition json.RawMessage, isActive bool) (*models.Alert, error) {
	var a models.Alert
	err := r.db.QueryRow(ctx, `
		INSERT INTO alerts (name, description, service, environment, level, condition, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, name, description, service, environment, level, condition, is_active, created_at, updated_at`,
		name, description, service, environment, level, condition, isActive,
	).Scan(&a.ID, &a.Name, &a.Description, &a.Service, &a.Environment, &a.Level,
		&a.Condition, &a.IsActive, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create alert: %w", err)
	}
	a.Triggers = []models.AlertTrigger{}
	a.Count = &models.AlertCount{}
	return &a, nil
}

type AlertUpdate struct {
	Name        *string
	Description *string
	Service     *string
	Environment *string
	Level       *string
	Condition   json.RawMessage
	IsActive    *bool
}

func (r *AlertRepo) Update(ctx context.Context, id string, u AlertUpdate) (*models.Alert, error) {
	var a models.Alert
	err := r.db.QueryRow(ctx, `
		UPDATE alerts SET
		    name        = COALESCE($2, name),
		    description = COALESCE($3, description),
		    service     = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE service END,
		    environment = CASE WHEN $5::text IS NOT NULL THEN $5 ELSE environment END,
		    level       = CASE WHEN $6::text IS NOT NULL THEN $6 ELSE level END,
		    condition   = COALESCE($7, condition),
		    is_active   = COALESCE($8, is_active),
		    updated_at  = NOW()
		WHERE id = $1
		RETURNING id, name, description, service, environment, level, condition, is_active, created_at, updated_at`,
		id, u.Name, u.Description, u.Service, u.Environment, u.Level, u.Condition, u.IsActive,
	).Scan(&a.ID, &a.Name, &a.Description, &a.Service, &a.Environment, &a.Level,
		&a.Condition, &a.IsActive, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("update alert: %w", err)
	}
	return &a, nil
}

func (r *AlertRepo) Toggle(ctx context.Context, id string) (*models.Alert, error) {
	var a models.Alert
	err := r.db.QueryRow(ctx, `
		UPDATE alerts SET is_active = NOT is_active, updated_at = NOW()
		WHERE id = $1
		RETURNING id, name, description, service, environment, level, condition, is_active, created_at, updated_at`,
		id,
	).Scan(&a.ID, &a.Name, &a.Description, &a.Service, &a.Environment, &a.Level,
		&a.Condition, &a.IsActive, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &a, nil
}

func (r *AlertRepo) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM alerts WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("alert not found")
	}
	return nil
}

// ListTriggers returns paginated triggers for one alert.
func (r *AlertRepo) ListTriggers(ctx context.Context, alertID string, page, limit int) (*models.Paginated[models.AlertTrigger], error) {
	offset := (page - 1) * limit
	rows, err := r.db.Query(ctx, `
		SELECT id, alert_id, triggered_at, resolved_at, context,
		       COUNT(*) OVER() AS total
		FROM alert_triggers
		WHERE alert_id = $1
		ORDER BY triggered_at DESC
		LIMIT $2 OFFSET $3`,
		alertID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var triggers []models.AlertTrigger
	var total int64
	for rows.Next() {
		var t models.AlertTrigger
		var ctxRaw json.RawMessage
		if err := rows.Scan(&t.ID, &t.AlertID, &t.TriggeredAt, &t.ResolvedAt, &ctxRaw, &total); err != nil {
			return nil, err
		}
		t.Context = ctxRaw
		triggers = append(triggers, t)
	}
	if triggers == nil {
		triggers = []models.AlertTrigger{}
	}
	return &models.Paginated[models.AlertTrigger]{Total: total, Page: page, Limit: limit, Results: triggers}, nil
}

func (r *AlertRepo) ResolveTrigger(ctx context.Context, alertID, triggerID string) (*models.AlertTrigger, error) {
	var t models.AlertTrigger
	var ctxRaw json.RawMessage
	err := r.db.QueryRow(ctx, `
		UPDATE alert_triggers SET resolved_at = NOW()
		WHERE id = $1 AND alert_id = $2 AND resolved_at IS NULL
		RETURNING id, alert_id, triggered_at, resolved_at, context`,
		triggerID, alertID,
	).Scan(&t.ID, &t.AlertID, &t.TriggeredAt, &t.ResolvedAt, &ctxRaw)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	t.Context = ctxRaw
	return &t, nil
}

// ── Scheduler helpers ─────────────────────────────────────────────────────────

type ActiveAlert struct {
	models.Alert
	LastTriggerAt *time.Time
}

// GetActiveAlerts returns all is_active=true alerts with their latest trigger time.
// Single query with LEFT JOIN — no N+1.
func (r *AlertRepo) GetActiveAlerts(ctx context.Context) ([]ActiveAlert, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
		    a.id, a.name, a.service, a.environment, a.level,
		    a.condition, a.created_at,
		    lt.triggered_at AS last_trigger_at,
		    lt.resolved_at  IS NULL AS is_firing
		FROM alerts a
		LEFT JOIN LATERAL (
		    SELECT triggered_at, resolved_at
		    FROM alert_triggers
		    WHERE alert_id = a.id
		    ORDER BY triggered_at DESC
		    LIMIT 1
		) lt ON true
		WHERE a.is_active = true`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ActiveAlert
	for rows.Next() {
		var aa ActiveAlert
		var isFiring *bool // NULL when no trigger exists
		if err := rows.Scan(
			&aa.ID, &aa.Name, &aa.Service, &aa.Environment, &aa.Level,
			&aa.Condition, &aa.CreatedAt,
			&aa.LastTriggerAt, &isFiring,
		); err != nil {
			return nil, err
		}
		result = append(result, aa)
	}
	return result, rows.Err()
}

func (r *AlertRepo) GetOpenTrigger(ctx context.Context, alertID string) (*models.AlertTrigger, error) {
	var t models.AlertTrigger
	var ctxRaw json.RawMessage
	err := r.db.QueryRow(ctx, `
		SELECT id, alert_id, triggered_at, resolved_at, context
		FROM alert_triggers
		WHERE alert_id = $1 AND resolved_at IS NULL
		LIMIT 1`, alertID,
	).Scan(&t.ID, &t.AlertID, &t.TriggeredAt, &t.ResolvedAt, &ctxRaw)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t.Context = ctxRaw
	return &t, nil
}

func (r *AlertRepo) CreateTrigger(ctx context.Context, alertID string, ctxData json.RawMessage) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO alert_triggers (alert_id, context) VALUES ($1, $2)`,
		alertID, ctxData)
	return err
}

func (r *AlertRepo) AutoResolveTrigger(ctx context.Context, alertID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE alert_triggers SET resolved_at = NOW()
		WHERE alert_id = $1 AND resolved_at IS NULL`, alertID)
	return err
}

