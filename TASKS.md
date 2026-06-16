# Project Pulse - Implementation Tasks

## 🚀 Phase 1: Real-Time Event Broadcasting (Backend)

### Task 1.1: WebSocket Server Setup
- [ ] Add WebSocket upgrade handler to Gin server
- [ ] Create event broadcaster service (pub/sub pattern)
- [ ] Implement client connection management (connect/disconnect)
- Location: `backend/internal/server/server.go` + new `backend/internal/broadcast/broadcast.go`
- Status: **PENDING**

### Task 1.2: Broadcast Event on Ingest
- [ ] Modify pipeline to publish events to broadcaster after storage
- [ ] Include service, level, timestamp in broadcast payload
- Location: `backend/internal/pipeline/pipeline.go`
- Status: **PENDING**

### Task 1.3: Search/List Events by Error Group
- [ ] Add `GET /api/v1/error-groups/:id/events` endpoint
- [ ] Query events linked to an error group with pagination
- [ ] Include timestamps and severity
- Location: `backend/internal/handler/` (new file or extend existing)
- Status: **PENDING**

---

## 🎨 Phase 2: Dashboard Enhancements (Frontend)

### Task 2.1: Error Groups with Accordion
- [ ] Update dashboard to show expandable error groups
- [ ] Fetch events for clicked error group
- [ ] Display individual events with timestamps in accordion
- [ ] Show severity, level, and message for each event
- Location: `frontend/src/features/dashboard/DashboardPage.tsx` + new component
- Status: **PENDING**

### Task 2.2: WebSocket Client Connection
- [ ] Create WebSocket client hook (`useEventBroadcast`)
- [ ] Auto-connect on dashboard mount
- [ ] Listen for new events/error groups
- [ ] Auto-refresh dashboard when new events arrive
- Location: `frontend/src/api/websocket.ts` (new) + `frontend/src/hooks/` (new)
- Status: **PENDING**

### Task 2.3: Display Event Timestamps
- [ ] Format and display timestamps for each event
- [ ] Show relative time (e.g., "2 minutes ago")
- [ ] Include absolute time on hover or secondary display
- Location: Component rendering + `frontend/src/utils/time.ts`
- Status: **PENDING**

---

## 🔗 Phase 3: Incident Auto-Linking (Optional Enhancement)

### Task 3.1: Auto-Link Events to Incidents
- [ ] Create background job to link events to incidents based on service/level match
- [ ] OR provide one-click "link all errors from this group to incident" button
- [ ] Display linked events on incident detail page
- Location: `backend/internal/scheduler/` or new handler
- Status: **PENDING** (OPTIONAL)

---

## ✅ Status Summary
- **Phase 1:** Backend WebSocket + real-time broadcasting
- **Phase 2:** Frontend dashboard enhancements + auto-refresh
- **Phase 3:** Incident linking (optional if time allows)

---
