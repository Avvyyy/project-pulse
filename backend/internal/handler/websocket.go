package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/avvyyy/project-pulse/internal/broadcast"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

type WebSocketHandler struct {
	broadcaster *broadcast.Broadcaster
	log         *zap.Logger
}

func NewWebSocketHandler(broadcaster *broadcast.Broadcaster, log *zap.Logger) *WebSocketHandler {
	return &WebSocketHandler{broadcaster: broadcaster, log: log}
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins (CORS handled elsewhere)
	},
}

func (h *WebSocketHandler) Connect(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		h.log.Error("websocket upgrade", zap.Error(err))
		return
	}
	defer conn.Close()

	subID := uuid.New().String()
	sub := h.broadcaster.Subscribe(subID)
	defer h.broadcaster.Unsubscribe(subID)

	h.log.Debug("ws client connected", zap.String("id", subID))

	// Send welcome message
	_ = conn.WriteJSON(map[string]any{
		"type": "connected",
		"id":   subID,
	})

	// Read from broadcaster and send to client
	for {
		select {
		case e := <-sub.Ch:
			// Marshal and send event to WebSocket client
			if err := conn.WriteJSON(map[string]any{
				"type":      e.Type,
				"service":   e.Service,
				"level":     e.Level,
				"message":   e.Message,
				"timestamp": e.Timestamp,
				"eventId":   e.EventID,
				"groupId":   e.GroupID,
			}); err != nil {
				h.log.Debug("ws write error", zap.Error(err))
				return
			}
		}
	}
}

// Health check ping handler (optional, for testing)
func (h *WebSocketHandler) Ping(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "pong", "timestamp": time.Now().Format(time.RFC3339)})
}
