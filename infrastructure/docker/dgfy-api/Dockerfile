# syntax=docker/dockerfile:1
# Build context: repo root (contains `apps/dgfy-api/`)
#
# apps/dgfy-api is a copy of backend/ (see docs/ai/CLAUDE.md), minus the
# migration domain -- migrations/, .sequelizerc, database-setup.sql, and
# src/seeders/ live in apps/dgfy-migration-runner instead. This image never
# runs `sequelize-cli db:migrate`; the migration-runner container does that
# in a separate one-shot run before this service starts (see
# infrastructure/docker/docker-compose.yml).

FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/dgfy-api/package*.json ./
COPY packages/shared-constants /packages/shared-constants
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# tini as PID 1 for correct signal forwarding/zombie reaping between the
# entrypoint's tenant-schema-sync step and the exec'd node process. su-exec
# lets entrypoint.sh drop from root to the unprivileged `app` user after
# fixing bind-mount ownership (see entrypoint.sh).
RUN apk add --no-cache curl tini su-exec \
 && addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared-constants /packages/shared-constants
COPY apps/dgfy-api/package*.json ./
COPY apps/dgfy-api/src ./src
COPY apps/dgfy-api/assets ./assets
COPY apps/dgfy-api/scripts ./scripts

RUN mkdir -p uploads/temp storage/temp-ai-exports logs \
 && chown -R app:app /app

COPY infrastructure/docker/dgfy-api/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# No USER directive here: the container must start as root so entrypoint.sh
# can fix ownership of bind-mounted volumes (uploads/storage/logs), which
# are frequently root-owned because Docker auto-creates missing bind-mount
# host directories as root. entrypoint.sh drops to the unprivileged `app`
# user via su-exec before running the tenant schema sync or starting the
# server.

EXPOSE 5100

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:5100/api/v1/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
# --import loads src/instrument.js (Sentry.init) before server.js's own
# imports, so express/mysql2 auto-instrumentation can patch those modules
# at import time -- see the comment at the top of src/instrument.js.
CMD ["node", "--import", "./src/instrument.js", "src/server.js"]
