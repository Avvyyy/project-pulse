# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**project-pulse** is a full-stack application built with:
- **Backend**: Go (module `github.com/favouruzochukwu/project-pulse`)
- **Frontend**: React 18 + TypeScript + Vite
- **Database**: PostgreSQL 16 (raw SQL via `pgx/v5` — no ORM)
- **Cache**: Redis 7
- **Message queue**: Kafka (Confluent Platform 7.6, managed via Zookeeper)

<<<<<<< Updated upstream
Everything runs via Docker Compose. Go and Node are not required locally.
=======
| Layer | Technology |
|---|---|
| Backend API | Go 1.22 + Gin |
| Database | PostgreSQL 16 via pgx/v5 (raw SQL, no ORM) |
| Cache / Queue | Redis 7 — rate limiting (go-redis) + in-process channel worker pool |
| Search | Elasticsearch 8 — event full-text search |
| Scheduler | time.Ticker goroutine — alert evaluation every 60 s |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS v4 |
| CSS | Tailwind v4 via `@tailwindcss/vite` plugin — no PostCSS config needed |
| State mgmt | Zustand |
| Charts | Recharts |

Everything runs via Docker Compose from a single root `Dockerfile`. Neither Go nor Node is required locally.

---
>>>>>>> Stashed changes

## Commands

All day-to-day operations go through the root `Makefile`. The Makefile sources `.env` automatically — copy `.env.example` to `.env` before running anything.

```bash
cp .env.example .env

make up              # start all services (postgres, redis, kafka, backend, frontend)
make down            # stop all services
make build           # rebuild images from scratch
make logs            # tail all logs
make logs-backend    # tail backend only
make ps              # container status
```

<<<<<<< Updated upstream
### Database migrations

Migrations live in `backend/migrations/` as numbered `.sql` files managed by `golang-migrate`.

```bash
make migrate-up                        # apply all pending migrations
make migrate-down                      # roll back one migration
make migrate-create name=create_users  # scaffold a new migration pair
```

### Testing & linting (run inside the backend container)

```bash
make test        # go test ./... -v -race with coverage output
make test-cover  # open HTML coverage report
make lint        # golangci-lint run ./...
=======
### Database / Migrations

SQL migrations live in `backend/migrations/` (numbered `001_initial.sql`, etc.).
They are applied automatically at server startup by the built-in migration runner.
No ORM — all queries are hand-written pgx/v5.

```bash
make migrate-down   # drop + recreate public schema (dev only — destructive!)
make shell-db       # psql into pulse_db
```

### Testing & Linting

```bash
make test        # go test ./... (inside backend container)
make test-cover  # go test -cover ./...
make lint        # go vet ./...
>>>>>>> Stashed changes
```

To run a single test package or function directly:

```bash
<<<<<<< Updated upstream
docker compose exec backend go test ./internal/application/usecase/... -run TestCreateUser -v
=======
make shell-backend   # sh inside the Go container
make shell-frontend  # sh inside the Vite container
make shell-db        # psql into pulse_db
make redis-cli       # redis-cli session
make es-health       # curl Elasticsearch cluster health
>>>>>>> Stashed changes
```

### Utility shells

```bash
make shell-backend  # sh inside the Go container
make shell-db       # psql into pulse_db
make redis-cli      # redis-cli session
```

### Production

```bash
make prod-up    # docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
make prod-down
```

## Architecture

The backend follows **Clean Architecture** with a strict one-way dependency rule:

```
<<<<<<< Updated upstream
Domain  ←  Application  ←  Infrastructure
                         ←  Interfaces (HTTP)
