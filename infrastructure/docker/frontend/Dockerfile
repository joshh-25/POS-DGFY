# syntax=docker/dockerfile:1
# Build context: repo root (contains `frontend/`)

FROM node:22-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
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
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_STORE_BASE_PATH=${VITE_STORE_BASE_PATH} \
    VITE_TENANT_STORE_BASE_PATH=${VITE_TENANT_STORE_BASE_PATH} \
    VITE_ROOT_TENANT_SLUGS=${VITE_ROOT_TENANT_SLUGS} \
    VITE_PAYMENTS_ENABLED=${VITE_PAYMENTS_ENABLED} \
    VITE_BUILD_STAMP=${VITE_BUILD_STAMP}

RUN npm run build:all

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
