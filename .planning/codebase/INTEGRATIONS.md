---
status: reference
authority_level: reference
owner: gsd-codebase-mapper
last_reviewed: 2026-07-10
last_mapped_commit: c19885a7ca2f17474adc1b825eb94aa739bf9f27
applies_to: external_integrations
topic: integrations
---

# External Integrations

**Analysis Date:** 2026-07-10

## APIs & External Services

**Payments:**
- PayMongo - PayMongo recurring/subscription support and Storefront QR Ph commerce payment sessions.
  - SDK/Client: `axios` through `backend/src/services/paymongoService.js`
  - API base: `PAYMONGO_API_BASE_URL` defaults to PayMongo v1; `PAYMONGO_ACCOUNTS_API_BASE_URL` defaults to PayMongo v2 in code.
  - Auth: `PAYMONGO_SECRET_KEY`, `PAYMONGO_TEST_SECRET_KEY`, `PAYMONGO_LIVE_SECRET_KEY`, plus public key variants for client/provider mode selection.
  - Webhook auth: `PAYMONGO_WEBHOOK_SECRET`, `PAYMONGO_TEST_WEBHOOK_SECRET`, `PAYMONGO_LIVE_WEBHOOK_SECRET`, `PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS`.
  - Feature flags: `COMMERCE_PAYMENTS_ENABLED`, `COMMERCE_QRPH_ENABLED`, `COMMERCE_PAYMONGO_SPLIT_ENABLED`, `PAYMONGO_MODE`, `PAYMONGO_PLATFORM_SPLIT_CONFIRMED`, `PAYMONGO_LIVE_PLATFORM_SPLIT_CONFIRMED`.
  - Implementation files: `backend/src/modules/commercePayments`, `backend/src/routes/commercePayments.js`, `backend/src/config/commercePaymentsFeature.js`, `backend/src/models/Landlord/CommercePaymentSession.js`, `backend/src/models/Landlord/CommercePaymentRefund.js`, `backend/src/models/Landlord/TenantPaymentAccount.js`.
  - ADR contract: `docs/architecture/adr/0027-paymongo-commerce-qrph-platform-split-settlement.md` defines landlord-owned payment sessions, dynamic QR Ph Payment Intent flow, split settlement, refund reconciliation, and evidence-gated tenant readiness.
- PayPal - Subscription billing and legacy/migration subscription flows.
  - SDK/Client: `axios` through `backend/src/services/paypalService.js`; frontend UI uses `@paypal/react-paypal-js` from `frontend/package.json`.
  - Auth: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`.
  - Webhook auth: `PAYPAL_WEBHOOK_ID`.
  - Plan/config vars: `PAYPAL_PLAN_ID`, `PAYPAL_STANDARD_PLAN_ID`, `PAYPAL_PREMIUM_PLAN_ID`, `PAYPAL_MODE`, `MOCK_PAYPAL`.
  - Implementation files: `backend/src/modules/payments`, `backend/src/routes/payments.js`, `backend/src/services/paypalService.js`, `backend/src/models/Landlord/Payment.js`, `backend/src/models/Landlord/WebhookLog.js`.

**Email Delivery:**
- SMTP provider via Nodemailer - Transactional invitations, registration, password/reset, billing, and account emails.
  - SDK/Client: `nodemailer` in `backend/src/services/emailService.js` and `apps/dgfy-api/src/infra/emailService.js`.
  - Auth/config: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME`.
- Brevo HTTPS API - Optional direct email API provider and SMTP fallback path.
  - SDK/Client: native `fetch` in `backend/src/services/emailService.js`.
  - Auth/config: `BREVO_API_KEY`, `BREVO_API_URL`, `EMAIL_DELIVERY_PROVIDER`, `EMAIL_DELIVERY_FALLBACK_TO_BREVO_API`.

**AI:**
- OpenAI - AI chat, tool calling, diagnostics, and action confirmation flows for premium users.
  - SDK/Client: `openai` package in `backend/src/modules/ai/aiCore.js`.
  - Auth/config: `OPENAI_API_KEY`, `OPENAI_MODEL`.
  - Usage logging: `backend/src/models/Landlord/AiUsageLog.js` and `backend/src/modules/ai/aiCore.js`.
  - Tool registry: `backend/src/config/aiTools.js`, `backend/src/config/aiToolRegistry.js`, and `backend/src/services/aiToolExecutor.js`.