=======
Browser
  └─► Vite dev server :3000 (/api/* proxied to backend:8080)
        └─► Gin :8080
              ├─► IPRateLimit middleware (300 req/min per IP, Redis)
              ├─► APIKeyAuth middleware (SHA-256 hash → Redis cache → Postgres)
              │     └─► Brute-force lockout (20 failures / 5 min per IP)
              ├─► KeyRateLimit middleware (per API key, 60 s window)
              ├─► AdminAuth middleware (timing-safe X-Admin-Secret check)
              ├─► Audit middleware (POST/PATCH/DELETE → structured zap log)
              └─► Route handler
>>>>>>> Stashed changes
```

No outer layer may be imported by an inner one.

<<<<<<< Updated upstream
### Backend layer breakdown

| Layer | Path | Responsibility |
|---|---|---|
| **Domain** | `internal/domain/` | Entities, repository interfaces, domain errors. Zero external deps. |
| **Application** | `internal/application/` | Use cases (orchestrate domain + call repository ports), DTOs. |
| **Infrastructure** | `internal/infrastructure/` | Concrete implementations: PostgreSQL repos, Redis cache, Kafka producer/consumer, Viper config. |
| **Interfaces** | `internal/interfaces/http/` | Gin handlers, middleware, router wiring. Translates HTTP ↔ application DTOs. |
| **Shared** | `pkg/` | Logger (zap), validator wrapper, HTTP response helpers. No business logic. |
| **Entry point** | `cmd/api/main.go` | Wires everything together via dependency injection (manual, no DI framework). |
=======
```
POST /api/v1/ingest  (X-Api-Key)
  → IngestHandler (validates JSON)
  → queue.Queue   (buffered channel, capacity=1000)
  → HTTP 202 Accepted

channel worker pool (concurrency=10)
  → normalize    — lowercase service, truncate message to 5000 chars
  → enrich       — severityScore, timestamps, tags
  → fingerprint  — SHA-256(service:level:normalised_message)
  → store        — pgx UpsertErrorGroup (ON CONFLICT atomic) + CreateEvent
  → index        — ES IndexEvent + IndexGroup (goroutine, non-blocking)
```
>>>>>>> Stashed changes

### Key conventions

<<<<<<< Updated upstream
- **Repository pattern**: domain layer defines interfaces (`UserRepository`, etc.); infrastructure layer implements them. Use cases receive interfaces, never concrete types.
- **DTOs live in application**: request/response shapes used by handlers are defined in `internal/application/dto/`, not in handlers.
- **No ORM**: all SQL is written by hand using `pgx/v5`. Use `pgx.Row` / `pgx.Rows` and struct scanning.
- **Migrations are append-only**: never edit an existing migration file; always create a new numbered pair.
- **Structured logging**: use `pkg/logger` (wraps `go.uber.org/zap`). Never use `fmt.Println` in production paths.
- **Config via Viper + env**: all configuration is read from environment variables (mapped in `internal/infrastructure/config/`). `.env` is loaded at startup in development; in production, inject env vars directly.
- **JWT**: access tokens (15 min TTL) + refresh tokens (7 days). Secrets are separate (`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`).
- **Kafka internal listener**: within Docker Compose, services connect to Kafka on `kafka:29092` (the `PLAINTEXT_INTERNAL` listener). The `localhost:9092` address is only for external tools on the host.
=======
```
time.Ticker(60s)  AlertEvaluator.evaluateAll()
  → GetActiveAlerts (single LATERAL JOIN query, no N+1)
  → for each alert: dispatch by condition.type
      threshold      → COUNT(events) in window vs threshold
      spike          → current window / baseline window ≥ multiplier
      recurrence     → error groups seen >1× in last N minutes
      new_error_group → error groups created since last trigger
  → if condition met  && no open trigger  → create AlertTrigger
  → if condition clear && open trigger    → auto-resolve (set resolvedAt)
```

### Module layout

```
backend/
  cmd/server/main.go          # Entry point: wires all deps, starts server + scheduler
  internal/
    config/config.go           # Typed config from env vars
    db/db.go                   # pgx pool + SQL migration runner
    redis/redis.go             # Redis client (rate limit, auth cache)
    search/client.go           # Elasticsearch client (index, search)
    models/models.go           # All data types + pagination generics
    repository/
      api_key.go               # CRUD for API keys
      event.go                 # CreateEvent + UpsertErrorGroup (atomic ON CONFLICT)
      incident.go              # Incident CRUD, timeline, error-group linking, frequency
      alert.go                 # Alert CRUD, triggers, scheduler helpers
      dashboard.go             # All KPIs via 6 concurrent SQL queries (errgroup)
    queue/queue.go             # Buffered channel worker pool (capacity=1000, concurrency=10)
    pipeline/pipeline.go       # normalize → enrich → fingerprint → store stages
    middleware/middleware.go   # IPRateLimit, APIKeyAuth, KeyRateLimit, AdminAuth, Audit
    handler/
      ingest.go                # POST /ingest
      api_keys.go              # /admin/api-keys
      incidents.go             # /incidents + sub-resources
      alerts.go                # /alerts + triggers
      dashboard.go             # /dashboard
      health.go                # /health
      search.go                # /search/events|groups
    scheduler/evaluator.go     # Alert evaluation every 60 s (time.Ticker goroutine)
    server/server.go           # Gin engine + all routes registered
  migrations/001_initial.sql   # Full schema (applied once at startup)
```
>>>>>>> Stashed changes

### Frontend structure

```
frontend/src/
  api/        # axios client + typed endpoint functions
  components/ # reusable UI components
  features/   # feature-sliced modules (each owns its own components, hooks, types)
  hooks/      # shared custom hooks
  store/      # Zustand slices
  types/      # shared TypeScript types
  utils/      # pure utility functions
```

<<<<<<< Updated upstream
The frontend talks to the backend at `VITE_API_BASE_URL` (defaults to `http://localhost:8080/api/v1`). Server state is managed with TanStack Query; client-only state with Zustand.
=======
### Frontend routes

| Path | Page |
|---|---|
| `/` | → redirect to `/dashboard` |
| `/dashboard` | Analytics dashboard (auto-refreshes every 60 s) |
| `/incidents` | Incident list with create modal |
| `/incidents/:id` | Incident detail — timeline, frequency chart, linked errors |
| `/alerts` | Alert rules list with create modal |
| `/alerts/:id` | Alert detail — condition, trigger history, edit modal |

---

## Key conventions

- **No ORM, no N+1**: All queries are hand-written pgx/v5. List endpoints with relations use JOINs or CTEs. The dashboard runs 6 queries concurrently via `errgroup`. Never fetch N items then loop with individual queries.
- **Paginated responses**: use `COUNT(*) OVER()` window function or correlated subqueries to return total in the same query as results.
- **API keys**: `pk_<64 hex>`. SHA-256 hashed at rest. Redis-cached 5 min. Full key shown once at creation.
- **Admin routes**: require `X-Admin-Secret` header (constant-time comparison via `crypto/subtle`).
- **Rate limits**: two layers — IP (300 req/min, Redis INCR) and per-API-key (configurable, default 1 000 req/min).
- **Ingestion queue**: non-persistent buffered Go channel, concurrency=10. If the buffer is full, the request gets 503 (fail fast, don't block HTTP).
- **Alert evaluator**: uses `LastTriggerAt` from the DB (not in-memory state) so it survives restarts.
- **Tailwind**: v4 — custom colours defined in `src/index.css` under `@theme`. No `tailwind.config.js`.
- **Font**: whole app uses monospace — set on `html, body` in `@layer base`.

---
>>>>>>> Stashed changes

## Infrastructure topology

```
<<<<<<< Updated upstream
Host (browser) → Frontend :3000 → Backend :8080 → PostgreSQL :5432
                                              → Redis :6379
                                              → Kafka :9092 (host) / :29092 (internal)
```

The backend container's `POSTGRES_HOST`, `REDIS_HOST`, and `KAFKA_BROKERS` are overridden in `docker-compose.yml` to use service names (`postgres`, `redis`, `kafka:29092`) regardless of what `.env` says.
=======
Production:
  Internet → nginx :80/:443
               ├─► /api/* → NestJS :8080 → PostgreSQL :5432
               │                        → Redis     :6379
               │                        → Elasticsearch :9200
               └─► /*     → React SPA (static files)

Development (Docker Compose):
  Browser → Vite :3000 (/api/* proxied) → Gin :8080
                                        → PostgreSQL :5432
                                        → Redis     :6379
                                        → Elasticsearch :9200
```

Docker Compose overrides `DATABASE_URL`, `REDIS_HOST`, and `ELASTICSEARCH_URL` to use Docker service names regardless of `.env`.

---

## Docker

Single root `Dockerfile` with 7 named stages:

| Stage | Purpose |
|---|---|
| `backend-base` | `go mod tidy + download` — layer-cached dep fetch |
| `backend-dev` | `go run ./cmd/server` — dev server (no hot-reload; restart container) |
| `backend-builder` | `CGO_ENABLED=0 go build` — static binary |
| `backend-prod` | Alpine + binary + migrations dir |
| `frontend-base` | `npm install` for frontend |
| `frontend-dev` | Vite dev server |
| `frontend-builder` | `npm run build` (Vite static output) |
| `frontend-prod` | nginx serving static files + `/api/*` proxy |

```bash
# Development
make up       # docker compose up -d (targets: backend-dev, frontend-dev)

# Production
make prod-up  # docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
              # (targets: backend-prod, frontend-prod)
```

---

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on push to `main`/`develop`:

1. **backend** job — `go mod tidy` → `go vet ./...` → `go test ./...` (with Postgres + Redis services)
2. **frontend** job — `npm ci` → `tsc --noEmit` → `vite build`
3. **docker** job (main branch only) — builds and pushes `backend-prod` + `frontend-prod` images to GitHub Container Registry

---

## Security notes

- `ADMIN_SECRET` must not be the placeholder in `APP_ENV=production` (startup exits if so).
- API key brute-force: 20 failed attempts per IP per 5-min window → 15-min lockout (Redis keys).
- IP rate limit: 300 req/min per IP (Gin middleware, before all guards).
- Admin guard uses `crypto/subtle.ConstantTimeCompare` with byte padding against timing attacks.
- All pgx queries use `$N` parameterised placeholders — no SQL injection surface.
- Audit log: every POST/PATCH/DELETE is logged with method, path, status, latency, IP (zap structured).
>>>>>>> Stashed changes
