package handler

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/avvyyy/project-pulse/internal/models"
	"github.com/avvyyy/project-pulse/internal/queue"
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
		c.JSON(http.StatusBadRequest, gin.H{"error": humanizeBindingError(err.Error())})
		return
	}

	var tsNano int64
	if payload.Timestamp != nil {
		tsNano = payload.Timestamp.UnixNano()
	}

	tags := payload.Tags
	if tags == nil {
		tags = []string{}
	}

	job := queue.Job{
		Service:     payload.Service,
		Environment: payload.Environment,
		Level:       payload.Level,
		Message:     payload.Message,
		ErrorType:   payload.ErrorType,
		Tags:        tags,
		Timestamp:   tsNano,
	}

	if !h.q.Enqueue(job) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "queue full, retry later"})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{"accepted": true})
}
 
func humanizeBindingError(raw string) string {
  if strings.Contains(raw, "IngestPayload.tags") {
    return "invalid payload: tags must be an array of strings"
  }
  if strings.Contains(raw, "Service") && strings.Contains(raw, "required") {
    return "invalid payload: service is required"
  }
  if strings.Contains(raw, "Level") && strings.Contains(raw, "required") {
    return "invalid payload: level is required"
  }
  if strings.Contains(raw, "Message") && strings.Contains(raw, "required") {
    return "invalid payload: message is required"
  }
  if strings.Contains(raw, "invalid value") && strings.Contains(raw, "level") {
    return "invalid payload: level must be one of error, warn, info, debug"
  }
  return fmt.Sprintf("invalid payload: %s", raw)
}
