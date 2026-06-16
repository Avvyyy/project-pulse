package server

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/favouruzochukwu/project-pulse/internal/handler"
	"github.com/favouruzochukwu/project-pulse/internal/middleware"
	redisclient "github.com/favouruzochukwu/project-pulse/internal/redis"
	"github.com/favouruzochukwu/project-pulse/internal/repository"
	"go.uber.org/zap"
)

type Deps struct {
	Redis       *redisclient.Client
	APIKeyRepo  *repository.APIKeyRepo
	AdminSecret string
	CORSOrigins []string
	Log         *zap.Logger
}

func New(d Deps,
	ingestH    *handler.IngestHandler,
	apiKeyH    *handler.APIKeyHandler,
	incidentH  *handler.IncidentHandler,
	alertH     *handler.AlertHandler,
	dashboardH *handler.DashboardHandler,
	healthH    *handler.HealthHandler,
	searchH    *handler.SearchHandler,
) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())

	// CORS
	corsCfg := cors.DefaultConfig()
	corsCfg.AllowOrigins = d.CORSOrigins
	corsCfg.AllowMethods = []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"}
	corsCfg.AllowHeaders = []string{"Origin", "Content-Type", "X-Api-Key", "X-Admin-Secret"}
	r.Use(cors.New(corsCfg))

	// IP rate limit (300 req/min)
	r.Use(middleware.IPRateLimit(d.Redis, 300))
	r.Use(middleware.Audit(d.Log))

	api := r.Group("/api/v1")

	// ── Health ────────────────────────────────────────────────────────────────
	api.GET("/health", healthH.Check)

	// ── Ingest (requires API key + per-key rate limit) ────────────────────────
	ingest := api.Group("/ingest")
	ingest.Use(middleware.APIKeyAuth(d.Redis, d.APIKeyRepo, d.Log))
	ingest.Use(middleware.KeyRateLimit(d.Redis))
	ingest.POST("", ingestH.Ingest)

	// ── Admin (requires admin secret) ────────────────────────────────────────
	admin := api.Group("/admin")
	admin.Use(middleware.AdminAuth(d.AdminSecret))
	{
		admin.GET("/api-keys", apiKeyH.List)
		admin.POST("/api-keys", apiKeyH.Create)
		admin.DELETE("/api-keys/:id", apiKeyH.Delete)
	}

	// ── Dashboard ─────────────────────────────────────────────────────────────
	api.GET("/dashboard", dashboardH.Get)

	// ── Search ────────────────────────────────────────────────────────────────
	api.GET("/search/events", searchH.SearchEvents)
	api.GET("/search/groups", searchH.SearchGroups)

	// ── Incidents ─────────────────────────────────────────────────────────────
	api.GET("/incidents", incidentH.List)
	api.GET("/incidents/:id", incidentH.Get)
	api.GET("/incidents/:id/frequency", incidentH.GetFrequency)

	incidentAdmin := api.Group("/incidents")
	incidentAdmin.Use(middleware.AdminAuth(d.AdminSecret))
	{
		incidentAdmin.POST("", incidentH.Create)
		incidentAdmin.PATCH("/:id", incidentH.Update)
		incidentAdmin.DELETE("/:id", incidentH.Delete)
		incidentAdmin.POST("/:id/timeline", incidentH.AddTimeline)
		incidentAdmin.POST("/:id/error-groups", incidentH.LinkErrorGroup)
		incidentAdmin.DELETE("/:id/error-groups/:egid", incidentH.UnlinkErrorGroup)
	}

	// ── Alerts ────────────────────────────────────────────────────────────────
	api.GET("/alerts", alertH.List)
	api.GET("/alerts/:id", alertH.Get)
	api.GET("/alerts/:id/triggers", alertH.ListTriggers)

	alertAdmin := api.Group("/alerts")
	alertAdmin.Use(middleware.AdminAuth(d.AdminSecret))
	{
		alertAdmin.POST("", alertH.Create)
		alertAdmin.PATCH("/:id", alertH.Update)
		alertAdmin.DELETE("/:id", alertH.Delete)
		alertAdmin.POST("/:id/toggle", alertH.Toggle)
		alertAdmin.POST("/:id/triggers/:tid/resolve", alertH.ResolveTrigger)
	}

	return r
}
