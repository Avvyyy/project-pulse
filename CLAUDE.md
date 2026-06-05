# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**project-pulse** is a full-stack observability platform (Sentry + Datadog–style) built with:

| Layer | Technology |
|---|---|
| Backend API | NestJS 10 + TypeScript |
| Database | PostgreSQL 16 via Prisma ORM (no raw SQL except aggregations) |
| Cache / Queue | Redis 7 — rate limiting (ioredis) + job queues (BullMQ) |
| Search | Elasticsearch 8 — event full-text search + ILM |
| Scheduler | @nestjs/schedule — alert evaluation every 60 s |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS v4 |
| CSS | Tailwind v4 via `@tailwindcss/vite` plugin — no PostCSS config needed |
| State mgmt | Zustand |
| Charts | Recharts |

Everything runs via Docker Compose from a single root `Dockerfile`. Node is **not** required locally.

---

## Commands

Copy `.env.example` → `.env` before running anything.

```bash
cp .env.example .env

make up              # start all services (dev)
make down            # stop all services
make build           # rebuild images from scratch (use after adding npm packages)
make logs            # tail all logs
make logs-backend    # tail backend only
make ps              # container status
make api-health      # curl /api/v1/health
```

### Database / Prisma

```bash
make migrate-create name=add_index   # scaffold a new migration
make migrate-up                      # apply pending migrations
make migrate-down                    # reset DB (dev only)
make prisma-generate                 # regenerate Prisma client after schema change
make prisma-studio                   # open Prisma Studio on :5555
```

Schema: `backend/prisma/schema.prisma`. Migrations: `backend/prisma/migrations/`.

### Testing & Linting

```bash
make test        # jest (inside backend container)
make test-cover  # jest --coverage
make lint        # eslint

# Single test file:
docker compose exec backend npm run test -- --testPathPattern=alerts
```

### Utilities

```bash
make shell-backend   # sh inside the NestJS container
make shell-frontend  # sh inside the Vite container
make shell-db        # psql into pulse_db
make redis-cli       # redis-cli session
make es-health       # curl Elasticsearch cluster health
```

---

## Architecture

### Request flow

```
Browser
  └─► Vite dev server :3000 (/api/* proxied to backend:8080)
        └─► NestJS :8080
              ├─► IP rate-limit middleware (300 req/min per IP, Redis)
              ├─► ApiKeyGuard (SHA-256 hash → Redis cache → Postgres)
              │     └─► Brute-force lockout (20 failures / 5 min per IP)
              ├─► RateLimitGuard (per API key, fixed 60 s window)
              ├─► ValidationPipe (whitelist + forbidNonWhitelisted)
              ├─► AuditInterceptor (POST/PATCH/DELETE → structured log)
              └─► Route handler
```

### Event ingestion pipeline

```
POST /api/v1/ingest  (X-Api-Key)
  → EventsController (validates DTO)
  → EventsProducer   (BullMQ queue "event-ingestion")
  → HTTP 202 Accepted

BullMQ worker (EventsProcessor, concurrency=10)
  → NormalizationStage  — lowercase, PII strip, field length caps
  → EnrichmentStage     — errorType, severityScore, httpStatusCode, tags, parsedStack
  → FingerprintStage    — SHA-256(service:level:normalised_message)
  → RoutingStage        — drop stale/future events; choose postgres + ES destinations
  → StorageService      — prisma.event.create + ErrorGroup upsert (ON CONFLICT atomic)
  → SearchService       — ES bulk index (events + error_groups indices)
```

### Alert evaluation loop

```
@Cron(EVERY_MINUTE)  AlertEvaluatorService.evaluateAll()
  → fetch all isActive=true alerts
  → for each: dispatch by condition.type
      threshold      → COUNT(events) in window vs threshold
      spike          → current window / baseline window ≥ multiplier
      recurrence     → open ErrorGroups seen >1× in last N minutes
      new_error_group → ErrorGroups created since last check (in-memory timestamp)
  → if condition met  && no open trigger  → create AlertTrigger
  → if condition clear && open trigger    → auto-resolve (set resolvedAt)
```

### Module layout

