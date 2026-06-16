package server

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/avvyyy/project-pulse/internal/handler"
	"github.com/avvyyy/project-pulse/internal/middleware"
	"github.com/avvyyy/project-pulse/internal/config"
	redisclient "github.com/avvyyy/project-pulse/internal/redis"
	"github.com/avvyyy/project-pulse/internal/repository"
	"go.uber.org/zap"
)

type Deps struct {
	Redis       *redisclient.Client
	APIKeyRepo  *repository.APIKeyRepo
	Config      *config.Config
	AdminSecret string
	CORSOrigins []string
	Log         *zap.Logger
}

func New(d Deps,
	authH      *handler.AuthHandler,
	ingestH    *handler.IngestHandler,
	apiKeyH    *handler.APIKeyHandler,
	incidentH  *handler.IncidentHandler,
	alertH     *handler.AlertHandler,
	dashboardH *handler.DashboardHandler,
	healthH    *handler.HealthHandler,
	searchH    *handler.SearchHandler,
	wsH        *handler.WebSocketHandler,
) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())

	// CORS
	corsCfg := cors.DefaultConfig()
	corsCfg.AllowOrigins = d.CORSOrigins
	corsCfg.AllowMethods = []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"}
	corsCfg.AllowHeaders = []string{"Origin", "Content-Type", "X-Api-Key", "X-Admin-Secret"}
	corsCfg.AllowCredentials = true
	r.Use(cors.New(corsCfg))

	// IP rate limit (300 req/min)
	r.Use(middleware.IPRateLimit(d.Redis, 300))
	r.Use(middleware.Audit(d.Log))

	api := r.Group("/api/v1")

	// ── Health ────────────────────────────────────────────────────────────────
	api.GET("/health", healthH.Check)

	// ── Ingest ────────────────────────────────────────────────────────────────
	api.POST("/ingest", ingestH.Ingest)

	// ── WebSocket (real-time events) ──────────────────────────────────────────
	api.GET("/ws", wsH.Connect)

	// ── Auth ──────────────────────────────────────────────────────────────────
	authG := api.Group("/auth")
	{
		authG.POST("/signup", authH.Signup)
		authG.POST("/login", authH.Login)
		authG.POST("/refresh", authH.Refresh)
		authG.POST("/logout", authH.Logout)
		authG.GET("/me", middleware.UserAuthGuard(d.Config), authH.Me)
	}

	// ── Protected API ─────────────────────────────────────────────────────────
	protected := api.Group("")
	protected.Use(middleware.UserAuthGuard(d.Config))
	{
		// ── API Keys ──────────────────────────────────────────────────────────────
		protected.GET("/api-keys", apiKeyH.List)
		protected.POST("/api-keys", apiKeyH.Create)
		protected.DELETE("/api-keys/:id", apiKeyH.Delete)

		// ── Dashboard ─────────────────────────────────────────────────────────────
		protected.GET("/dashboard", dashboardH.Get)

		// ── Search ────────────────────────────────────────────────────────────────
		protected.GET("/search/events", searchH.SearchEvents)
		protected.GET("/search/groups", searchH.SearchGroups)
		protected.GET("/search/groups/:id/events", searchH.GetGroupEvents)

		// ── Incidents ─────────────────────────────────────────────────────────────
		protected.GET("/incidents", incidentH.List)
		protected.GET("/incidents/:id", incidentH.Get)
		protected.GET("/incidents/:id/frequency", incidentH.GetFrequency)

		protected.POST("/incidents", incidentH.Create)
		protected.PATCH("/incidents/:id", incidentH.Update)
		protected.DELETE("/incidents/:id", incidentH.Delete)
		protected.POST("/incidents/:id/timeline", incidentH.AddTimeline)
		protected.POST("/incidents/:id/error-groups", incidentH.LinkErrorGroup)
		protected.DELETE("/incidents/:id/error-groups/:egid", incidentH.UnlinkErrorGroup)

		// ── Alerts ────────────────────────────────────────────────────────────────
		protected.GET("/alerts", alertH.List)
		protected.GET("/alerts/:id", alertH.Get)
		protected.GET("/alerts/:id/triggers", alertH.ListTriggers)

		protected.POST("/alerts", alertH.Create)
		protected.PATCH("/alerts/:id", alertH.Update)
		protected.DELETE("/alerts/:id", alertH.Delete)
		protected.POST("/alerts/:id/toggle", alertH.Toggle)
		protected.POST("/alerts/:id/triggers/:tid/resolve", alertH.ResolveTrigger)
	}

	return r
}