**Mapping / Geospatial:**
- OpenFreeMap tiles - Storefront/Skupervisor map tile proxy for discovery maps.
  - SDK/Client: MapLibre GL (`maplibre-gl`) in frontend code; Vite proxy routes `/openfreemap` to `https://tiles.openfreemap.org` in `frontend/apps/skupervisor/vite.config.js` and `frontend/apps/store/vite.config.js`.
  - Auth: Not detected.
  - Optional config: `VITE_TILE_BASE`, `VITE_TILING_SERVER`, `TILING_SERVER`, `STOREFRONT_DELIVERY_MAP_URL`, `STOREFRONT_DELIVERY_MAP_MANAGED_SERVER`, `STOREFRONT_DELIVERY_MAP_PORT`.

**POS Hardware:**
- Local ESC/POS USB bridge - Printer discovery/test print and cash drawer opening for LAN-hosted POS.
  - SDK/Client: `@node-escpos/core` and `@node-escpos/usb-adapter` in `backend/device-bridge/package.json`.
  - Auth/config: `DEVICE_BRIDGE_API_KEY`, `DEVICE_BRIDGE_HOST`, `DEVICE_BRIDGE_PORT`, `DEVICE_BRIDGE_USB_VENDOR_ID`, `DEVICE_BRIDGE_USB_PRODUCT_ID`, `DEVICE_BRIDGE_USB_SERIAL`, `DEVICE_BRIDGE_CASHDRAWER_PIN`.
  - Implementation files: `backend/device-bridge/server.js`, `backend/device-bridge/config/runtime.js`, `backend/device-bridge/printers/usbPrinter.js`, `backend/device-bridge/drawer/openDrawer.js`.
  - ADR contract: `docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md` keeps backend/MySQL authoritative and isolates physical printer/drawer access in the bridge.

## Data Storage

**Databases:**
- MySQL - Primary relational store for landlord/global tables and per-tenant company databases.
  - Connection: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_NAME_TEST`, `DB_USER`, `DB_PASSWORD`, `DB_DIALECT`.
  - Client: Sequelize + `mysql2`.
  - Backend config: `backend/src/config/database.js`.
  - DGFY API config: `apps/dgfy-api/src/config/db.js`.
  - Tenant routing: `backend/src/middleware/tenantHandler.js` resolves company context, and `backend/src/utils/TenantConnector.js` manages tenant database connections.
  - Models: tenant models under `backend/src/models`; landlord/global models under `backend/src/models/Landlord`.
  - Migration tooling: `sequelize-cli` scripts in `backend/package.json` with config `backend/src/config/sequelize.config.cjs`.

**File Storage:**
- Local filesystem - Uploads, temporary files, AI exports, logs, and storefront/catalog images.
  - Static serving: `backend/src/server.js` serves `/uploads`.
  - Upload handling: `multer` paths in routes such as `backend/src/routes/ai.js` and `backend/src/routes/items.js`.
  - Runtime dirs: `infrastructure/docker/backend/Dockerfile` creates `uploads/temp`, `storage/temp-ai-exports`, and `logs`.
  - Storage selector: `TEMP_FILE_STORAGE` is referenced by hosting profile/runtime checks.
- External object storage: Not detected in current dependencies/config.

**Caching:**
- Redis - Optional/required depending on hosting profile and failure-mode configuration.
  - Connection: `REDIS_URL`.
  - Client: `redis` in `backend/src/config/redis.js` and `apps/dgfy-api/src/config/redis.js`.
  - Uses: token blacklists, rate-limit store, Storefront discovery/profile/geosearch caches, and DGFY API token blacklist parity.
  - Cache flags: `STOREFRONT_DISCOVERY_REDIS_CACHE_ENABLED`, `STOREFRONT_DISCOVERY_REDIS_CACHE_TTL_SECONDS`, `STOREFRONT_DISCOVERY_PROFILE_REDIS_CACHE_TTL_SECONDS`, `GEO_SEARCH_REDIS_CACHE_ENABLED`, `GEO_SEARCH_REDIS_CACHE_TTL_SECONDS`, `AUTH_BLACKLIST_FAILURE_MODE`.

## Authentication & Identity

**Auth Provider:**
- Custom tenant/staff authentication.
  - Implementation: JWT access/refresh tokens, refresh rotation/blacklist, tenant context via `x-company-token`, browser cookie/CSRF authority, and permissions/RBAC.
  - Key files: `backend/src/routes/auth.js`, `backend/src/middleware/auth.js`, `backend/src/services/authService.js`, `backend/src/middleware/csrfProtection.js`, `frontend/src/services/browserSession.js`, `frontend/src/services/api.js`.
  - Config: `JWT_SECRET`, `JWT_EXPIRY`, `REFRESH_TOKEN_SECRET`, `REFRESH_TOKEN_EXPIRY`, `SESSION_COOKIE_DOMAIN`, `SESSION_COOKIE_SECURE`.
  - Boundary: ADR 0026 (`docs/architecture/adr/0026-browser-session-cookie-authority.md`) requires production browser session authority in HttpOnly cookies with CSRF headers; frontend token state must be memory-only.
- Custom DGFY global account authentication.
  - Backend browser/tenant integration: `backend/src/routes/dgfy.js`, `backend/src/modules/dgfy`, `backend/src/middleware/dgfyAuth.js`.
  - Mobile standalone API: `apps/dgfy-api/src/app.js`, `apps/dgfy-api/src/modules/dgfyAuth`, `apps/dgfy-api/src/middleware/dgfyAuth.js`.
  - Config: `DGFY_JWT_EXPIRY`, `DGFY_HANDOFF_JWT_EXPIRY`, `EMAIL_OTP_*`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `REDIS_URL`.
  - Boundary: ADR 0032 (`docs/architecture/adr/0032-standalone-dgfy-api-service.md`) makes `apps/dgfy-api` a standalone bearer-token mobile auth/registration service connected directly to the same landlord DB, not a proxy or shared package.
- Custom admin authentication.
  - Implementation: `backend/src/modules/adminAuth`, `backend/src/controllers/adminAuthController.js`, and `backend/src/config/adminAuthConfig.js`.
  - Config: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_LOGIN_LOCKOUT_*`.
