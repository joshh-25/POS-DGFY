# syntax=docker/dockerfile:1
# Build context: repo root (contains `apps/dgfy-api/`)

FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/dgfy-api/package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Same tini/su-exec/non-root pattern as infrastructure/docker/backend/Dockerfile.
RUN apk add --no-cache curl tini su-exec \
 && addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY apps/dgfy-api/package*.json ./
COPY apps/dgfy-api/src ./src

RUN mkdir -p logs \
 && chown -R app:app /app

COPY infrastructure/docker/dgfy-api/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# No USER directive: same reasoning as backend's Dockerfile — start as root so
# entrypoint.sh can fix bind-mounted log directory ownership, then drop to
# the unprivileged `app` user before starting the server.

EXPOSE 5100

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:5100/v1/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "src/server.js"]
