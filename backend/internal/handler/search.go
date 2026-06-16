package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/avvyyy/project-pulse/internal/models"
	"github.com/avvyyy/project-pulse/internal/repository"
	"github.com/avvyyy/project-pulse/internal/search"
)

type SearchHandler struct {
	es        *search.Client
	eventRepo *repository.EventRepo
}

func NewSearchHandler(es *search.Client, eventRepo *repository.EventRepo) *SearchHandler {
	return &SearchHandler{es: es, eventRepo: eventRepo}
}

func (h *SearchHandler) SearchEvents(c *gin.Context) {
	page, limit := pageLimit(c)
	result, err := h.es.SearchEvents(c.Request.Context(),
		c.Query("q"), c.Query("service"), c.Query("level"), page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, models.Paginated[map[string]any]{
		Total: result.Total, Page: page, Limit: limit, Results: result.Results,
	})
}

func (h *SearchHandler) SearchGroups(c *gin.Context) {
	page, limit := pageLimit(c)
	result, err := h.es.SearchGroups(c.Request.Context(),
		c.Query("q"), c.Query("service"), c.Query("status"), page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, models.Paginated[map[string]any]{
		Total: result.Total, Page: page, Limit: limit, Results: result.Results,
	})
}

// GetGroupEvents returns paginated events for a specific error group.
func (h *SearchHandler) GetGroupEvents(c *gin.Context) {
	groupID := c.Param("id")
	page, limit := pageLimit(c)

	result, err := h.eventRepo.ListEventsByGroup(c.Request.Context(), groupID, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}
