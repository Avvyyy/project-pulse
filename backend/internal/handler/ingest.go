package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/favouruzochukwu/project-pulse/internal/models"
	"github.com/favouruzochukwu/project-pulse/internal/queue"
	"go.uber.org/zap"
)

type IngestHandler struct {
	q   *queue.Queue
	log *zap.Logger
}

func NewIngestHandler(q *queue.Queue, log *zap.Logger) *IngestHandler {
	return &IngestHandler{q: q, log: log}
}

func (h *IngestHandler) Ingest(c *gin.Context) {
	var payload models.IngestPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var tsNano int64
	if payload.Timestamp != nil {
		tsNano = payload.Timestamp.UnixNano()
	}

	job := queue.Job{
		Service:     payload.Service,
		Environment: payload.Environment,
		Level:       payload.Level,
		Message:     payload.Message,
		ErrorType:   payload.ErrorType,
		Tags:        payload.Tags,
		Timestamp:   tsNano,
	}

	if !h.q.Enqueue(job) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "queue full, retry later"})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{"accepted": true})
}