- Storefront customer authentication/tracking.
  - Implementation: `backend/src/middleware/storeAuth.js`, `backend/src/routes/store.js`, `backend/src/modules/store`, and DGFY customer routes under `backend/src/routes/dgfy.js`.
  - Config: `STORE_JWT_SECRET`, `STORE_JWT_EXPIRY`, `STORE_CLAIM_TOKEN_SECRET`, `STORE_CLAIM_TOKEN_EXPIRY`, `STORE_CANCEL_PROOF_SECRET`, `STORE_CANCEL_PROOF_EXPIRY`.

## Monitoring & Observability

**Error Tracking:**
- External error tracking service: Not detected.
- Internal logging/diagnostics: Winston logger in `backend/src/config/logger.js`; request outcome logging in `backend/src/middleware/requestOutcomeLogger.js`; PM2 process control in `ecosystem.config.cjs`.

**Logs:**
- Backend logs use Winston and Morgan (`backend/src/config/logger.js`, `backend/src/server.js`).
- DGFY API logs use Morgan (`apps/dgfy-api/src/app.js`).
- Device bridge logs use `backend/device-bridge/bridgeLogger.js`.
- Runtime logs directory is created by `infrastructure/docker/backend/Dockerfile` and `infrastructure/docker/dgfy-api/Dockerfile`.

**Metrics/Health:**
- Backend health response and metrics routes are built in `backend/src/server.js` using `backend/src/services/healthService.js`, `backend/src/middleware/metricsMiddleware.js`, and `backend/src/services/metricsService.js`.
- DGFY API health endpoint is `GET /v1/health` in `apps/dgfy-api/src/routes/health.js`.
- Docker healthchecks call backend `/api/v1/health`, DGFY API `/v1/health`, and frontend `http://localhost:8081/` in the Dockerfiles.

## CI/CD & Deployment

**Hosting:**
- VPS/PM2 - `ecosystem.config.cjs` defines backend, Skupervisor, POS, Storefront, and staging PM2 processes.
- Docker/Nginx - `infrastructure/docker/backend/Dockerfile`, `infrastructure/docker/dgfy-api/Dockerfile`, and `infrastructure/docker/frontend/Dockerfile`.
- Docker Compose - `infrastructure/docker/docker-compose.yml`, `infrastructure/docker/docker-compose.override.yml`, `infrastructure/docker/local-dev/docker-compose.yml`, and `infrastructure/docker/local-test/docker-compose.yml`.
- Production/deploy scripts - Root scripts in `package.json` call `scripts/deploy.sh`, `scripts/deploy-production-ci.sh`, and release gates under `scripts/`.

**CI Pipeline:**
- GitHub Actions.
  - Main CI: `.github/workflows/ci.yml`.
  - PR/build checks: `.github/workflows/pr-checks.yml`, `.github/workflows/pr-code-checks.yml`, `.github/workflows/pr-backend-build-checks.yml`, `.github/workflows/pr-frontend-build-checks.yml`, `.github/workflows/pr-dgfy-api-build-checks.yml`.
  - Deploy workflows: `.github/workflows/deploy-api.yml`, `.github/workflows/deploy-backend.yml`, `.github/workflows/deploy-frontend.yml`, `.github/workflows/deploy-production.yml`, `.github/workflows/deployment-orchestrator.yml`, `.github/workflows/publish-platform.yml`.
  - QA workflows: `.github/workflows/playwright-qa.yml`, `.github/workflows/nightly-ims-pos-sales-e2e.yml`.

