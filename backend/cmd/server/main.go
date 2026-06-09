package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/avvyyy/project-pulse/internal/config"
	"github.com/avvyyy/project-pulse/internal/db"
	"github.com/avvyyy/project-pulse/internal/handler"
	"github.com/avvyyy/project-pulse/internal/pipeline"
	"github.com/avvyyy/project-pulse/internal/queue"
	redisclient "github.com/avvyyy/project-pulse/internal/redis"
	"github.com/avvyyy/project-pulse/internal/repository"
	"github.com/avvyyy/project-pulse/internal/scheduler"
	"github.com/avvyyy/project-pulse/internal/search"
	"github.com/avvyyy/project-pulse/internal/server"
	"go.uber.org/zap"
)

func main() {
	log, _ := zap.NewProduction()
	defer log.Sync()

	cfg, err := config.Load()
	if err != nil {
		log.Fatal("load config", zap.Error(err))
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// ── Database ──────────────────────────────────────────────────────────────
	pool, err := db.New(ctx, cfg.PostgresDSN)
	if err != nil {
		log.Fatal("connect postgres", zap.Error(err))
	}
	defer pool.Close()

	migrationsDir := migrationsPath()
	if err := db.Migrate(ctx, pool, migrationsDir); err != nil {
		log.Fatal("run migrations", zap.Error(err))
	}
	log.Info("migrations applied")

	// ── Redis ─────────────────────────────────────────────────────────────────
	rdb, err := redisclient.New(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
	if err != nil {
		log.Fatal("connect redis", zap.Error(err))
	}
	defer rdb.Close()

	// ── Elasticsearch ─────────────────────────────────────────────────────────
	esClient, err := search.New(cfg.ElasticsearchURL, cfg.ElasticsearchIndexEvents)
	if err != nil {
		log.Fatal("create es client", zap.Error(err))
	}
	if err := esClient.EnsureIndices(ctx); err != nil {
		log.Warn("ensure es indices", zap.Error(err))
	}

	// ── Repositories ──────────────────────────────────────────────────────────
	apiKeyRepo   := repository.NewAPIKeyRepo(pool)
	eventRepo    := repository.NewEventRepo(pool)
	incidentRepo := repository.NewIncidentRepo(pool)
	alertRepo    := repository.NewAlertRepo(pool)
	dashboardRepo := repository.NewDashboardRepo(pool)

	// ── Ingestion pipeline + queue ────────────────────────────────────────────
	proc := pipeline.NewProcessor(eventRepo, esClient, log)
	q := queue.New(10, 1000, proc.Handle)
	defer q.Shutdown()

	// ── Alert evaluator ───────────────────────────────────────────────────────
	evaluator := scheduler.NewAlertEvaluator(alertRepo, pool, log)
	evaluator.Start(ctx)

	// ── HTTP handlers ─────────────────────────────────────────────────────────
	ingestH    := handler.NewIngestHandler(q, log)
	apiKeyH    := handler.NewAPIKeyHandler(apiKeyRepo, rdb)
	incidentH  := handler.NewIncidentHandler(incidentRepo)
	alertH     := handler.NewAlertHandler(alertRepo)
	dashboardH := handler.NewDashboardHandler(dashboardRepo)
	healthH    := handler.NewHealthHandler(pool, rdb, esClient)
	searchH    := handler.NewSearchHandler(esClient)

	deps := server.Deps{
		Redis:       rdb,
		APIKeyRepo:  apiKeyRepo,
		AdminSecret: cfg.AdminSecret,
		CORSOrigins: cfg.CORSAllowedOrigins,
		Log:         log,
	}

	r := server.New(deps, ingestH, apiKeyH, incidentH, alertH, dashboardH, healthH, searchH)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.AppPort),
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Info("server starting", zap.String("port", cfg.AppPort))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("server error", zap.Error(err))
		}
	}()

	<-ctx.Done()
	log.Info("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("graceful shutdown failed", zap.Error(err))
	}
	log.Info("server stopped")
}

func migrationsPath() string {
	// In Docker the binary is at /app/server, migrations at /app/migrations
	if _, err := os.Stat("/app/migrations"); err == nil {
		return "/app/migrations"
	}
	// Local dev: relative to the module root
	return "migrations"
}
