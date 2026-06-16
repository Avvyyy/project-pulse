package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/favouruzochukwu/project-pulse/internal/repository"
)

type IncidentHandler struct {
	repo *repository.IncidentRepo
}

func NewIncidentHandler(repo *repository.IncidentRepo) *IncidentHandler {
	return &IncidentHandler{repo: repo}
}

func (h *IncidentHandler) List(c *gin.Context) {
	page, limit := pageLimit(c)
	result, err := h.repo.List(c.Request.Context(),
		c.Query("status"), c.Query("severity"), c.Query("service"),
		page, limit,
	)
	respond(c, result, err)
}

func (h *IncidentHandler) Get(c *gin.Context) {
	inc, err := h.repo.Get(c.Request.Context(), c.Param("id"))
	if err != nil {
		respond(c, nil, err)
		return
	}
	if inc == nil {
		respond(c, nil, ErrNotFound)
		return
	}
	respond(c, inc, nil)
}

func (h *IncidentHandler) Create(c *gin.Context) {
	var body struct {
		Title       string  `json:"title"       binding:"required"`
		Severity    string  `json:"severity"    binding:"required,oneof=critical high medium low"`
		Description *string `json:"description"`
		Service     *string `json:"service"`
		Environment *string `json:"environment"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	inc, err := h.repo.Create(c.Request.Context(), body.Title, body.Severity, body.Description, body.Service, body.Environment)
	if err != nil {
		respond(c, nil, err)
		return
	}
	respondCreated(c, inc)
}

func (h *IncidentHandler) Update(c *gin.Context) {
	var body struct {
		Status      *string `json:"status"`
		Severity    *string `json:"severity"`
		Description *string `json:"description"`
		Actor       *string `json:"actor"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	inc, err := h.repo.Update(c.Request.Context(), c.Param("id"), repository.IncidentUpdate{
		Status: body.Status, Severity: body.Severity, Description: body.Description,
	})
	if err != nil {
		respond(c, nil, err)
		return
	}
	if inc == nil {
		respond(c, nil, ErrNotFound)
		return
	}
	if body.Status != nil && body.Actor != nil {
		msg := "Status changed to " + *body.Status
		h.repo.AddTimeline(c.Request.Context(), inc.ID, "status_change", msg, body.Actor)
	}
	respond(c, inc, nil)
}

func (h *IncidentHandler) Delete(c *gin.Context) {
	if err := h.repo.Delete(c.Request.Context(), c.Param("id")); err != nil {
		respond(c, nil, ErrNotFound)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *IncidentHandler) AddTimeline(c *gin.Context) {
	var body struct {
		Message string  `json:"message" binding:"required"`
		Actor   *string `json:"actor"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	entry, err := h.repo.AddTimeline(c.Request.Context(), c.Param("id"), "comment", body.Message, body.Actor)
	if err != nil {
		respond(c, nil, err)
		return
	}
	respondCreated(c, entry)
}

func (h *IncidentHandler) LinkErrorGroup(c *gin.Context) {
	var body struct {
		ErrorGroupID string `json:"errorGroupId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.repo.LinkErrorGroup(c.Request.Context(), c.Param("id"), body.ErrorGroupID); err != nil {
		respond(c, nil, err)
		return
	}
	c.Status(http.StatusCreated)
}

func (h *IncidentHandler) UnlinkErrorGroup(c *gin.Context) {
	if err := h.repo.UnlinkErrorGroup(c.Request.Context(), c.Param("id"), c.Param("egid")); err != nil {
		respond(c, nil, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *IncidentHandler) GetFrequency(c *gin.Context) {
	pts, err := h.repo.GetFrequency(c.Request.Context(), c.Param("id"))
	respond(c, pts, err)
}

func pageLimit(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	return page, limit
}
