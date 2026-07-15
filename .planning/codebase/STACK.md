---
status: reference
authority_level: reference
owner: gsd-codebase-mapper
last_reviewed: 2026-07-10
last_mapped_commit: c19885a7ca2f17474adc1b825eb94aa739bf9f27
applies_to: technology_stack
topic: stack
---

# Technology Stack

**Analysis Date:** 2026-07-10

## Languages

**Primary:**
- JavaScript / JSX - Main backend, frontend, scripts, and app glue. Use ES modules in `backend/package.json`, `frontend/package.json`, and `apps/dgfy-api/package.json`; use CommonJS for selected tooling such as `ecosystem.config.cjs`, `backend/jest.config.cjs`, and `release-controller/bin/skupervisor-release-controller.js`.
- TypeScript / TSX - Native POS and selected frontend typing surfaces. Key projects: `mobile/hardware-pos/tsconfig.json`, `Standalone POS/tsconfig.json`, and TS/TSX files under `frontend/`.

**Secondary:**
- Kotlin / Gradle Kotlin DSL - Android native shell in `Standalone POS/app/build.gradle.kts`, `Standalone POS/settings.gradle.kts`, and `Standalone POS/app/src`.
- YAML - GitHub Actions and deployment/config automation under `.github/workflows/`.
- Dockerfile / shell - Container builds and entrypoints under `infrastructure/docker/backend/Dockerfile`, `infrastructure/docker/dgfy-api/Dockerfile`, `infrastructure/docker/frontend/Dockerfile`, and `infrastructure/docker/*/entrypoint.sh`.

## Runtime

**Environment:**
- Node.js `>=18.0.0` is declared by `package.json`, `backend/package.json`, and `apps/dgfy-api/package.json`.
- CI uses Node.js `24` through `.github/workflows/ci.yml`.
- Production Docker images use `node:22-alpine` for backend and DGFY API runtime images in `infrastructure/docker/backend/Dockerfile` and `infrastructure/docker/dgfy-api/Dockerfile`.
- Frontend runtime is Nginx serving built Vite bundles from `infrastructure/docker/frontend/Dockerfile`; local/PM2 previews use Vite preview in `ecosystem.config.cjs`.
- Database runtime is MySQL through Sequelize (`backend/src/config/database.js`, `apps/dgfy-api/src/config/db.js`).
- Redis is optional infrastructure for blacklist/cache/rate-limit behavior (`backend/src/config/redis.js`, `apps/dgfy-api/src/config/redis.js`, `backend/src/middleware/rateLimiter.js`).

**Package Manager:**
- npm
- Lockfile: present for all npm projects: `package-lock.json`, `backend/package-lock.json`, `frontend/package-lock.json`, `apps/dgfy-api/package-lock.json`, `backend/device-bridge/package-lock.json`, `mobile/hardware-pos/package-lock.json`, and `Standalone POS/package-lock.json`.
- Lockfile version: npm lockfile v3.

## Frameworks

**Core:**
- Express `^4.22.2` - Main backend API (`backend/src/server.js`) and standalone DGFY API (`apps/dgfy-api/src/app.js`).
- Sequelize `^6.37.8` with `mysql2` `^3.6.5` - Landlord and tenant MySQL access (`backend/src/config/database.js`, `backend/src/middleware/tenantHandler.js`, `backend/src/utils/TenantConnector.js`, `apps/dgfy-api/src/config/db.js`).
- React `^18.2.0` and React DOM `^18.2.0` - Web apps in `frontend/apps/skupervisor`, `frontend/apps/pos`, and `frontend/apps/store`.
- Vite `^6.4.3` - Web build/dev server. App-specific configs are `frontend/apps/skupervisor/vite.config.js`, `frontend/apps/pos/vite.config.js`, and `frontend/apps/store/vite.config.js`.
- React Router DOM `^6.30.4` - Client routing in the frontend workspace (`frontend/package.json`).
- React Native `0.79.6` / React `19.0.0` - Native/hardware POS workspaces in `mobile/hardware-pos/package.json` and `Standalone POS/package.json`.
- Electron `^42.5.0` and `electron-builder` `^26.0.12` - POS desktop shell packaging through `frontend/package.json` and `frontend/desktop/pos-electron`.
- Nginx - Production frontend serving of Skupervisor, POS, and Storefront bundles from `infrastructure/docker/frontend/Dockerfile`.

