# ─────────────────────────────────────────────────────────────────────────────
# Backend (Go + Gin)
# ─────────────────────────────────────────────────────────────────────────────

FROM golang:1.22-alpine AS backend-base
RUN apk add --no-cache git ca-certificates
WORKDIR /app
COPY backend/ .
RUN go mod tidy && go mod download

FROM backend-base AS backend-dev
EXPOSE 8080
CMD ["go", "run", "./cmd/server"]

FROM backend-base AS backend-builder
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server

FROM alpine:3.20 AS backend-prod
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=backend-builder /server ./server
COPY backend/migrations ./migrations
EXPOSE 8080
CMD ["./server"]

# ─────────────────────────────────────────────────────────────────────────────
# Frontend (React + Vite)
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS frontend-base
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install

FROM frontend-base AS frontend-dev
COPY frontend/ .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM frontend-base AS frontend-builder
COPY frontend/ .
RUN npm run build

FROM nginx:alpine AS frontend-prod
COPY --from=frontend-builder /app/dist       /usr/share/nginx/html
COPY frontend/nginx/default.conf             /etc/nginx/conf.d/default.conf
EXPOSE 80
