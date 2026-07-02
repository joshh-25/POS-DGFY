# syntax=docker/dockerfile:1
# Build context: repo root (contains `backend/`)

FROM node:22-alpine AS deps
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache curl \
 && addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY backend/package*.json ./
COPY backend/src ./src
COPY backend/migrations ./migrations
COPY backend/.sequelizerc ./.sequelizerc
COPY backend/database-setup.sql ./database-setup.sql

RUN mkdir -p uploads/temp storage/temp-ai-exports logs \
 && chown -R app:app /app

USER app

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:5000/api/v1/health || exit 1

CMD ["node", "src/server.js"]
