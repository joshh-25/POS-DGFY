# syntax=docker/dockerfile:1
# Build context: repo root (contains apps/dgfy-migration-runner/)

FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/dgfy-migration-runner/package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Same tini/su-exec/non-root pattern as infrastructure/docker/dgfy-api/Dockerfile,
# minus curl: this is a one-shot CLI (not a long-running HTTP service), so
# there is no liveness probe to curl against.
RUN apk add --no-cache tini su-exec \
 && addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY apps/dgfy-migration-runner/package*.json ./
COPY apps/dgfy-migration-runner/src ./src

# /reports is the writable bind mount (maps to REPORT_DIR per D-13) — NOT
# /app/logs like dgfy-api, since this service writes migration run reports,
# not application logs.
RUN mkdir -p /reports \
 && chown -R app:app /app /reports

COPY infrastructure/docker/dgfy-migration-runner/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# No USER directive: same reasoning as dgfy-api's Dockerfile — start as root so
# entrypoint.sh can fix bind-mounted REPORT_DIR ownership, then drop to the
# unprivileged `app` user before running any CLI command.

# Deliberately no port declaration or container health probe instructions:
# this container never listens on a port — it is a one-shot CLI, run and
# exited independently of the long-running backend/dgfy-api containers (RUN-01).

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "src/cli.js", "--help"]