**Testing:**
- Jest `^29.7.0` - Backend tests (`backend/jest.config.cjs`) and DGFY API tests (`apps/dgfy-api/jest.config.cjs`).
- Vitest `^4.0.18` - Frontend unit/integration tests (`frontend/package.json`).
- Playwright / `@playwright/test` - Browser/E2E checks in `backend/package.json` and `frontend/package.json`; frontend config is `frontend/playwright.config.js`.
- Supertest `^6.3.4` - Backend HTTP tests (`backend/package.json`, `apps/dgfy-api/package.json`).
- Node built-in test runner - Release controller tests (`release-controller/package.json`).
- Lighthouse CI `@lhci/cli` and k6 command hooks - Local performance/load scripts in `frontend/package.json`.

**Build/Dev:**
- Nodemon `^3.0.2` - Backend and DGFY API dev servers (`backend/package.json`, `apps/dgfy-api/package.json`).
- Concurrently `^8.2.2` - Root multi-process dev scripts in `package.json`.
- ESLint - Backend linting (`backend/eslint.config.mjs`), frontend linting (`frontend/package.json`), and DGFY API linting (`apps/dgfy-api/package.json`).
- Tailwind CSS `^3.3.6` + PostCSS/autoprefixer - Frontend styling pipeline (`frontend/tailwind.config.js`, `frontend/postcss.config.js`).
- PM2 ecosystem config - VPS process definitions in `ecosystem.config.cjs`.
- Docker Compose / Docker - Runtime packaging under `infrastructure/docker/`.

## Key Dependencies

**Critical:**
- `express` - HTTP APIs in `backend/src/server.js` and `apps/dgfy-api/src/app.js`.
- `sequelize` + `mysql2` - Main persistence layer for landlord/global and tenant databases.
- `jsonwebtoken` - Tenant, DGFY, storefront/customer, refresh, and handoff token flows (`backend/src/services/authService.js`, `apps/dgfy-api/src/infra/tokenSession.js`).
- `bcryptjs` / `bcrypt` - Password hashing in backend and standalone DGFY auth code paths.
- `axios` - Server-to-provider calls and frontend API client (`backend/src/services/paymongoService.js`, `backend/src/services/paypalService.js`, `frontend/src/services/api.js`).
- `redis` + `rate-limit-redis` - Optional token blacklist, rate limiting, and cache support (`backend/src/config/redis.js`, `backend/src/middleware/rateLimiter.js`).
- `helmet`, `cors`, `compression`, `morgan`, `express-rate-limit` - HTTP hardening, CORS, compression, logging, and throttling in `backend/src/server.js` and `apps/dgfy-api/src/app.js`.
- `nodemailer` - SMTP email delivery in `backend/src/services/emailService.js` and `apps/dgfy-api/src/infra/emailService.js`.
- `openai` `^6.17.0` - AI chat/tool integration in `backend/src/modules/ai/aiCore.js`.

**Infrastructure:**
- `multer` - Backend upload handling for AI files, CSV/images, and storefront catalog image paths (`backend/src/routes/ai.js`, `backend/src/routes/items.js`).
- `winston` - Backend structured logging (`backend/src/config/logger.js`).
- `node-cron` - Background scheduled work (`backend/package.json`, `backend/src/schedulers/billingScheduler.js`).
- `archiver`, `csv-parse`, `mammoth`, `pdf-parse` - Export/import/document parsing surfaces in backend workflows.
- `maplibre-gl` - Storefront discovery map UI; chunked separately in `frontend/apps/store/vite.config.js`.
- `qrcode` - Storefront/POS QR display utilities (`frontend/package.json`).
- `@paypal/react-paypal-js` - Frontend PayPal subscription UI support (`frontend/package.json`).
- `@node-escpos/core` and `@node-escpos/usb-adapter` - Local ESC/POS printer and cash drawer device bridge (`backend/device-bridge/package.json`).
- `zustand` - Frontend/native state management in `frontend/package.json`, `mobile/hardware-pos/package.json`, and `Standalone POS/package.json`.

## Configuration

