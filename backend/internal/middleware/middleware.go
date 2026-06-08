package middleware

import (
	"crypto/sha256"
	"crypto/subtle"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	redisclient "github.com/favouruzochukwu/project-pulse/internal/redis"
	"github.com/favouruzochukwu/project-pulse/internal/repository"
	"go.uber.org/zap"
)

// ── IP Rate Limit ─────────────────────────────────────────────────────────────

func IPRateLimit(rdb *redisclient.Client, limitPerMin int) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		allowed, err := rdb.CheckIPRateLimit(c.Request.Context(), ip, limitPerMin)
		if err != nil || !allowed {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			return
		}
		c.Next()
	}
}

// ── API Key Auth ──────────────────────────────────────────────────────────────

type apiKeyCtxKey struct{}

type APIKeyInfo struct {
	ID        string
	RateLimit int
}

func APIKeyAuth(rdb *redisclient.Client, keyRepo *repository.APIKeyRepo, log *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()

		blocked, _ := rdb.IsAuthBlocked(c.Request.Context(), ip)
		if blocked {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many failed attempts"})
			return
		}

		rawKey := c.GetHeader("X-Api-Key")
		if rawKey == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing X-Api-Key"})
			return
		}

		hash := hashKey(rawKey)

		// Check Redis cache first
		cached, err := rdb.GetCachedAPIKey(c.Request.Context(), hash)
		if err == nil && cached != nil {
			c.Set("apiKeyInfo", APIKeyInfo{ID: cached.ID, RateLimit: cached.RateLimit})
			c.Next()
			return
		}

		// Fall back to DB
		key, err := keyRepo.GetByHash(c.Request.Context(), hash)
		if err != nil || key == nil {
			rdb.RecordFailedAuth(c.Request.Context(), ip)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid API key"})
			return
		}

		rdb.CacheAPIKey(c.Request.Context(), hash, key.ID, key.RateLimitPerMinute)
		c.Set("apiKeyInfo", APIKeyInfo{ID: key.ID, RateLimit: key.RateLimitPerMinute})
		c.Next()
	}
}

// ── Per-Key Rate Limit ────────────────────────────────────────────────────────

func KeyRateLimit(rdb *redisclient.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		info, ok := c.Get("apiKeyInfo")
		if !ok {
			c.Next()
			return
		}
		ki := info.(APIKeyInfo)
		allowed, _ := rdb.CheckKeyRateLimit(c.Request.Context(), ki.ID, ki.RateLimit)
		if !allowed {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "key rate limit exceeded"})
			return
		}
		c.Next()
	}
}

// ── Admin Auth ────────────────────────────────────────────────────────────────

func AdminAuth(secret string) gin.HandlerFunc {
	secretBytes := []byte(secret)
	return func(c *gin.Context) {
		provided := c.GetHeader("X-Admin-Secret")
		if provided == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing X-Admin-Secret"})
			return
		}
		// Pad both sides to the same length so the comparison always runs the same
		// number of iterations regardless of the provided value's length.
		// This prevents both content-based and length-based timing attacks.
		providedBytes := []byte(provided)
		maxLen := len(secretBytes)
		if len(providedBytes) > maxLen {
			maxLen = len(providedBytes)
		}
		paddedProvided := make([]byte, maxLen)
		paddedSecret := make([]byte, maxLen)
		copy(paddedProvided, providedBytes)
		copy(paddedSecret, secretBytes)
		if subtle.ConstantTimeCompare(paddedProvided, paddedSecret) != 1 {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "invalid admin secret"})
			return
		}
		c.Next()
	}
}

// ── Audit Interceptor ─────────────────────────────────────────────────────────

func Audit(log *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		method := c.Request.Method
		if method != http.MethodPost && method != http.MethodPatch && method != http.MethodDelete {
			c.Next()
			return
		}
		start := time.Now()
		c.Next()
		log.Info("audit",
			zap.String("method", method),
			zap.String("path", c.Request.URL.Path),
			zap.Int("status", c.Writer.Status()),
			zap.Duration("latency", time.Since(start)),
			zap.String("ip", c.ClientIP()),
		)
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func hashKey(raw string) string {
	raw = strings.TrimPrefix(raw, "pk_")
	sum := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", sum)
}
