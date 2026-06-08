package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// AppError is a domain error that carries an HTTP status and a safe message.
type AppError struct {
	Status  int
	Message string
}

func (e *AppError) Error() string { return e.Message }

var (
	ErrNotFound = &AppError{Status: http.StatusNotFound, Message: "resource not found"}
	ErrConflict = &AppError{Status: http.StatusConflict, Message: "resource already exists"}
)

// respond writes a JSON response. If err is an AppError it uses its status;
// pgx.ErrNoRows maps to 404; everything else becomes 500 with the message
// hidden from the client.
func respond(c *gin.Context, data any, err error) {
	if err == nil {
		c.JSON(http.StatusOK, data)
		return
	}

	var appErr *AppError
	if errors.As(err, &appErr) {
		c.JSON(appErr.Status, gin.H{"error": appErr.Message})
		return
	}

	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "resource not found"})
		return
	}

	// Don't leak internal details — log is handled by the audit middleware
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
}

func respondCreated(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, data)
}