**Environment:**
- Environment variables are loaded with `dotenv`; do not read or commit `.env*` values. Main loaders are `backend/src/server.js`, `backend/src/config/database.js`, `apps/dgfy-api/src/config/env.js`, and provider services under `backend/src/services/`.
- Backend database config uses `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_NAME_TEST`, `DB_USER`, `DB_PASSWORD`, and `DB_DIALECT` in `backend/src/config/database.js`.
- DGFY API uses the same landlord/global DB variables through `apps/dgfy-api/src/config/db.js`.
- Redis uses `REDIS_URL`; backend can continue without Redis for some paths, while `apps/dgfy-api/src/config/redis.js` logs fail-open blacklist behavior when `REDIS_URL` is absent.
- Auth/session configuration includes `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `JWT_EXPIRY`, `REFRESH_TOKEN_EXPIRY`, `SESSION_COOKIE_DOMAIN`, `SESSION_COOKIE_SECURE`, and CSRF/browser-session behavior in `backend/src/middleware/csrfProtection.js` and `frontend/src/services/browserSession.js`.
- Frontend runtime/build config uses `VITE_API_URL`, `VITE_PROXY_TARGET`, `VITE_STORE_BASE_PATH`, `VITE_APP_SURFACE`, `VITE_BUILD_STAMP`, `VITE_PAYMENTS_ENABLED`, `VITE_STOREFRONT_ACCOUNT_URL`, and POS desktop runtime values read by `frontend/src/utils/runtimeConfig.js`.
- Payment configuration includes `PAYMENTS_ENABLED`, `COMMERCE_PAYMENTS_ENABLED`, `COMMERCE_QRPH_ENABLED`, `COMMERCE_PAYMONGO_SPLIT_ENABLED`, `PAYMONGO_*`, and `PAYPAL_*` variables in `backend/src/config/paymentsFeature.js`, `backend/src/config/commercePaymentsFeature.js`, `backend/src/services/paymongoService.js`, and `backend/src/services/paypalService.js`.
- Email configuration includes `EMAIL_DELIVERY_PROVIDER`, `EMAIL_DELIVERY_FALLBACK_TO_BREVO_API`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `BREVO_API_KEY`, and `BREVO_API_URL` in `backend/src/services/emailService.js`.
- Device bridge configuration includes `DEVICE_BRIDGE_HOST`, `DEVICE_BRIDGE_PORT`, `DEVICE_BRIDGE_API_KEY`, printer USB selector variables, and receipt/cash-drawer tuning in `backend/device-bridge/config/runtime.js`.

**Build:**
- Root orchestration scripts live in `package.json`; key commands are `npm run dev`, `npm run dev:local-pos-stack`, `npm run build`, `npm run test`, `npm run check:architecture`, and `npm run install:all`.
- Backend scripts live in `backend/package.json`; migrations use `sequelize-cli` with `backend/src/config/sequelize.config.cjs` and migration paths under `backend/migrations` / `backend/src/migrations`.
- Frontend build scripts in `frontend/package.json` produce all three bundles with `npm run build:all`.
- App-specific Vite configs:
  - `frontend/apps/skupervisor/vite.config.js` - dev/preview port `5173`, `/api`, `/uploads`, and `/openfreemap` proxy.
  - `frontend/apps/pos/vite.config.js` - dev/preview port `5174`, `base: './'`, POS surface env define, `/api` and `/uploads` proxy.
  - `frontend/apps/store/vite.config.js` - dev/preview port `5175`, configurable store base path, `/api`, `/uploads`, and `/openfreemap` proxy, MapLibre/QR/vendor manual chunks.
- Docker builds:
  - `infrastructure/docker/backend/Dockerfile` builds backend image exposing `5000`.
  - `infrastructure/docker/dgfy-api/Dockerfile` builds standalone DGFY API image exposing `5100`.
  - `infrastructure/docker/frontend/Dockerfile` builds all frontend apps and serves them via Nginx on `8081`, `8082`, and `8083`.
- CI is GitHub Actions under `.github/workflows/`; `.github/workflows/ci.yml` runs docs lint, dependency audit, backend architecture gates, backend tests, DGFY API tests, frontend lint/tests/build, and bundle budget checks.

## Platform Requirements

**Development:**
- Install npm dependencies per project or run `npm run install:all` from `package.json`.
- Run backend on `http://localhost:5000`, Skupervisor on `http://localhost:5173`, POS on `http://localhost:5174`, Storefront on `http://localhost:5175`, and DGFY API on `http://localhost:5100`.
- Use MySQL for local backend/DGFY API runtime and Redis when testing token blacklist, cache, rate-limit, and production-like hosting paths.
- POS local hardware work requires USB ESC/POS printer access for `backend/device-bridge`.
- Architecture-sensitive backend changes must preserve the authoritative modular monolith flow from `docs/architecture/ARCHITECTURE_BOUNDARIES.md` and ADR 0001: `routes -> controllers -> usecases -> repositories -> models`.

**Production:**
- VPS/PM2 process definitions are in `ecosystem.config.cjs`; production backend runs as a forked PM2 process with one instance.
- Container deployment uses Docker images from `infrastructure/docker/backend/Dockerfile`, `infrastructure/docker/dgfy-api/Dockerfile`, and `infrastructure/docker/frontend/Dockerfile`.
- Frontend production image serves Skupervisor, POS, and Storefront through Nginx, while backend APIs remain authoritative for inventory, sales, POS, Storefront, auth, and tenant data.
- ADR 0026 makes browser session authority cookie/CSRF based; do not persist browser access/refresh tokens in localStorage/sessionStorage.
- ADR 0032 makes `apps/dgfy-api` a separate bearer-token mobile auth/registration service, not an HTTP proxy or shared package.

---

*Stack analysis: 2026-07-10*
