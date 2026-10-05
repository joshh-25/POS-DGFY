# syntax=docker/dockerfile:1
# Build context: repository root.

FROM node:22-alpine AS builder
WORKDIR /app
COPY apps/dgfy-admin/package*.json ./
# The container's /app workspace resolves the repo-root file dependencies via
# one parent hop. Keep the checked-in package manifest's two-hop paths intact.
RUN sed -i 's#\.\./\.\./packages/#../packages/#g' package.json package-lock.json
COPY packages/pos-receipt /packages/pos-receipt
COPY packages/shared-constants /packages/shared-constants
COPY packages/web-core /packages/web-core
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm config set fetch-retries=5 fetch-retry-mintimeout=20000 fetch-retry-maxtimeout=120000 fetch-timeout=300000 \
    && (npm ci || (sleep 10 && npm ci) || (sleep 20 && npm ci))
COPY apps/dgfy-admin/ ./

ARG APP_VERSION=""
ARG APP_RELEASE_FLOOR=""
ARG APP_RELEASE_REVISION=""
ARG VITE_API_URL=/api/v1
ARG VITE_SENTRY_ENABLED=false
ARG VITE_SENTRY_DSN_ADMIN=""
ARG VITE_SENTRY_ENVIRONMENT=""
ARG VITE_SENTRY_RELEASE=""
ARG VITE_SENTRY_TRACES_SAMPLE_RATE=0
ARG VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0
ARG VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=0
ARG VITE_SENTRY_TRACE_PROPAGATION_TARGETS=""
ARG VITE_SENTRY_TRACE_PROPAGATION_ENABLED=""
ARG VITE_POSTHOG_ENABLED=false
ARG VITE_POSTHOG_HOST=""
ARG VITE_POSTHOG_KEY=""
ARG VITE_POSTHOG_ENVIRONMENT=""
ARG SENTRY_UPLOAD_SOURCEMAPS=false
ARG SENTRY_ORG=""
ARG SENTRY_PROJECT_ADMIN=""
ARG SENTRY_URL=""
ENV APP_VERSION=${APP_VERSION} \
    VITE_APP_RELEASE_FLOOR=${APP_RELEASE_FLOOR} \
    VITE_APP_RELEASE_REVISION=${APP_RELEASE_REVISION} \
    VITE_API_URL=${VITE_API_URL} \
    VITE_SENTRY_ENABLED=${VITE_SENTRY_ENABLED} \
    VITE_SENTRY_DSN_ADMIN=${VITE_SENTRY_DSN_ADMIN} \
    VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT} \
    VITE_SENTRY_RELEASE=${VITE_SENTRY_RELEASE} \
    VITE_SENTRY_TRACES_SAMPLE_RATE=${VITE_SENTRY_TRACES_SAMPLE_RATE} \
    VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=${VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE} \
    VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=${VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE} \
    VITE_SENTRY_TRACE_PROPAGATION_TARGETS=${VITE_SENTRY_TRACE_PROPAGATION_TARGETS} \
    VITE_SENTRY_TRACE_PROPAGATION_ENABLED=${VITE_SENTRY_TRACE_PROPAGATION_ENABLED} \
    VITE_POSTHOG_ENABLED=${VITE_POSTHOG_ENABLED} \
    VITE_POSTHOG_HOST=${VITE_POSTHOG_HOST} \
    VITE_POSTHOG_KEY=${VITE_POSTHOG_KEY} \
    VITE_POSTHOG_ENVIRONMENT=${VITE_POSTHOG_ENVIRONMENT} \
    SENTRY_UPLOAD_SOURCEMAPS=${SENTRY_UPLOAD_SOURCEMAPS} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT_ADMIN=${SENTRY_PROJECT_ADMIN} \
    SENTRY_URL=${SENTRY_URL}
ENV APP_RELEASE_FLOOR=${APP_RELEASE_FLOOR}
ENV APP_RELEASE_REVISION=${APP_RELEASE_REVISION}
RUN --mount=type=secret,id=sentry_auth_token,required=false \
    export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    && npm run build

FROM nginx:alpine AS runtime
ARG APP_VERSION=""
ARG APP_RELEASE_FLOOR=""
ARG APP_RELEASE_REVISION=""
ENV APP_VERSION=${APP_VERSION}
ENV APP_RELEASE_FLOOR=${APP_RELEASE_FLOOR}
ENV APP_RELEASE_REVISION=${APP_RELEASE_REVISION}
RUN apk add --no-cache curl
COPY --from=builder /app/dist /usr/share/nginx/html
COPY infrastructure/docker/dgfy-admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8085
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8085/admin/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
