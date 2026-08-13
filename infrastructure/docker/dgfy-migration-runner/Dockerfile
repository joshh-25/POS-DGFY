# syntax=docker/dockerfile:1
# Build context: repo root (contains `apps/dgfy-migration-runner/`)
#
# apps/dgfy-migration-runner holds ONLY the migration domain extracted from
# backend/ (migrations/, src/config/sequelize.config.cjs, src/seeders/,
# .sequelizerc) -- no backend src/, no HTTP server. It's a one-shot CLI:
# run `sequelize-cli db:migrate` and exit. See infrastructure/docker/
# docker-compose.yml, where dgfy-api depends_on this service's
# service_completed_successfully.

FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/dgfy-migration-runner/package*.json ./
# Same 2-hop -> 1-hop normalization as infrastructure/docker/dgfy-api/
# Dockerfile; see the comment there for why.
RUN sed -i 's#\.\./\.\./packages/#../packages/#g' package.json package-lock.json
COPY packages/shared-constants /packages/shared-constants
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Same tini/su-exec/non-root pattern as infrastructure/docker/dgfy-api/Dockerfile,
# minus curl: this is a one-shot CLI (not a long-running HTTP service), so
# there is no liveness probe to curl against.
RUN apk add --no-cache tini su-exec \
 && addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared-constants /packages/shared-constants
COPY apps/dgfy-migration-runner/package*.json ./
COPY apps/dgfy-migration-runner/.sequelizerc ./.sequelizerc
COPY apps/dgfy-migration-runner/migrations ./migrations
COPY apps/dgfy-migration-runner/src ./src
COPY apps/dgfy-migration-runner/database-setup.sql ./database-setup.sql

RUN chown -R app:app /app

COPY infrastructure/docker/dgfy-migration-runner/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# No USER directive: same reasoning as dgfy-api's Dockerfile -- start as root
# so entrypoint.sh can drop to the unprivileged `app` user before running
# any CLI command. No bind-mounted data directory here (unlike dgfy-api's
# uploads/storage/logs), so there's no ownership-fixup step needed, but the
# drop-to-non-root pattern is kept for consistency and least privilege.

# Deliberately no port declaration or container health probe: this
# container never listens on a port -- it is a one-shot CLI, run and
# exited independently of the long-running backend/dgfy-api containers.

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["npx", "--no-install", "sequelize-cli", "db:migrate", "--config", "src/config/sequelize.config.cjs"]
