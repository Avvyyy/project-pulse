package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/avvyyy/project-pulse/internal/repository"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type AlertEvaluator struct {
	alertRepo *repository.AlertRepo
	db        *pgxpool.Pool
	log       *zap.Logger
}

func NewAlertEvaluator(alertRepo *repository.AlertRepo, db *pgxpool.Pool, log *zap.Logger) *AlertEvaluator {
	return &AlertEvaluator{alertRepo: alertRepo, db: db, log: log}
}

// Start runs the evaluation loop in the background. Call cancel() to stop.
func (e *AlertEvaluator) Start(ctx context.Context) {
	ticker := time.NewTicker(60 * time.Second)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				e.evaluateAll(ctx)
			}
		}
	}()
}

func (e *AlertEvaluator) evaluateAll(ctx context.Context) {
	alerts, err := e.alertRepo.GetActiveAlerts(ctx)
	if err != nil {
		e.log.Error("get active alerts", zap.Error(err))
		return
	}

	for _, alert := range alerts {
		if err := e.evaluate(ctx, alert); err != nil {
			e.log.Error("evaluate alert", zap.String("id", alert.ID), zap.Error(err))
		}
	}
}

type conditionType struct {
	Type string `json:"type"`
}

type thresholdCondition struct {
	Metric        string `json:"metric"`
	Threshold     int    `json:"threshold"`
	WindowSeconds int    `json:"windowSeconds"`
}

type spikeCondition struct {
	Multiplier            float64 `json:"multiplier"`
	WindowSeconds         int     `json:"windowSeconds"`
	BaselineWindowSeconds int     `json:"baselineWindowSeconds"`
}

type recurrenceCondition struct {
	Minutes int `json:"minutes"`
}

func (e *AlertEvaluator) evaluate(ctx context.Context, alert repository.ActiveAlert) error {
	var ct conditionType
	if err := json.Unmarshal(alert.Condition, &ct); err != nil {
		return fmt.Errorf("parse condition type: %w", err)
	}

	var fired bool
	var ctxData json.RawMessage

	switch ct.Type {
	case "threshold":
		var cond thresholdCondition
		if err := json.Unmarshal(alert.Condition, &cond); err != nil {
			return err
		}
		count, err := e.countEvents(ctx, alert, cond.WindowSeconds, cond.Metric == "error_count")
		if err != nil {
			return err
		}
		fired = count >= int64(cond.Threshold)
		ctxData, _ = json.Marshal(map[string]any{"count": count, "threshold": cond.Threshold})

	case "spike":
		var cond spikeCondition
		if err := json.Unmarshal(alert.Condition, &cond); err != nil {
			return err
		}
		current, baseline, err := e.spikeCount(ctx, alert, cond.WindowSeconds, cond.BaselineWindowSeconds)
		if err != nil {
			return err
		}
		if baseline > 0 {
			fired = float64(current)/float64(baseline) >= cond.Multiplier
		} else if current > 0 {
			fired = true
		}
		ctxData, _ = json.Marshal(map[string]any{"current": current, "baseline": baseline})

	case "recurrence":
		var cond recurrenceCondition
		if err := json.Unmarshal(alert.Condition, &cond); err != nil {
			return err
		}
		count, err := e.recurrenceCount(ctx, alert, cond.Minutes)
		if err != nil {
			return err
		}
		fired = count > 0
		ctxData, _ = json.Marshal(map[string]any{"recurring_groups": count})

	case "new_error_group":
		since := alert.CreatedAt
		if alert.LastTriggerAt != nil {
			since = *alert.LastTriggerAt
		}
		count, err := e.newGroupCount(ctx, alert, since)
		if err != nil {
			return err
		}
		fired = count > 0
		ctxData, _ = json.Marshal(map[string]any{"new_groups": count})
	}

	openTrigger, err := e.alertRepo.GetOpenTrigger(ctx, alert.ID)
	if err != nil {
		return err
	}

	if fired && openTrigger == nil {
		return e.alertRepo.CreateTrigger(ctx, alert.ID, ctxData)
	}
	if !fired && openTrigger != nil {
		return e.alertRepo.AutoResolveTrigger(ctx, alert.ID)
	}
	return nil
}

func (e *AlertEvaluator) countEvents(ctx context.Context, alert repository.ActiveAlert, windowSecs int, errorsOnly bool) (int64, error) {
	var count int64
	levelFilter := "true"
	if errorsOnly {
		levelFilter = "level = 'error'"
	}
	query := fmt.Sprintf(`
		SELECT COUNT(*) FROM events
		WHERE timestamp >= NOW() - ($1 || ' seconds')::INTERVAL
		  AND ($2::text IS NULL OR service = $2)
		  AND ($3::text IS NULL OR environment = $3)
		  AND ($4::text IS NULL OR level = $4)
		  AND %s`, levelFilter)

	err := e.db.QueryRow(ctx, query,
		windowSecs,
		nullableStr(alert.Service),
		nullableStr(alert.Environment),
		nullableStr(alert.Level),
	).Scan(&count)
	return count, err
}

func (e *AlertEvaluator) spikeCount(ctx context.Context, alert repository.ActiveAlert, windowSecs, baselineSecs int) (int64, int64, error) {
	var current, baseline int64
	err := e.db.QueryRow(ctx, `
		SELECT
		    COUNT(*) FILTER (WHERE timestamp >= NOW() - ($1 || ' seconds')::INTERVAL),
		    COUNT(*) FILTER (WHERE timestamp >= NOW() - (($1 + $2) || ' seconds')::INTERVAL
		                      AND timestamp  < NOW() - ($1 || ' seconds')::INTERVAL)
		FROM events
		WHERE timestamp >= NOW() - (($1 + $2) || ' seconds')::INTERVAL
		  AND ($3::text IS NULL OR service     = $3)
		  AND ($4::text IS NULL OR environment = $4)
		  AND ($5::text IS NULL OR level       = $5)`,
		windowSecs, baselineSecs,
		nullableStr(alert.Service),
		nullableStr(alert.Environment),
		nullableStr(alert.Level),
	).Scan(&current, &baseline)
	return current, baseline, err
}

func (e *AlertEvaluator) recurrenceCount(ctx context.Context, alert repository.ActiveAlert, minutes int) (int64, error) {
	var count int64
	err := e.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM (
		    SELECT error_group_id
		    FROM events
		    WHERE timestamp >= NOW() - ($1 || ' minutes')::INTERVAL
		      AND error_group_id IS NOT NULL
		      AND ($2::text IS NULL OR service     = $2)
		      AND ($3::text IS NULL OR environment = $3)
		      AND ($4::text IS NULL OR level       = $4)
		    GROUP BY error_group_id
		    HAVING COUNT(*) > 1
		) t`,
		minutes,
		nullableStr(alert.Service),
		nullableStr(alert.Environment),
		nullableStr(alert.Level),
	).Scan(&count)
	return count, err
}

func (e *AlertEvaluator) newGroupCount(ctx context.Context, alert repository.ActiveAlert, since time.Time) (int64, error) {
	var count int64
	err := e.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM error_groups
		WHERE first_seen_at > $1
		  AND ($2::text IS NULL OR service     = $2)
		  AND ($3::text IS NULL OR environment = $3)
		  AND ($4::text IS NULL OR level       = $4)`,
		since,
		nullableStr(alert.Service),
		nullableStr(alert.Environment),
		nullableStr(alert.Level),
	).Scan(&count)
	return count, err
}

func nullableStr(s *string) *string { return s }
