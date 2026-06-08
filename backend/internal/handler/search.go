package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/favouruzochukwu/project-pulse/internal/models"
	"github.com/favouruzochukwu/project-pulse/internal/search"
)

type SearchHandler struct {
	es *search.Client
}

func NewSearchHandler(es *search.Client) *SearchHandler {
	return &SearchHandler{es: es}
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
