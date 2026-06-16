package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/avvyyy/project-pulse/internal/repository"
)

type DashboardHandler struct {
	repo *repository.DashboardRepo
}

func NewDashboardHandler(repo *repository.DashboardRepo) *DashboardHandler {
	return &DashboardHandler{repo: repo}
}

func (h *DashboardHandler) Get(c *gin.Context) {
	period := c.DefaultQuery("period", "24h")
	switch period {
	case "24h", "7d", "30d":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "period must be 24h, 7d, or 30d"})
		return
	}

	data, err := h.repo.Get(c.Request.Context(), period)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}
