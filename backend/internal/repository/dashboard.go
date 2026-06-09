package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/avvyyy/project-pulse/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/sync/errgroup"
)

type DashboardRepo struct{ db *pgxpool.Pool }

func NewDashboardRepo(db *pgxpool.Pool) *DashboardRepo { return &DashboardRepo{db: db} }

type periodBounds struct {
	start     time.Time
	prevStart time.Time
	bucket    string // 'hour' | 'day'
}

func parsePeriod(period string) (periodBounds, error) {
	now := time.Now().UTC()
	switch period {
	case "24h":
		return periodBounds{start: now.Add(-24 * time.Hour), prevStart: now.Add(-48 * time.Hour), bucket: "hour"}, nil
	case "7d":
		return periodBounds{start: now.Add(-7 * 24 * time.Hour), prevStart: now.Add(-14 * 24 * time.Hour), bucket: "day"}, nil
	case "30d":
		return periodBounds{start: now.Add(-30 * 24 * time.Hour), prevStart: now.Add(-60 * 24 * time.Hour), bucket: "day"}, nil
	default:
		return periodBounds{}, fmt.Errorf("invalid period: %s", period)
	}
}

// Get runs all dashboard sub-queries concurrently using errgroup.
func (r *DashboardRepo) Get(ctx context.Context, period string) (*models.DashboardData, error) {
	pb, err := parsePeriod(period)
	if err != nil {
		return nil, err
	}

	var (
		overview        models.Overview
		volumeTrend     []models.VolumePoint
		serviceHealth   []models.ServiceHealth
		topErrorGroups  []models.TopErrorGroup
		incidentSummary models.IncidentSummary
		topErrorTypes   []models.TopErrorType
	)

	g, gctx := errgroup.WithContext(ctx)

	g.Go(func() error {
		return r.queryOverview(gctx, pb, &overview)
	})
	g.Go(func() error {
		var e error
		volumeTrend, e = r.queryVolumeTrend(gctx, pb)
		return e
	})
	g.Go(func() error {
		var e error
		serviceHealth, e = r.queryServiceHealth(gctx, pb)
		return e
	})
	g.Go(func() error {
		var e error
		topErrorGroups, e = r.queryTopErrorGroups(gctx, pb)
		return e
	})
	g.Go(func() error {
		var e error
		incidentSummary, e = r.queryIncidentSummary(gctx, pb)
		return e
	})
	g.Go(func() error {
		var e error
		topErrorTypes, e = r.queryTopErrorTypes(gctx, pb)
		return e
	})

	if err := g.Wait(); err != nil {
		return nil, err
	}

	if overview.EventsThisPeriod > 0 {
		overview.ErrorRate = float64(overview.ErrorsThisPeriod) / float64(overview.EventsThisPeriod) * 100
	}

	return &models.DashboardData{
		Period:          period,
		GeneratedAt:     time.Now().UTC(),
		Overview:        overview,
		VolumeTrend:     volumeTrend,
		ServiceHealth:   serviceHealth,
		TopErrorGroups:  topErrorGroups,
		IncidentSummary: incidentSummary,
		TopErrorTypes:   topErrorTypes,
	}, nil
}

// queryOverview fetches all overview KPIs in a single CTE query.
func (r *DashboardRepo) queryOverview(ctx context.Context, pb periodBounds, out *models.Overview) error {
	return r.db.QueryRow(ctx, `
		WITH ev AS (
		    SELECT
		        COUNT(*) FILTER (WHERE timestamp >= $1)                               AS this_events,
		        COUNT(*) FILTER (WHERE timestamp >= $2 AND timestamp < $1)            AS prev_events,
		        COUNT(*) FILTER (WHERE timestamp >= $1 AND level = 'error')           AS this_errors,
		        COUNT(*) FILTER (WHERE timestamp >= $2 AND timestamp < $1 AND level = 'error') AS prev_errors
		    FROM events
		    WHERE timestamp >= $2
		),
		ai AS (SELECT COUNT(*) AS cnt FROM incidents WHERE status != 'resolved'),
		fa AS (SELECT COUNT(DISTINCT alert_id) AS cnt FROM alert_triggers WHERE resolved_at IS NULL),
		og AS (SELECT COUNT(*) AS cnt FROM error_groups WHERE status = 'open')
		SELECT ev.this_events, ev.prev_events, ev.this_errors, ev.prev_errors,
		       ai.cnt, fa.cnt, og.cnt
		FROM ev, ai, fa, og`,
		pb.start, pb.prevStart,
	).Scan(
		&out.EventsThisPeriod, &out.EventsPrevPeriod,
		&out.ErrorsThisPeriod, &out.ErrorsPrevPeriod,
		&out.ActiveIncidents, &out.FiringAlerts, &out.OpenErrorGroups,
	)
}

