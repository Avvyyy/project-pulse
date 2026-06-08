package pipeline

import (
	"context"
	"crypto/sha256"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/favouruzochukwu/project-pulse/internal/models"
	"github.com/favouruzochukwu/project-pulse/internal/queue"
	"github.com/favouruzochukwu/project-pulse/internal/repository"
	"github.com/favouruzochukwu/project-pulse/internal/search"
	"go.uber.org/zap"
)

// Processor runs the 4-stage ingestion pipeline:
//   normalize → enrich → fingerprint → store
type Processor struct {
	eventRepo *repository.EventRepo
	searchClient *search.Client
	log      *zap.Logger
}

func NewProcessor(eventRepo *repository.EventRepo, searchClient *search.Client, log *zap.Logger) *Processor {
	return &Processor{eventRepo: eventRepo, searchClient: searchClient, log: log}
}

// Handle is the queue.Handler implementation.
func (p *Processor) Handle(ctx context.Context, job queue.Job) {
	event, egID, err := p.process(ctx, job)
	if err != nil {
		p.log.Error("pipeline error", zap.Error(err))
		return
	}

	if err := p.eventRepo.CreateEvent(ctx, event); err != nil {
		p.log.Error("store event", zap.Error(err))
		return
	}

	// Index asynchronously — don't block on ES failures
	go func() {
		doc := map[string]any{
			"id": event.ID, "service": event.Service, "environment": event.Environment,
			"level": event.Level, "message": event.Message, "error_type": event.ErrorType,
			"fingerprint": event.Fingerprint, "timestamp": event.Timestamp,
			"received_at": event.ReceivedAt, "error_group_id": event.ErrorGroupID,
		}
		if err := p.searchClient.IndexEvent(context.Background(), event.ID, doc); err != nil {
			p.log.Warn("es index event", zap.Error(err))
		}
		if egID != "" {
			egDoc := map[string]any{
				"id": egID, "service": event.Service, "environment": event.Environment,
				"level": event.Level, "fingerprint": event.Fingerprint,
			}
			if err := p.searchClient.IndexGroup(context.Background(), egID, egDoc); err != nil {
				p.log.Warn("es index group", zap.Error(err))
			}
		}
	}()
}

func (p *Processor) process(ctx context.Context, job queue.Job) (*models.Event, string, error) {
	// Stage 1: Normalize
	svc := normalize(job.Service)
	env := job.Environment
	if env == "" {
		env = "production"
	}
	msg := truncate(job.Message, 5000)
	level := strings.ToLower(job.Level)

	// Stage 2: Enrich
	var ts time.Time
	if job.Timestamp > 0 {
		ts = time.Unix(0, job.Timestamp)
		// Drop events more than 1 hour stale or 5 minutes in the future
		now := time.Now()
		if ts.Before(now.Add(-1*time.Hour)) || ts.After(now.Add(5*time.Minute)) {
			ts = now
		}
	} else {
		ts = time.Now()
	}

	severityScore := severityOf(level)
	errorType := job.ErrorType

	// Stage 3: Fingerprint
	fp := fingerprint(svc, level, msg)

	// Stage 4: Route — upsert error group, then create event
	title := truncate(msg, 200)
	egID, err := p.eventRepo.UpsertErrorGroup(ctx, fp, svc, env, level, title, ts)
	if err != nil {
		return nil, "", fmt.Errorf("upsert error group: %w", err)
	}

	event := &models.Event{
		ID:            uuid.New().String(),
		Service:       svc,
		Environment:   env,
		Level:         level,
		Message:       msg,
		Fingerprint:   fp,
		SeverityScore: severityScore,
		Tags:          job.Tags,
		Timestamp:     ts,
		ReceivedAt:    time.Now(),
		ErrorGroupID:  &egID,
	}
	if errorType != "" {
		event.ErrorType = &errorType
	}

	return event, egID, nil
}

func normalize(s string) string {
	return strings.TrimSpace(strings.ToLower(s))
}

func truncate(s string, max int) string {
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	r := []rune(s)
	return string(r[:max])
}

func severityOf(level string) int {
	switch level {
	case "error":
		return 3
	case "warn":
		return 2
	case "info":
		return 1
	default:
		return 0
	}
}

func fingerprint(service, level, message string) string {
	// Normalise message: strip numbers and UUIDs to group similar errors
	msg := normaliseMessage(message)
	raw := fmt.Sprintf("%s:%s:%s", service, level, msg)
	sum := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", sum)
}

func normaliseMessage(msg string) string {
	msg = strings.ToLower(msg)
	var result strings.Builder
	inDigit := false
	for _, r := range msg {
		if r >= '0' && r <= '9' {
			if !inDigit {
				result.WriteString("<N>")
				inDigit = true
			}
		} else {
			inDigit = false
			result.WriteRune(r)
		}
	}
	return result.String()
}
