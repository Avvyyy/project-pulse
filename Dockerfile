# ─────────────────────────────────────────────────────────────────────────────
# Backend
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS backend-base
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci

FROM backend-base AS backend-dev
# Generate Prisma client before the volume mount shadows the source tree.
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/ .
EXPOSE 8080
CMD ["npm", "run", "start:dev"]

FROM backend-base AS backend-builder
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/ .
RUN npm run build

FROM node:20-alpine AS backend-prod
WORKDIR /app
COPY --from=backend-builder /app/dist         ./dist
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/package.json ./package.json
COPY --from=backend-builder /app/prisma       ./prisma
EXPOSE 8080
CMD ["node", "dist/main"]

# ─────────────────────────────────────────────────────────────────────────────
# Frontend
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
