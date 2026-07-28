# syntax=docker/dockerfile:1
# Build context: repo root (contains `backend/`)

FROM node:22-alpine AS deps
WORKDIR /app
COPY backend/package*.json ./
COPY packages/shared-constants /packages/shared-constants
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm config set fetch-retries=5 fetch-retry-mintimeout=20000 fetch-retry-maxtimeout=120000 fetch-timeout=300000 \
    && (npm ci --omit=dev || (sleep 10 && npm ci --omit=dev) || (sleep 20 && npm ci --omit=dev))

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# tini as PID 1 for correct signal forwarding/zombie reaping between the
# entrypoint's migration step and the exec'd node process. su-exec lets
# entrypoint.sh drop from root to the unprivileged `app` user after fixing
# bind-mount ownership (see entrypoint.sh).
RUN apk add --no-cache curl tini su-exec \
 && addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared-constants /packages/shared-constants
COPY backend/package*.json ./
COPY backend/src ./src
COPY backend/migrations ./migrations
COPY backend/scripts ./scripts
COPY backend/.sequelizerc ./.sequelizerc
COPY backend/database-setup.sql ./database-setup.sql

RUN mkdir -p uploads/temp storage/temp-ai-exports logs \
 && chown -R app:app /app

COPY infrastructure/docker/backend/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# No USER directive here: the container must start as root so entrypoint.sh
# can fix ownership of bind-mounted volumes (uploads/storage/logs), which
# are frequently root-owned because Docker auto-creates missing bind-mount
# host directories as root. entrypoint.sh drops to the unprivileged `app`
# user via su-exec before running migrations or starting the server.

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:5000/api/v1/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
# --import loads src/instrument.js (Sentry.init) before server.js's own
# imports, so express/mysql2 auto-instrumentation can patch those modules
# at import time -- see the comment at the top of src/instrument.js.
CMD ["node", "--import", "./src/instrument.js", "src/server.js"]