func (r *DashboardRepo) queryVolumeTrend(ctx context.Context, pb periodBounds) ([]models.VolumePoint, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
		    date_trunc($1, timestamp)::text AS bucket,
		    COUNT(*)                          AS total,
		    COUNT(*) FILTER (WHERE level = 'error') AS errors,
		    COUNT(*) FILTER (WHERE level = 'warn')  AS warns
		FROM events
		WHERE timestamp >= $2
		GROUP BY bucket
		ORDER BY bucket`,
		pb.bucket, pb.start,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var pts []models.VolumePoint
	for rows.Next() {
		var p models.VolumePoint
		if err := rows.Scan(&p.Bucket, &p.Total, &p.Errors, &p.Warns); err != nil {
			return nil, err
		}
		pts = append(pts, p)
	}
	if pts == nil {
		pts = []models.VolumePoint{}
	}
	return pts, rows.Err()
}

// queryServiceHealth uses a CTE to avoid a correlated subquery per service (no N+1).
func (r *DashboardRepo) queryServiceHealth(ctx context.Context, pb periodBounds) ([]models.ServiceHealth, error) {
	rows, err := r.db.Query(ctx, `
		WITH event_stats AS (
		    SELECT
		        service,
		        COUNT(*)                               AS events_total,
		        COUNT(*) FILTER (WHERE level = 'error') AS errors_total
		    FROM events
		    WHERE timestamp >= $1
		    GROUP BY service
		),
		group_stats AS (
		    SELECT service, COUNT(*) AS open_groups
		    FROM error_groups WHERE status = 'open'
		    GROUP BY service
		)
		SELECT
		    es.service,
		    es.events_total,
		    es.errors_total,
		    CASE WHEN es.events_total > 0
		         THEN es.errors_total * 100.0 / es.events_total
		         ELSE 0 END AS error_rate,
		    COALESCE(gs.open_groups, 0) AS open_groups
		FROM event_stats es
		LEFT JOIN group_stats gs ON gs.service = es.service
		ORDER BY es.events_total DESC`,
		pb.start,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []models.ServiceHealth
	for rows.Next() {
		var s models.ServiceHealth
		if err := rows.Scan(&s.Service, &s.EventsTotal, &s.ErrorsTotal, &s.ErrorRate, &s.OpenErrorGroups); err != nil {
			return nil, err
		}
		switch {
		case s.ErrorRate >= 20:
			s.Status = "critical"
		case s.ErrorRate >= 5:
			s.Status = "degraded"
		default:
			s.Status = "healthy"
		}
		list = append(list, s)
	}
	if list == nil {
		list = []models.ServiceHealth{}
	}
	return list, rows.Err()
}

func (r *DashboardRepo) queryTopErrorGroups(ctx context.Context, pb periodBounds) ([]models.TopErrorGroup, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, title, service, level, occurrence_count, last_seen_at
		FROM error_groups
		WHERE status = 'open' AND last_seen_at >= $1
		ORDER BY occurrence_count DESC
		LIMIT 10`,
		pb.start,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []models.TopErrorGroup
	for rows.Next() {
		var g models.TopErrorGroup
		if err := rows.Scan(&g.ID, &g.Title, &g.Service, &g.Level, &g.OccurrenceCount, &g.LastSeenAt); err != nil {
			return nil, err
		}
		list = append(list, g)
	}
	if list == nil {
		list = []models.TopErrorGroup{}
	}
	return list, rows.Err()
}

func (r *DashboardRepo) queryIncidentSummary(ctx context.Context, pb periodBounds) (models.IncidentSummary, error) {
	// Per-(status, severity) group: count total rows and, for resolved rows only,
	// count how many were resolved within the period — avoids BOOL_OR overcounting.
	rows, err := r.db.Query(ctx, `
		SELECT
		    status,
		    severity,
		    COUNT(*) AS cnt,
		    CASE WHEN status = 'resolved'
		         THEN SUM(CASE WHEN resolved_at >= $1 THEN 1 ELSE 0 END)
		         ELSE 0 END AS in_period
		FROM incidents
		GROUP BY status, severity`,
		pb.start,
	)
	if err != nil {
		return models.IncidentSummary{}, err
	}
	defer rows.Close()

	summary := models.IncidentSummary{BySeverity: make(map[string]int64)}
	for rows.Next() {
		var status, severity string
		var cnt, inPeriod int64
		if err := rows.Scan(&status, &severity, &cnt, &inPeriod); err != nil {
			return summary, err
		}
		switch status {
		case "open":
			summary.Open += cnt
		case "investigating":
			summary.Investigating += cnt
		case "resolved":
			summary.ResolvedInPeriod += inPeriod
		}
		summary.BySeverity[severity] += cnt
	}
	return summary, rows.Err()
}

func (r *DashboardRepo) queryTopErrorTypes(ctx context.Context, pb periodBounds) ([]models.TopErrorType, error) {
	rows, err := r.db.Query(ctx, `
		SELECT error_type, COUNT(*) AS cnt
		FROM events
		WHERE timestamp >= $1 AND error_type IS NOT NULL
		GROUP BY error_type
		ORDER BY cnt DESC
		LIMIT 10`,
		pb.start,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []models.TopErrorType
	for rows.Next() {
		var t models.TopErrorType
		if err := rows.Scan(&t.ErrorType, &t.Count); err != nil {
			return nil, err
		}
		list = append(list, t)
	}
	if list == nil {
		list = []models.TopErrorType{}
	}
	return list, rows.Err()
}
