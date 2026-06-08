package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() { gin.SetMode(gin.TestMode) }

// TestIngestPayloadValidation exercises the JSON binding rules for the ingest
// endpoint without requiring a real queue or database.
func TestIngestPayloadValidation(t *testing.T) {
	r := gin.New()
	r.POST("/ingest", func(c *gin.Context) {
		var p struct {
			Service string `json:"service" binding:"required"`
			Level   string `json:"level"   binding:"required,oneof=error warn info debug"`
			Message string `json:"message" binding:"required"`
		}
		if err := c.ShouldBindJSON(&p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusAccepted, gin.H{"accepted": true})
	})

	tests := []struct {
		name   string
		body   map[string]any
		expect int
	}{
		{"valid", map[string]any{"service": "api", "level": "error", "message": "boom"}, 202},
		{"missing service", map[string]any{"level": "error", "message": "boom"}, 400},
		{"invalid level", map[string]any{"service": "api", "level": "trace", "message": "boom"}, 400},
		{"missing message", map[string]any{"service": "api", "level": "info"}, 400},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			b, _ := json.Marshal(tc.body)
			w := httptest.NewRecorder()
			req, _ := http.NewRequest(http.MethodPost, "/ingest", bytes.NewReader(b))
			req.Header.Set("Content-Type", "application/json")
			r.ServeHTTP(w, req)
			if w.Code != tc.expect {
				t.Errorf("expected %d got %d (body: %s)", tc.expect, w.Code, w.Body.String())
			}
		})
	}
}

// TestPaginationDefaults ensures pageLimit returns sensible defaults.
func TestPaginationDefaults(t *testing.T) {
	r := gin.New()
	r.GET("/test", func(c *gin.Context) {
		page, limit := pageLimit(c)
		c.JSON(200, gin.H{"page": page, "limit": limit})
	})

	cases := []struct{ query string; page, limit int }{
		{"", 1, 20},
		{"?page=3&limit=50", 3, 50},
		{"?page=0&limit=0", 1, 20},
		{"?page=-1&limit=200", 1, 20},
	}
	for _, tc := range cases {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodGet, "/test"+tc.query, nil)
		r.ServeHTTP(w, req)
		var resp map[string]int
		json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["page"] != tc.page || resp["limit"] != tc.limit {
			t.Errorf("query %q: expected page=%d limit=%d, got %v", tc.query, tc.page, tc.limit, resp)
		}
	}
}