```
backend/src/
  config/              # Typed config via @nestjs/config
  common/
    filters/           # HttpExceptionFilter — uniform { success, error } envelope
    guards/            # ApiKeyGuard, RateLimitGuard, AdminGuard (timing-safe)
    interceptors/      # IngestionLoggerInterceptor, AuditInterceptor
  prisma/              # @Global PrismaModule + PrismaService
  redis/               # @Global RedisModule + RedisService
                       #   → checkRateLimit, checkIpRateLimit,
                       #   → cacheApiKey, recordFailedAuth, isAuthBlocked
  search/              # @Global SearchModule + SearchService (ES index + ILM)
  storage/             # StorageService — event + error-group persistence
  pipeline/            # 4-stage processing pipeline (normalise → enrich → fingerprint → route)
  events/              # Ingestion controller + BullMQ producer/processor
  api-keys/            # Admin CRUD: POST/GET/DELETE /admin/api-keys
  query/               # Search endpoints: GET /search/events|groups (Elasticsearch)
  incidents/           # Incident CRUD + timeline + error-group linking + frequency chart
  alerts/              # Alert rules CRUD + AlertEvaluatorService (scheduler)
  dashboard/           # Single GET /dashboard?period=24h|7d|30d — all KPIs in one call
  health/              # GET /health — Postgres + Redis + ES liveness
```

### Frontend structure

```
frontend/src/
  api/          # axios client (/api/v1 base) + typed functions per domain
  components/   # Reusable UI: Card, NavBar, KpiCard, VolumeChart,
                #   StatusBadge, SeverityBadge, AlertStateBadge,
                #   IncidentTimeline, RelatedErrors, FrequencyChart,
                #   AffectedServices, ConditionSummary, ConditionBuilder,
                #   TriggerHistory, PageState
  features/
    dashboard/  # DashboardPage — KPI cards, volume chart, service health,
                #   top error groups, incident summary, top error types
    incidents/  # IncidentListPage, IncidentDetailPage
    alerts/     # AlertListPage, AlertDetailPage
  store/        # Zustand slices: incidentStore, alertStore
  types/        # Shared TypeScript types (Incident, Alert, AlertCondition…)
  utils/        # time.ts (relativeTime, formatDateTime…), colors.ts (LEVEL_HEX…)
```

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

- **No raw SQL** except Prisma `$queryRaw` for aggregations (`date_trunc`, `COUNT FILTER`). All `$queryRaw` calls use `Prisma.sql` tagged templates — never string concatenation.
- **Global modules**: `PrismaModule`, `RedisModule`, `SearchModule` are `@Global()`. Import once in `AppModule`; inject everywhere.
- **Guards & DI**: guards must be listed in the `providers` array of the module where they're used.
- **DTOs**: `class-validator` decorators + global `ValidationPipe(whitelist: true, forbidNonWhitelisted: true)`.
- **API keys**: `pk_<64 hex>`. SHA-256 hashed at rest. Redis-cached 5 min. Full key shown once at creation.
- **Admin routes**: require `X-Admin-Secret` header (timing-safe comparison via `timingSafeEqual`).
- **Rate limits**: two layers — IP (300 req/min via middleware) and per-API-key (configurable, default 1 000 req/min).
- **Tailwind**: v4 — custom colours defined in `src/index.css` under `@theme`. No `tailwind.config.js`.
- **Font**: whole app uses monospace — set on `html, body` in `@layer base`.

---

## Infrastructure topology

```
Production:
  Internet → nginx :80/:443
               ├─► /api/* → NestJS :8080 → PostgreSQL :5432
               │                        → Redis     :6379
               │                        → Elasticsearch :9200
               └─► /*     → React SPA (static files)

Development (Docker Compose):
  Browser → Vite :3000 (/api/* proxied) → NestJS :8080
                                        → PostgreSQL :5432
                                        → Redis     :6379
                                        → Elasticsearch :9200
```

Docker Compose overrides `DATABASE_URL`, `REDIS_HOST`, and `ELASTICSEARCH_URL` to use Docker service names regardless of `.env`.

---

## Docker

Single root `Dockerfile` with 8 named stages:

| Stage | Purpose |
|---|---|
| `backend-base` | `npm ci` for backend |
| `backend-dev` | dev server with hot-reload (`nest start --watch`) |
| `backend-builder` | production build |
| `backend-prod` | minimal node image, runs `node dist/main` |
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

1. **backend** job — `npm ci` → Prisma generate + migrate → lint → test (with Postgres + Redis services)
2. **frontend** job — `npm ci` → `tsc --noEmit` → `vite build`
3. **docker** job (main branch only) — builds and pushes `backend-prod` + `frontend-prod` images to GitHub Container Registry

---

## Security notes

- `ADMIN_SECRET` must not be the placeholder in `APP_ENV=production` (startup throws if so).
- API key brute-force: 20 failed attempts per IP per 5-min window → 15-min lockout.
- IP rate limit: 300 req/min per IP (Express middleware, before all guards).
- Admin guard uses constant-time comparison (`timingSafeEqual` with padding) against timing attacks.
- `ValidationPipe(whitelist: true)` strips and rejects unknown request fields.
- All `$queryRaw` queries use Prisma parameterised templates — no SQL injection surface.
- Audit log: every POST/PATCH/DELETE is logged with method, path, status, latency, IP, actor.