## Environment Configuration

**Required env vars:**
- Core backend: `NODE_ENV`, `PORT`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `CORS_ORIGIN`.
- Tenant/session/security: `SESSION_COOKIE_DOMAIN`, `SESSION_COOKIE_SECURE`, `TRUST_PROXY`, `ENFORCE_HTTPS`, `AUTH_BLACKLIST_FAILURE_MODE`, `REDIS_URL`.
- DGFY API: `PORT`, `DGFY_BACKEND_BASE_URL`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `REDIS_URL`, `SMTP_*` or `BREVO_*` for email.
- Frontend: `VITE_API_URL`, `VITE_PROXY_TARGET`, `VITE_STORE_BASE_PATH`, `VITE_PAYMENTS_ENABLED`, `VITE_STOREFRONT_ACCOUNT_URL`, `VITE_POS_TERMINAL_URL`, `VITE_BUILD_STAMP`.
- PayMongo: `PAYMONGO_MODE`, `PAYMONGO_SECRET_KEY` or mode-specific secret key, `PAYMONGO_WEBHOOK_SECRET` or mode-specific webhook secret, `PAYMONGO_DGFY_MERCHANT_ID`, `PAYMONGO_PLATFORM_SPLIT_CONFIRMED`, commerce payment feature flags.
- PayPal: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MODE`, plan ID variables.
- Email: `EMAIL_DELIVERY_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `BREVO_API_KEY`, `BREVO_API_URL`.
- AI: `OPENAI_API_KEY`, `OPENAI_MODEL`.
- Device bridge: `DEVICE_BRIDGE_HOST`, `DEVICE_BRIDGE_PORT`, `DEVICE_BRIDGE_API_KEY`, `DEVICE_BRIDGE_USB_VENDOR_ID`, `DEVICE_BRIDGE_USB_PRODUCT_ID`, `DEVICE_BRIDGE_USB_SERIAL`, `DEVICE_BRIDGE_CASHDRAWER_PIN`.

**Secrets location:**
- Local env files are present but must not be read or quoted: `.env.prod.local.example`, `.env.qa.local.example`, `.env.qa.secrets.local.example`, `backend/.env.example`, `backend/.env.shared.example`, `backend/.env.vps.example`, `frontend/.env.development`, `frontend/.env.example`, `frontend/.env.shared.example`, `frontend/.env.vps.example`, `infrastructure/docker/.env`, `infrastructure/docker/.env.example`.
- CI secrets are referenced by GitHub Actions env wiring under `.github/workflows/`.
- Docker/local compose env files exist under `infrastructure/docker/local-dev/` and `infrastructure/docker/local-test/`; treat them as environment configuration sources, not documentation sources for secret values.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/v1/payments/webhook` - PayPal subscription webhook endpoint in `backend/src/routes/payments.js`, handled by `backend/src/modules/payments/controllers/paymentHandlers.js` and `backend/src/modules/payments/usecases/handleWebhookUseCase.js`.
- `POST /api/v1/commerce-payments/paymongo/webhook` - PayMongo commerce webhook endpoint in `backend/src/routes/commercePayments.js`, handled by `backend/src/modules/commercePayments/controllers/commercePaymentHandlers.js` and `backend/src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js`.
- `POST /api/v1/payments/simulate-webhook` - Dev-only simulation endpoint enabled only outside production in `backend/src/routes/payments.js`.
- DGFY customer event stream - `GET /api/v1/dgfy/customer/events` in `backend/src/routes/dgfy.js` streams customer events internally; no external provider callback detected.

**Outgoing:**
- PayMongo API calls to payment, payment-intent, payment-method, refund, child merchant/account, and activation endpoints through `backend/src/services/paymongoService.js`.
- PayPal API calls to OAuth, subscriptions, revise/cancel, and webhook signature verification endpoints through `backend/src/services/paypalService.js`.
- Brevo API email calls through `backend/src/services/emailService.js` when configured.
- SMTP delivery through Nodemailer in `backend/src/services/emailService.js` and `apps/dgfy-api/src/infra/emailService.js`.
- OpenAI chat completions/tool-calling requests through `backend/src/modules/ai/aiCore.js`.
- OpenFreeMap tile requests proxied by Vite dev/preview for Skupervisor and Storefront through `frontend/apps/skupervisor/vite.config.js` and `frontend/apps/store/vite.config.js`.

---

*Integration audit: 2026-07-10*
