.PHONY: up down build logs ps migrate seed test lint clean help

# ── Variables ──────────────────────────────────────────────────────────────
COMPOSE        = docker compose
COMPOSE_PROD   = docker compose -f docker-compose.yml -f docker-compose.prod.yml
BACKEND_C      = pulse_backend
MIGRATE_DIR    = ./backend/migrations
DB_URL         = postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:$(POSTGRES_PORT)/$(POSTGRES_DB)?sslmode=disable

include .env
export

# ── Dev lifecycle ──────────────────────────────────────────────────────────
up:            ## Start all services (dev)
	$(COMPOSE) up -d

down:          ## Stop all services
	$(COMPOSE) down

build:         ## Rebuild images
	$(COMPOSE) build --no-cache

logs:          ## Follow logs (all services)
	$(COMPOSE) logs -f

logs-backend:  ## Follow backend logs
	$(COMPOSE) logs -f backend

ps:            ## Show running containers
	$(COMPOSE) ps

# ── Database migrations ────────────────────────────────────────────────────
migrate-up:    ## Run all pending migrations
	$(COMPOSE) exec backend migrate -path /app/migrations -database "$(DB_URL)" up

migrate-down:  ## Roll back the last migration
	$(COMPOSE) exec backend migrate -path /app/migrations -database "$(DB_URL)" down 1

migrate-create: ## Create a new migration: make migrate-create name=create_users
	$(COMPOSE) exec backend migrate create -ext sql -dir /app/migrations -seq $(name)

# ── Testing ────────────────────────────────────────────────────────────────
test:          ## Run backend tests
	$(COMPOSE) exec backend go test ./... -v -race -coverprofile=coverage.out

test-cover:    ## Show coverage report in browser
	$(COMPOSE) exec backend go tool cover -html=coverage.out

# ── Linting ────────────────────────────────────────────────────────────────
lint:          ## Run golangci-lint
	$(COMPOSE) exec backend golangci-lint run ./...

# ── Production ────────────────────────────────────────────────────────────
prod-up:       ## Start all services (prod)
	$(COMPOSE_PROD) up -d

prod-down:     ## Stop prod services
	$(COMPOSE_PROD) down

# ── Utilities ─────────────────────────────────────────────────────────────
clean:         ## Remove containers, volumes, and images
	$(COMPOSE) down -v --rmi local

shell-backend: ## Open shell in backend container
	$(COMPOSE) exec backend sh

shell-db:      ## Open psql in postgres container
	$(COMPOSE) exec postgres psql -U $(POSTGRES_USER) $(POSTGRES_DB)

redis-cli:     ## Open redis-cli
	$(COMPOSE) exec redis redis-cli

help:          ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
