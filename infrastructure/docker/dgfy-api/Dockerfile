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
# apps/ lives one directory deeper than the repo root, so this file: dep
# points two levels up (file:../../packages/shared-constants). `npm ci`'s
# virtual-tree loader has a bug with 2+ `../` segments in a file: link's
# lockfile entry -- see the longer explanation in
# infrastructure/docker/frontend/Dockerfile, which hits the same bug. 1 hop
# resolves to the identical /packages path via WORKDIR /app (both clamp at
# the container's filesystem root), so drop to 1 hop here, image-only -- the
# host copy of these files is untouched and still needs 2 hops.
RUN sed -i 's#\.\./\.\./packages/#../packages/#g' package.json package-lock.json
COPY packages/shared-constants /packages/shared-constants
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
# ADR 0081 Decision 4 (#1575, epic #1548 Wave 3, Phase 277): runtime version equals the published
# image tag (e.g. "1.5.2-staging"), baked in at build time so a running container can report
# exactly what was published, not the bare package.json version. Empty default keeps a local
# `docker build` with no --build-arg working unchanged (see scripts/deploy-local.sh).
ARG APP_VERSION=""
ENV APP_VERSION=${APP_VERSION}
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

# apps/dgfy-api/src/services/tenantSchemaBootstrap.js requires the tenant-bootstrap manifest out of
# the sibling migration-runner app; from /app/src/services/ the three ../ hops land on the container
# root, so the destination must be /dgfy-migration-runner/..., not a path under /app.
# Interim: superseded by #1819's structural fix. Remove these two lines when that lands.
COPY apps/dgfy-migration-runner/src/tenantBootstrapManifest.cjs /dgfy-migration-runner/src/tenantBootstrapManifest.cjs
COPY apps/dgfy-migration-runner/migrations /dgfy-migration-runner/migrations

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
