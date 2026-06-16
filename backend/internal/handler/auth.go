package handler

import (
	"net/http"

	"github.com/avvyyy/project-pulse/internal/auth"
	"github.com/avvyyy/project-pulse/internal/config"
	"github.com/avvyyy/project-pulse/internal/repository"
	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	userRepo *repository.UserRepo
	cfg      *config.Config
}

func NewAuthHandler(userRepo *repository.UserRepo, cfg *config.Config) *AuthHandler {
	return &AuthHandler{userRepo: userRepo, cfg: cfg}
}

func (h *AuthHandler) Signup(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=8"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	existingUser, err := h.userRepo.GetByEmail(c.Request.Context(), req.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
		return
	}
	if existingUser != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "User already exists"})
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	user, err := h.userRepo.Create(c.Request.Context(), req.Email, hash)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	h.setCookies(c, user.ID)
	c.JSON(http.StatusCreated, gin.H{"message": "User created", "user": gin.H{"id": user.ID, "email": user.Email}})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.userRepo.GetByEmail(c.Request.Context(), req.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
		return
	}
	if user == nil || !auth.CheckPasswordHash(req.Password, user.PasswordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	h.setCookies(c, user.ID)
	c.JSON(http.StatusOK, gin.H{"message": "Logged in successfully", "user": gin.H{"id": user.ID, "email": user.Email}})
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	cookie, err := c.Cookie("refresh_token")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "No refresh token"})
		return
	}

	claims, err := auth.ValidateToken(cookie, h.cfg.JWTSecret)
	if err != nil || claims.Subject != "refresh" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid refresh token"})
		return
	}

	h.setCookies(c, claims.UserID)
	c.JSON(http.StatusOK, gin.H{"message": "Tokens refreshed"})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	c.SetCookie("access_token", "", -1, "/", "", false, true)
	c.SetCookie("refresh_token", "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID := c.GetString("userID")
	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": gin.H{"id": user.ID, "email": user.Email}})
}

func (h *AuthHandler) setCookies(c *gin.Context, userID string) {
	accessToken, refreshToken, err := auth.GenerateTokens(userID, h.cfg.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate tokens"})
		return
	}

	// For local dev, secure should ideally be true if HTTPS, but typically false for localhost
	// SameSiteMode is Lax or Strict.
	secure := h.cfg.AppEnv == "production"

	c.SetCookie("access_token", accessToken, int(15*60), "/", "", secure, true)
	c.SetCookie("refresh_token", refreshToken, int(7*24*60*60), "/", "", secure, true)
}
