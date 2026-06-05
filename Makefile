.PHONY: up down build logs ps migrate-up migrate-down migrate-create prisma-studio prisma-generate test test-cover lint clean shell-backend shell-db redis-cli es-health prod-up prod-down help

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

build:         ## Rebuild images
	$(COMPOSE) build --no-cache

logs:          ## Follow logs (all services)
	$(COMPOSE) logs -f

logs-backend:  ## Follow backend logs
	$(COMPOSE) logs -f backend

ps:            ## Show running containers
	$(COMPOSE) ps

# ── Prisma / Database ──────────────────────────────────────────────────────
migrate-up:    ## Apply all pending Prisma migrations
	$(COMPOSE) exec backend npx prisma migrate deploy

migrate-down:  ## Revert the last migration (dev only)
	$(COMPOSE) exec backend npx prisma migrate reset --skip-seed --force

migrate-create: ## Create a new migration: make migrate-create name=add_index
	$(COMPOSE) exec backend npx prisma migrate dev --name $(name)

prisma-generate: ## Regenerate Prisma client (after schema change)
	$(COMPOSE) exec backend npx prisma generate

prisma-studio: ## Open Prisma Studio (http://localhost:5555)
	$(COMPOSE) exec backend npx prisma studio --port 5555 --browser none

# ── Testing & Linting ─────────────────────────────────────────────────────
test:          ## Run backend tests
	$(COMPOSE) exec backend npm run test

test-cover:    ## Run tests with coverage
	$(COMPOSE) exec backend npm run test:cov

lint:          ## Run ESLint
	$(COMPOSE) exec backend npm run lint

# ── Production ────────────────────────────────────────────────────────────
prod-up:       ## Start production stack
	$(COMPOSE_PROD) up -d

prod-down:     ## Stop production stack
	$(COMPOSE_PROD) down

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
