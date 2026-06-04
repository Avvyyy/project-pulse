# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**project-pulse** is a full-stack application built with:
- **Backend**: Go (module `github.com/favouruzochukwu/project-pulse`)
- **Frontend**: React 18 + TypeScript + Vite
- **Database**: PostgreSQL 16 (raw SQL via `pgx/v5` — no ORM)
- **Cache**: Redis 7
- **Message queue**: Kafka (Confluent Platform 7.6, managed via Zookeeper)

Everything runs via Docker Compose. Go and Node are not required locally.

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
```

To run a single test package or function directly:

```bash
docker compose exec backend go test ./internal/application/usecase/... -run TestCreateUser -v
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
Domain  ←  Application  ←  Infrastructure
                         ←  Interfaces (HTTP)
```

No outer layer may be imported by an inner one.

### Backend layer breakdown

| Layer | Path | Responsibility |
|---|---|---|
| **Domain** | `internal/domain/` | Entities, repository interfaces, domain errors. Zero external deps. |
| **Application** | `internal/application/` | Use cases (orchestrate domain + call repository ports), DTOs. |
| **Infrastructure** | `internal/infrastructure/` | Concrete implementations: PostgreSQL repos, Redis cache, Kafka producer/consumer, Viper config. |
| **Interfaces** | `internal/interfaces/http/` | Gin handlers, middleware, router wiring. Translates HTTP ↔ application DTOs. |
| **Shared** | `pkg/` | Logger (zap), validator wrapper, HTTP response helpers. No business logic. |
| **Entry point** | `cmd/api/main.go` | Wires everything together via dependency injection (manual, no DI framework). |

### Key conventions

- **Repository pattern**: domain layer defines interfaces (`UserRepository`, etc.); infrastructure layer implements them. Use cases receive interfaces, never concrete types.
- **DTOs live in application**: request/response shapes used by handlers are defined in `internal/application/dto/`, not in handlers.
- **No ORM**: all SQL is written by hand using `pgx/v5`. Use `pgx.Row` / `pgx.Rows` and struct scanning.
- **Migrations are append-only**: never edit an existing migration file; always create a new numbered pair.
- **Structured logging**: use `pkg/logger` (wraps `go.uber.org/zap`). Never use `fmt.Println` in production paths.
- **Config via Viper + env**: all configuration is read from environment variables (mapped in `internal/infrastructure/config/`). `.env` is loaded at startup in development; in production, inject env vars directly.
- **JWT**: access tokens (15 min TTL) + refresh tokens (7 days). Secrets are separate (`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`).
- **Kafka internal listener**: within Docker Compose, services connect to Kafka on `kafka:29092` (the `PLAINTEXT_INTERNAL` listener). The `localhost:9092` address is only for external tools on the host.

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

The frontend talks to the backend at `VITE_API_BASE_URL` (defaults to `http://localhost:8080/api/v1`). Server state is managed with TanStack Query; client-only state with Zustand.

## Infrastructure topology

```
Host (browser) → Frontend :3000 → Backend :8080 → PostgreSQL :5432
                                              → Redis :6379
                                              → Kafka :9092 (host) / :29092 (internal)
```

The backend container's `POSTGRES_HOST`, `REDIS_HOST`, and `KAFKA_BROKERS` are overridden in `docker-compose.yml` to use service names (`postgres`, `redis`, `kafka:29092`) regardless of what `.env` says.
