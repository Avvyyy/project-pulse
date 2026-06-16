# Project Pulse

Project Pulse is a high-performance analytics and error tracking system. It enables ingesting large volumes of events, tracks errors, and provides a real-time dashboard for service health, incidents, and alerts.

## Architecture

The project is split into two primary components:
- **Backend (Go)**: A high-throughput ingest pipeline, API server, and task processor built in Go. It uses Redis for rate-limiting, deduplication, and buffering, and PostgreSQL for long-term storage of events, incidents, alerts, and user data.
- **Frontend (React / Vite)**: A responsive, dark-mode focused UI built with React, Vite, TailwindCSS, and Zustand for state management. It displays real-time metrics, error groups, incident tracking, and API key management.

## Features

- **Authentication**: JWT-based authentication using HTTP-only cookies and refresh tokens for secure access to the dashboard.
- **API Key Management**: Create and revoke API keys with individual rate limits to authenticate telemetry ingest requests.
- **High-Throughput Ingestion**: Events are validated and buffered in Redis before being batch-inserted into PostgreSQL.
- **Deduplication & Error Tracking**: Repeated errors are grouped together intelligently using a sliding window.
- **Real-time Dashboards**: Track Open Incidents, Event Volumes, and Service Health over 24h, 7d, and 30d periods.
- **Alerting Engine**: Configurable thresholds to trigger alerts when error rates spike.

## Getting Started

### Prerequisites
- Docker and Docker Compose
- Go 1.22+ (for local development)
- Node.js 20+ (for local frontend development)

### Running with Docker Compose

1. Clone the repository and navigate to the project directory.
2. Start the services using Docker Compose:
   ```bash
   docker-compose up --build
   ```
3. The application will be available at:
   - Frontend: `http://localhost:3000`
   - Backend API: `http://localhost:8080`

### Test Credentials
A default test user is seeded in the development environment on startup:
- **Email**: `test@example.com`
- **Password**: `password123`

### Ingesting Events
You can generate API keys from the Dashboard, and use them to send events to the `/api/v1/ingest` endpoint:
```bash
curl -X POST http://localhost:8080/api/v1/ingest \
  -H "X-Api-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "api-gateway",
    "level": "error",
    "message": "Connection timeout to database",
    "timestamp": "2026-06-15T12:00:00Z"
  }'
```

## Integrating with Your Application (Developer Guide)

To easily send events from a real application to Project Pulse, developers typically create a utility function, a logger transport, or an error-handling middleware to abstract the API calls.

### Example: Node.js / Express Middleware

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
    }, {
      headers: {
        'X-Api-Key': 'YOUR_API_KEY'
      }
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

## Development

### Backend
- Navigate to the `backend/` directory.
- Use `make run` or `go run cmd/server/main.go` to start the backend.
- Ensure Redis and Postgres are running locally.

### Frontend
- Navigate to the `frontend/` directory.
- Install dependencies with `npm install`.
- Start the Vite dev server with `npm run dev`.

## License
MIT License.
