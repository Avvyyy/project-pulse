# Project Pulse - Handoff Document

This document provides a technical overview of **Project Pulse**, a full-stack observability platform similar to Sentry or Datadog. It outlines the architecture, technology stack, and structure of both the frontend and backend to facilitate onboarding and handoff.

## 🏗️ High-Level Architecture

The platform runs entirely via Docker Compose in local development and production. The core topology is:

- **Frontend**: A React single-page application served via Vite (dev) or Nginx (prod).
- **Backend**: A Go-based REST API built with the Gin framework.
- **Infrastructure**: 
  - **PostgreSQL 16**: Primary datastore for users, API keys, events, and alerts.
  - **Redis 7**: Used for caching (e.g., API keys), rate limiting, and session management.
  - **Elasticsearch 8**: Used for full-text search indexing of events.

---

## 💻 Frontend

Located in the `frontend/` directory, the frontend is a modern React application.

### Tech Stack
- **Framework**: React 18 with TypeScript.
- **Build Tool**: Vite.
- **Styling**: Tailwind CSS v4 (using the `@tailwindcss/vite` plugin).
- **State Management**: 
  - Client state: Zustand (slices located in `src/store/`).
  - Server state: TanStack Query (via custom Axios clients in `src/api/`).
- **Routing**: React Router DOM v6.
- **Data Visualization**: Recharts for metrics and frequency charts.

### Directory Structure (`frontend/src/`)
- `api/`: Axios client setup and domain-specific API calls.
- `components/`: Reusable, stateless UI components (Cards, Badges, Charts, Modals).
- `features/`: Domain-specific page components (Dashboard, Incidents, Alerts).
- `store/`: Zustand state slices (`incidentStore`, `alertStore`).
- `types/`: Shared TypeScript interfaces.
- `utils/`: Helper functions (time formatting, color constants).

---

## ⚙️ Backend (Active: Go)

Located in the `backend/` directory, the primary backend is written in Go.

### Tech Stack
- **Language**: Go 1.22.
- **Web Framework**: Gin (`gin-gonic/gin`).
- **Database Driver**: `pgx/v5` (Raw SQL queries are used exclusively; there is **no ORM**).
- **Search**: `go-elasticsearch/v8`.
- **Cache/Rate Limiting**: `go-redis/v9`.
- **Logging**: Uber's `zap` structured logger.

### Directory Structure (`backend/`)
- `cmd/server/main.go`: The entry point that wires dependencies, starts the Gin server, and spins up background schedulers.
- `internal/`:
  - `config/`: Environment variable parsing.
  - `db/`: Database connection pool and built-in SQL migration runner.
  - `middleware/`: Custom middleware (IP rate limiting, API key rate limiting, Auth guards, Audit logging).
  - `pipeline/`: Event processing stages (normalize → enrich → fingerprint → store).
  - `queue/`: In-process buffered channel worker pool for asynchronous event processing.
  - `repository/`: Data access layer for PostgreSQL (Alerts, Dashboard, Events, Incidents).
  - `scheduler/`: Background tasks (e.g., alert evaluations running on a `time.Ticker`).
- `migrations/`: Raw `.sql` migration files applied automatically on startup.

### Key Backend Concepts
1. **Event Ingestion Pipeline**: 
   - `POST /api/v1/ingest` validates JSON and pushes it to a buffered Go channel (`queue.Queue`).
   - A worker pool (concurrency=10) pulls events, normalizes them, fingerprints them (SHA-256), stores them in Postgres, and indexes them in Elasticsearch.
2. **Alert Evaluator**:
   - Runs every 60 seconds via a goroutine.
   - Evaluates active alerts based on conditions (thresholds, spikes, recurrences) and creates triggers if conditions are met.
3. **No ORM / Concurrency**: 
   - Uses parameterized `pgx` queries to avoid N+1 problems. Complex endpoints (like the dashboard) run multiple SQL queries concurrently using `errgroup`.

---

## 🚀 Running the Project

1. Copy `.env.example` to `.env`.
2. Start all services using Make and Docker Compose:
   ```bash
   make up
   ```
3. The frontend is accessible at `http://localhost:3000` and proxies `/api/*` requests to the Go backend running on port `8080`.

### Useful Commands
- `make logs`: View logs for all containers.
- `make build`: Force a rebuild of the Docker images.
- `make shell-db`: Access the PostgreSQL database shell.
- `make test`: Run Go tests inside the backend container.

---

## 📡 Usage & API Integration

Project Pulse provides a REST API to ingest and query events and incidents from your applications.

### 1. Ingesting Events (Sending to Pulse)
To send events (errors, logs, or metrics) from your system into Project Pulse, use the `/api/v1/ingest` endpoint:
```bash
curl -X POST http://localhost:8080/api/v1/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "environment": "production",
    "level": "error",
    "message": "Database connection timeout",
    "context": { "user_id": 123, "service": "billing-api" }
  }'
```

### 2. Reading Incidents & Events
To read incidents and events programmatically from your system, use the REST endpoints:

**List Incidents:**
```bash
curl -X GET http://localhost:8080/api/v1/incidents
```

**Search Events:**
```bash
curl -X GET "http://localhost:8080/api/v1/search/events?query=database"
```

Alternatively, you can navigate to the frontend application at `http://localhost:3000` to visually monitor, search, and analyze your incidents in real-time.

### 3. Integrating with Your Application (Developer Guide)

To easily send events from a real application to Project Pulse, developers typically create a utility function, a logger transport, or an error-handling middleware to abstract the API calls.

#### Example: Node.js / Express Middleware

Here is a practical example of how a developer would integrate Project Pulse into an Express backend. It includes a utility function for manual logging and a global error handler to automatically catch crashes:

```javascript
const express = require('express');
const axios = require('axios'); // Ensure axios or node-fetch is installed

const app = express();

// A utility function to send events to Project Pulse asynchronously
async function pulseLog(level, message, context = {}) {
  try {
    await axios.post('http://localhost:8080/api/v1/ingest', {
      environment: process.env.NODE_ENV || 'development',
      level: level, // 'info', 'warn', 'error', etc.
      message: message,
      context: context
    });
  } catch (err) {
    console.error("Failed to send event to Pulse:", err.message);
  }
}

// Example 1: Manual logging inside a route
app.get('/checkout', async (req, res) => {
  // Send an info event to track user actions
  pulseLog('info', 'Checkout started', { user_id: req.query.user_id });
  res.send("Checkout OK");
});

// Example 2: Automatic Global Error Handler Middleware
app.use(async (err, req, res, next) => {
  // Automatically send all application crashes to Project Pulse
  await pulseLog('error', err.message, {
    path: req.path,
    method: req.method,
    stack: err.stack
  });
  
  res.status(500).send('Internal Server Error');
});

app.listen(3001, () => console.log('App running on port 3001'));
```

For other languages (like Python, Go, or Ruby), the implementation pattern is exactly the same: wrap your application's global error handler or existing logger to make asynchronous HTTP POST requests to Project Pulse's ingest endpoint without blocking the main thread.
