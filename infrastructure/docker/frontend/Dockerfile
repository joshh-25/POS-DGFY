# syntax=docker/dockerfile:1
# Build context: repo root (contains `frontend/`)

FROM node:22-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
COPY packages/pos-receipt /packages/pos-receipt
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm config set fetch-retries=5 fetch-retry-mintimeout=20000 fetch-retry-maxtimeout=120000 fetch-timeout=300000 \
    && (npm ci || (sleep 10 && npm ci) || (sleep 20 && npm ci))
COPY frontend/ ./

# Deliberately no VITE_API_BASE_URL / VITE_ASSET_BASE_URL build args here: this
# single image serves 3 different public hostnames, and both env vars fall back
# cleanly to relative/same-origin behavior when unset
# (frontend/src/utils/runtimeConfig.js: resolveApiBaseUrl / resolveAssetOrigin).
ARG VITE_API_URL=/api/v1
ARG VITE_STORE_BASE_PATH=/
ARG VITE_TENANT_STORE_BASE_PATH=/tenant-store
ARG VITE_ROOT_TENANT_SLUGS=false
ARG VITE_PAYMENTS_ENABLED=false
# Consumed by frontend/apps/store/vite.config.js as a cache-busting/build
# marker; falls back to the build timestamp if unset, so a stable value
# (e.g. the git SHA) is preferable for reproducible CI builds.
ARG VITE_BUILD_STAMP=""
# Cross-app (storefront <-> skupervisor) link overrides. Not strictly
# required for correctness -- frontend/apps/store/src/businessRegistrationUrl.js
# and frontend/src/features/pos/utils/skupervisorHandoff.js already derive
# the right sibling domain from window.location.origin at runtime when
# these are unset (what lets one shared image serve multiple domains
# correctly). Left empty by default; set explicitly per-environment as a
# belt-and-suspenders layer, independent of that runtime heuristic.
ARG VITE_DGFY_AUTH_URL=""
ARG VITE_SKUPERVISOR_REGISTRATION_URL=""
ARG VITE_DGFY_RESET_URL=""
ARG VITE_SKUPERVISOR_BASE_URL=""
ARG VITE_STOREFRONT_ACCOUNT_URL=""
ARG VITE_POS_TERMINAL_URL=""
ARG VITE_SENTRY_ENABLED=false
ARG VITE_SENTRY_DSN_SKUPERVISOR=""
ARG VITE_SENTRY_DSN_POS=""
ARG VITE_SENTRY_DSN_STORE=""
ARG VITE_SENTRY_ENVIRONMENT=""
ARG VITE_SENTRY_RELEASE=""
ARG VITE_SENTRY_TRACES_SAMPLE_RATE=0
ARG VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0
ARG VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=0
ARG SENTRY_UPLOAD_SOURCEMAPS=false
ARG SENTRY_ORG=""
ARG SENTRY_PROJECT_SKUPERVISOR=""
ARG SENTRY_PROJECT_POS=""
ARG SENTRY_PROJECT_STORE=""
ARG SENTRY_URL=""
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_STORE_BASE_PATH=${VITE_STORE_BASE_PATH} \
    VITE_TENANT_STORE_BASE_PATH=${VITE_TENANT_STORE_BASE_PATH} \
    VITE_ROOT_TENANT_SLUGS=${VITE_ROOT_TENANT_SLUGS} \
    VITE_PAYMENTS_ENABLED=${VITE_PAYMENTS_ENABLED} \
    VITE_BUILD_STAMP=${VITE_BUILD_STAMP} \
    VITE_DGFY_AUTH_URL=${VITE_DGFY_AUTH_URL} \
    VITE_SKUPERVISOR_REGISTRATION_URL=${VITE_SKUPERVISOR_REGISTRATION_URL} \
    VITE_DGFY_RESET_URL=${VITE_DGFY_RESET_URL} \
    VITE_SKUPERVISOR_BASE_URL=${VITE_SKUPERVISOR_BASE_URL} \
    VITE_STOREFRONT_ACCOUNT_URL=${VITE_STOREFRONT_ACCOUNT_URL} \
    VITE_POS_TERMINAL_URL=${VITE_POS_TERMINAL_URL} \
    VITE_SENTRY_ENABLED=${VITE_SENTRY_ENABLED} \
    VITE_SENTRY_DSN_SKUPERVISOR=${VITE_SENTRY_DSN_SKUPERVISOR} \
    VITE_SENTRY_DSN_POS=${VITE_SENTRY_DSN_POS} \
    VITE_SENTRY_DSN_STORE=${VITE_SENTRY_DSN_STORE} \
    VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT} \
    VITE_SENTRY_RELEASE=${VITE_SENTRY_RELEASE} \
    VITE_SENTRY_TRACES_SAMPLE_RATE=${VITE_SENTRY_TRACES_SAMPLE_RATE} \
    VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=${VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE} \
    VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=${VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE} \
    SENTRY_UPLOAD_SOURCEMAPS=${SENTRY_UPLOAD_SOURCEMAPS} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT_SKUPERVISOR=${SENTRY_PROJECT_SKUPERVISOR} \
    SENTRY_PROJECT_POS=${SENTRY_PROJECT_POS} \
    SENTRY_PROJECT_STORE=${SENTRY_PROJECT_STORE} \
    SENTRY_URL=${SENTRY_URL}

# build:all:parallel rather than build:all -- the three apps are independent
# vite builds (measured at 9.6s + 10.7s + 6.5s sequentially in CI), so running
# them concurrently roughly halves this layer. The `&`/`wait` form is safe here
# because this always runs under Alpine's sh; `build:all` stays sequential for
# local/Windows developers and for ci.yml's test-frontend job.
RUN --mount=type=secret,id=sentry_auth_token,required=false \
    export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    && npm run build:all:parallel

FROM nginx:alpine AS runtime
RUN apk add --no-cache curl
# vite.config.js in each app resolves outDir via `../../../dist-apps/<app>`
# relative to frontend/apps/<app>, which lands one level above the `frontend/`
# build context (WORKDIR /app here) — i.e. at /dist-apps, not /app/dist-apps.
COPY --from=builder /dist-apps/skupervisor /usr/share/nginx/html/skupervisor
COPY --from=builder /dist-apps/pos /usr/share/nginx/html/pos
COPY --from=builder /dist-apps/store /usr/share/nginx/html/store
COPY infrastructure/docker/frontend/conf.d/skupervisor.conf /etc/nginx/conf.d/skupervisor.conf
COPY infrastructure/docker/frontend/conf.d/pos.conf /etc/nginx/conf.d/pos.conf
COPY infrastructure/docker/frontend/conf.d/store.conf /etc/nginx/conf.d/store.conf
RUN rm -f /etc/nginx/conf.d/default.conf

EXPOSE 8081 8082 8083

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8081/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
