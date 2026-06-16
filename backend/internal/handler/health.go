package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	redisclient "github.com/avvyyy/project-pulse/internal/redis"
	"github.com/avvyyy/project-pulse/internal/search"
)

type HealthHandler struct {
	db  *pgxpool.Pool
	rdb *redisclient.Client
	es  *search.Client
}

func NewHealthHandler(db *pgxpool.Pool, rdb *redisclient.Client, es *search.Client) *HealthHandler {
	return &HealthHandler{db: db, rdb: rdb, es: es}
}

func (h *HealthHandler) Check(c *gin.Context) {
	checks := map[string]string{}
	allOK := true

	if err := h.db.Ping(c.Request.Context()); err != nil {
		checks["postgres"] = "down: " + err.Error()
		allOK = false
	} else {
		checks["postgres"] = "ok"
	}

	if err := h.rdb.Ping(c.Request.Context()); err != nil {
		checks["redis"] = "down: " + err.Error()
		allOK = false
	} else {
		checks["redis"] = "ok"
	}

	if err := h.es.Ping(c.Request.Context()); err != nil {
		checks["elasticsearch"] = "down: " + err.Error()
		allOK = false
	} else {
		checks["elasticsearch"] = "ok"
	}

	status := http.StatusOK
	if !allOK {
		status = http.StatusServiceUnavailable
	}
	c.JSON(status, gin.H{"status": map[bool]string{true: "ok", false: "degraded"}[allOK], "checks": checks})
}
