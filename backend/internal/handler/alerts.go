package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/avvyyy/project-pulse/internal/repository"
)

type AlertHandler struct {
	repo *repository.AlertRepo
}

func NewAlertHandler(repo *repository.AlertRepo) *AlertHandler {
	return &AlertHandler{repo: repo}
}

func (h *AlertHandler) List(c *gin.Context) {
	page, limit := pageLimit(c)

	var isActive *bool
	if v := c.Query("isActive"); v == "true" {
		t := true
		isActive = &t
	} else if v == "false" {
		f := false
		isActive = &f
	}

	result, err := h.repo.List(c.Request.Context(), isActive, c.Query("service"), page, limit)
	respond(c, result, err)
}

func (h *AlertHandler) Get(c *gin.Context) {
	alert, err := h.repo.Get(c.Request.Context(), c.Param("id"))
	if err != nil {
		respond(c, nil, err)
		return
	}
	if alert == nil {
		respond(c, nil, ErrNotFound)
		return
	}
	respond(c, alert, nil)
}

func (h *AlertHandler) Create(c *gin.Context) {
	var body struct {
		Name        string          `json:"name"        binding:"required"`
		Description *string         `json:"description"`
		Service     *string         `json:"service"`
		Environment *string         `json:"environment"`
		Level       *string         `json:"level"`
		Condition   json.RawMessage `json:"condition"   binding:"required"`
		IsActive    *bool           `json:"isActive"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}
	alert, err := h.repo.Create(c.Request.Context(),
		body.Name, body.Description, body.Service, body.Environment, body.Level,
		body.Condition, isActive,
	)
	if err != nil {
		respond(c, nil, err)
		return
	}
	respondCreated(c, alert)
}

func (h *AlertHandler) Update(c *gin.Context) {
	var body struct {
		Name        *string         `json:"name"`
		Description *string         `json:"description"`
		Service     *string         `json:"service"`
		Environment *string         `json:"environment"`
		Level       *string         `json:"level"`
		Condition   json.RawMessage `json:"condition"`
		IsActive    *bool           `json:"isActive"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	alert, err := h.repo.Update(c.Request.Context(), c.Param("id"), repository.AlertUpdate{
		Name: body.Name, Description: body.Description, Service: body.Service,
		Environment: body.Environment, Level: body.Level,
		Condition: body.Condition, IsActive: body.IsActive,
	})
	if err != nil {
		respond(c, nil, err)
		return
	}
	if alert == nil {
		respond(c, nil, ErrNotFound)
		return
	}
	respond(c, alert, nil)
}

func (h *AlertHandler) Delete(c *gin.Context) {
	if err := h.repo.Delete(c.Request.Context(), c.Param("id")); err != nil {
		respond(c, nil, ErrNotFound)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *AlertHandler) Toggle(c *gin.Context) {
	alert, err := h.repo.Toggle(c.Request.Context(), c.Param("id"))
	if err != nil {
		respond(c, nil, err)
		return
	}
	if alert == nil {
		respond(c, nil, ErrNotFound)
		return
	}
	respond(c, alert, nil)
}

func (h *AlertHandler) ListTriggers(c *gin.Context) {
	page, limit := pageLimit(c)
	result, err := h.repo.ListTriggers(c.Request.Context(), c.Param("id"), page, limit)
	respond(c, result, err)
}

func (h *AlertHandler) ResolveTrigger(c *gin.Context) {
	trigger, err := h.repo.ResolveTrigger(c.Request.Context(), c.Param("id"), c.Param("tid"))
	if err != nil {
		respond(c, nil, err)
		return
	}
	if trigger == nil {
		respond(c, nil, ErrNotFound)
		return
	}
	respond(c, trigger, nil)
}
