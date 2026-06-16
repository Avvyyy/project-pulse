package middleware

import (
	"net/http"

	"github.com/avvyyy/project-pulse/internal/auth"
	"github.com/avvyyy/project-pulse/internal/config"
	"github.com/gin-gonic/gin"
)

// UserAuthGuard protects routes requiring a valid user session.
func UserAuthGuard(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Read access token from HTTP-only cookie
		cookie, err := c.Cookie("access_token")
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		claims, err := auth.ValidateToken(cookie, cfg.JWTSecret)
		if err != nil || claims.Subject != "access" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized or invalid token"})
			return
		}

		// Inject user ID into context
		c.Set("userID", claims.UserID)
		c.Next()
	}
}
