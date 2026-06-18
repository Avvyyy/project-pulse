.PHONY: up down build logs logs-backend ps migrate-up migrate-down \
        test lint clean shell-backend shell-frontend shell-db \
        redis-cli es-health api-health prod-up prod-down help

# ── Variables ──────────────────────────────────────────────────────────────
COMPOSE      = docker compose
COMPOSE_PROD = docker compose -f docker-compose.yml -f docker-compose.prod.yml
BACKEND_C    = pulse_backend

include .env
export

# ── Dev lifecycle ──────────────────────────────────────────────────────────
up:            ## Start all services (dev)
	$(COMPOSE) up -d

down:          ## Stop all services
	$(COMPOSE) down

build:         ## Rebuild images from scratch
	$(COMPOSE) build --no-cache

logs:          ## Follow logs (all services)
	$(COMPOSE) logs -f

logs-backend:  ## Follow backend logs
	$(COMPOSE) logs -f backend

ps:            ## Show running containers
	$(COMPOSE) ps

# ── Database ───────────────────────────────────────────────────────────────
# Migrations are applied automatically at startup via the Go migration runner.
# Use these targets to inspect the DB.

migrate-up:    ## Apply migrations (runs inside backend; useful after schema changes)
	$(COMPOSE) exec backend go run ./cmd/server -migrate-only 2>/dev/null || \
	    echo "Migrations are applied automatically at server startup"

migrate-down:  ## Reset the database (dev only — drops all data!)
	$(COMPOSE) exec postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) \
	    -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# ── Testing & Linting ─────────────────────────────────────────────────────
test:          ## Run backend tests
	$(COMPOSE) exec backend go test ./...

test-cover:    ## Run tests with coverage
	$(COMPOSE) exec backend go test -cover ./...

lint:          ## Run go vet
	$(COMPOSE) exec backend go vet ./...

# ── Production ────────────────────────────────────────────────────────────
prod-build:    ## Rebuild images from scratch
	$(COMPOSE_PROD) build --no-cache

prod-up:       ## Start production stack
	$(COMPOSE_PROD) up -d

prod-down:     ## Stop production stack
	$(COMPOSE_PROD) down

prod-logs:       ## Follow logs (all prod services)
	$(COMPOSE_PROD) logs -f

prod-logs-backend: ## Follow backend logs (prod)
	$(COMPOSE_PROD) logs -f backend


# ── Utilities ─────────────────────────────────────────────────────────────
clean:         ## Remove containers and volumes
	$(COMPOSE) down -v --rmi local

shell-backend: ## Open shell in backend container
	$(COMPOSE) exec backend sh

shell-frontend: ## Open shell in frontend container
	$(COMPOSE) exec frontend sh

shell-db:      ## Open psql in postgres container
	$(COMPOSE) exec postgres psql -U $(POSTGRES_USER) $(POSTGRES_DB)

redis-cli:     ## Open redis-cli
	$(COMPOSE) exec redis redis-cli

es-health:     ## Check Elasticsearch cluster health
	curl -s http://localhost:9200/_cluster/health | jq .

api-health:    ## Check backend API health
	curl -s http://localhost:8080/api/v1/health | jq .

help:          ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-22s\033[0m %s\n", $$1, $$2}'
