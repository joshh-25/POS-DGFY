# syntax=docker/dockerfile:1
# Build context: repo root (contains `apps/dgfy-ims/`)

FROM node:22-alpine AS builder
WORKDIR /app
COPY apps/dgfy-ims/package*.json ./
# apps/dgfy-ims's file: deps point two levels up (file:../../packages/...) to
# reach repo-root packages/ from their real, one-directory-deeper home. `npm
# ci`'s virtual-tree loader has a bug with 2+ `../` segments in a `file:`
# link's lockfile entry (arborist's #loadLink throws reading `.extraneous` off
# undefined) on the npm version this base image ships -- reproducible even
# with the actual target directory present and even after upgrading npm.
# 1 hop resolves to the identical /packages path via WORKDIR /app (both
# clamp at the container's filesystem root), so drop to 1 hop here, image-only
# -- the host copy of these files is untouched and still needs 2 hops.
RUN sed -i 's#\.\./\.\./packages/#../packages/#g' package.json package-lock.json
COPY packages/pos-receipt /packages/pos-receipt
COPY packages/shared-constants /packages/shared-constants
COPY packages/web-core /packages/web-core
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm config set fetch-retries=5 fetch-retry-mintimeout=20000 fetch-retry-maxtimeout=120000 fetch-timeout=300000 \
    && (npm ci || (sleep 10 && npm ci) || (sleep 20 && npm ci))
COPY apps/dgfy-ims/ ./

ARG VITE_API_URL=/api/v1
ARG VITE_BUILD_STAMP=""
# Cross-app (skupervisor <-> pos/storefront) link overrides. Not strictly
# required for correctness -- the relevant web-core modules already derive
# the right sibling domain from window.location.origin at runtime when
# these are unset. Left empty by default; set explicitly per-environment as
# a belt-and-suspenders layer, independent of that runtime heuristic.
ARG VITE_DGFY_AUTH_URL=""
ARG VITE_SKUPERVISOR_REGISTRATION_URL=""
ARG VITE_DGFY_RESET_URL=""
ARG VITE_SKUPERVISOR_BASE_URL=""
ARG VITE_STOREFRONT_ACCOUNT_URL=""
ARG VITE_POS_TERMINAL_URL=""
# PDF/batch menu import -- gated features shared via packages/web-core's
# src/features/pos (mounted by both dgfy-ims and dgfy-pos). Default off, see
# docs/compliance/impact-declarations/2026-07-25-pos-pdf-menu-import.md.
ARG VITE_MENU_PDF_IMPORT_ENABLED=false
ARG VITE_MENU_IMPORT_BATCH_ENABLED=false
ARG VITE_SENTRY_ENABLED=false
ARG VITE_SENTRY_DSN_SKUPERVISOR=""
ARG VITE_SENTRY_ENVIRONMENT=""
ARG VITE_SENTRY_RELEASE=""
ARG VITE_SENTRY_TRACES_SAMPLE_RATE=0
ARG VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0
ARG VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=0
ARG VITE_SENTRY_TRACE_PROPAGATION_TARGETS=""
# Emergency kill switch for distributed tracing. Defaults ON (empty is
# treated as true) -- deliberately the opposite polarity to
# VITE_SENTRY_ENABLED above, so that a mis-threaded build arg fails towards
# "tracing works" rather than "tracing silently dead".
ARG VITE_SENTRY_TRACE_PROPAGATION_ENABLED=""
# Single shared PostHog project across all 3 surfaces (store/pos/skupervisor),
# distinguished by the `surface` event property set in analyticsClient.js.
ARG VITE_POSTHOG_ENABLED=false
ARG VITE_POSTHOG_HOST=""
ARG VITE_POSTHOG_KEY=""
ARG VITE_POSTHOG_ENVIRONMENT=""
ARG SENTRY_UPLOAD_SOURCEMAPS=false
ARG SENTRY_ORG=""
ARG SENTRY_PROJECT_SKUPERVISOR=""
ARG SENTRY_URL=""
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_BUILD_STAMP=${VITE_BUILD_STAMP} \
    VITE_DGFY_AUTH_URL=${VITE_DGFY_AUTH_URL} \
    VITE_SKUPERVISOR_REGISTRATION_URL=${VITE_SKUPERVISOR_REGISTRATION_URL} \
    VITE_DGFY_RESET_URL=${VITE_DGFY_RESET_URL} \
    VITE_SKUPERVISOR_BASE_URL=${VITE_SKUPERVISOR_BASE_URL} \
    VITE_STOREFRONT_ACCOUNT_URL=${VITE_STOREFRONT_ACCOUNT_URL} \
    VITE_POS_TERMINAL_URL=${VITE_POS_TERMINAL_URL} \
    VITE_MENU_PDF_IMPORT_ENABLED=${VITE_MENU_PDF_IMPORT_ENABLED} \
    VITE_MENU_IMPORT_BATCH_ENABLED=${VITE_MENU_IMPORT_BATCH_ENABLED} \
    VITE_SENTRY_ENABLED=${VITE_SENTRY_ENABLED} \
    VITE_SENTRY_DSN_SKUPERVISOR=${VITE_SENTRY_DSN_SKUPERVISOR} \
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
    SENTRY_PROJECT_SKUPERVISOR=${SENTRY_PROJECT_SKUPERVISOR} \
    SENTRY_URL=${SENTRY_URL}

RUN --mount=type=secret,id=sentry_auth_token,required=false \
    export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    && npm run build

FROM nginx:alpine AS runtime
RUN apk add --no-cache curl
COPY --from=builder /app/dist /usr/share/nginx/html
COPY infrastructure/docker/dgfy-ims/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8081/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
