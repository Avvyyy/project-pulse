package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	redisclient "github.com/avvyyy/project-pulse/internal/redis"
	"github.com/avvyyy/project-pulse/internal/repository"
)

type APIKeyHandler struct {
	repo *repository.APIKeyRepo
	rdb  *redisclient.Client
}

func NewAPIKeyHandler(repo *repository.APIKeyRepo, rdb *redisclient.Client) *APIKeyHandler {
	return &APIKeyHandler{repo: repo, rdb: rdb}
}

func (h *APIKeyHandler) List(c *gin.Context) {
	keys, err := h.repo.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, keys)
}

func (h *APIKeyHandler) Create(c *gin.Context) {
	var body struct {
		Name               string `json:"name"                binding:"required"`
		RateLimitPerMinute int    `json:"rateLimitPerMinute"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.RateLimitPerMinute <= 0 {
		body.RateLimitPerMinute = 1000
	}

	rawKey, keyHash, err := generateKey()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate key"})
		return
	}

	key, err := h.repo.Create(c.Request.Context(), body.Name, keyHash, body.RateLimitPerMinute)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	full := "pk_" + rawKey
	key.FullKey = &full
	c.JSON(http.StatusCreated, key)
}

func (h *APIKeyHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	// Invalidate Redis cache for this key
	hash, err := h.repo.GetHashByID(c.Request.Context(), id)
	if err == nil {
		h.rdb.InvalidateAPIKey(c.Request.Context(), hash)
	}

	if err := h.repo.Delete(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "api key not found"})
		return
	}
	c.Status(http.StatusNoContent)
}

func generateKey() (raw, hash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return
	}
	raw = hex.EncodeToString(b)
	sum := sha256.Sum256(b)
	hash = fmt.Sprintf("%x", sum)
	return
}

