---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-07-10
analysis_date: 2026-07-10
last_mapped_commit: c19885a7ca2f17474adc1b825eb94aa739bf9f27
applies_to: codebase_mapping
topic: architecture
---

<!-- refreshed: 2026-07-10 -->
# Architecture

**Analysis Date:** 2026-07-10

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                    Deployable Surfaces                      │
├──────────────────┬──────────────────┬───────────────────────┤
│  Skupervisor IMS │ Standalone POS   │ Storefront            │
│  `frontend/src`  │ `frontend/apps/pos` │ `frontend/apps/store` │
├──────────────────┴──────────────────┴───────────────────────┤
│ Mobile / Hardware POS: `mobile/hardware-pos`, `android/imin-wrapper`, `Standalone POS` │
└────────┬──────────────────────┬──────────────────────────────┘
         │                      │
         ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 Backend API Modular Monolith                │
│  `backend/src/server.js`, `backend/src/routes`, `backend/src/modules` │
└────────┬──────────────────────┬──────────────────────────────┘
         │                      │
         ▼                      ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│ Landlord + Tenant Databases  │ │ Device / Payment Services   │
│ `backend/src/models`         │ │ `backend/device-bridge`,     │
│ `backend/src/utils/TenantConnector.js` │ `backend/src/modules/commercePayments` │
└──────────────────────────────┘ └─────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Standalone DGFY API Service                                 │
│ `apps/dgfy-api/src`                                         │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Backend API server | Express app setup, middleware, health checks, tenant binding, and route mounting | `backend/src/server.js` |
| Backend routes | HTTP path declarations that dispatch to controllers/handlers | `backend/src/routes/*.js` |
| Backend modules | Modular-monolith domain layer: handlers/controllers, use cases, repositories, contracts, domain utilities | `backend/src/modules/*` |
| Legacy backend facades | Compatibility controllers/services retained during migration | `backend/src/controllers/*.js`, `backend/src/services/*.js` |
| Tenant resolution | Resolves `x-company-token`, store slug, invite token, bearer/cookie fallback, and binds request tenant context | `backend/src/middleware/tenantHandler.js` |
| Landlord database | Tenant/account/payment/discovery registries and landlord-scoped Sequelize models | `backend/src/config/database.js`, `backend/src/models/Landlord/*`, `backend/src/models/index.js` |
| Tenant database connector | Per-tenant Sequelize connection cache with LRU eviction and non-test destructive-sync guard | `backend/src/utils/TenantConnector.js` |
| Skupervisor IMS | Main React admin/IMS shell, protected routes, workflow gates, and shared frontend services | `frontend/src/main.jsx`, `frontend/src/features/*`, `frontend/Pages/*`, `frontend/Components/*` |
| Standalone POS web app | Dedicated POS shell and terminal routing using shared POS feature code | `frontend/apps/pos/src/main.jsx`, `frontend/src/features/pos/*` |
| Storefront app | Public commerce/discovery/customer experience with separate Vite app tree | `frontend/apps/store/src/main.jsx`, `frontend/apps/store/src/StorefrontApp.jsx` |
| Frontend API/session layer | Axios client, refresh retry queue, BroadcastChannel coordination, browser session/CSRF state | `frontend/src/services/api.js`, `frontend/src/services/browserSession.js` |
| Standalone DGFY API | Mobile-oriented DGFY account auth/registration service with bounded duplicated auth slice | `apps/dgfy-api/src/app.js`, `apps/dgfy-api/src/modules/dgfyAuth/*` |
| Device bridge | LAN host hardware process for receipt printing and cash drawer actions | `backend/device-bridge/server.js`, `backend/device-bridge/printers/*`, `backend/device-bridge/drawer/*` |
| Native/hardware POS | Mobile/hardware POS runtime with local SQLite/sync/domain layers | `mobile/hardware-pos/src/*`, `android/imin-wrapper/app/src/*`, `Standalone POS/app/src/*` |
| Infrastructure | Docker images, compose stacks, nginx configs, deployment scripts | `infrastructure/docker/*`, `nginx/*`, `scripts/*` |

## Pattern Overview

**Overall:** Transitional modular monolith with multiple deployable frontend and API surfaces.

**Authoritative architecture sources:**
- `docs/START_HERE.md` is the documentation discovery entry point.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` requires `routes -> controllers -> usecases -> repositories -> models`.
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` defines change classification, ADR requirements, guardrails, and hardening obligations.
- `docs/architecture/adr/0001-modular-monolith-boundaries.md` accepts modular-monolith boundaries.
- `docs/architecture/adr/0003-migration-facade-strategy.md` accepts compatibility facades during migration.
- `docs/architecture/adr/0004-architecture-compliance-automation.md` requires automated architecture checks.
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md` defines Catalog/Inventory/POS/Storefront ownership.
- `docs/architecture/adr/0026-browser-session-cookie-authority.md` defines browser cookie/CSRF session authority.
- `docs/architecture/adr/0032-standalone-dgfy-api-service.md` defines `apps/dgfy-api` as a standalone service.

**Key Characteristics:**
- New backend domain code should land in `backend/src/modules/<domain>/...`.
- Controllers/handlers are transport-only; business rules belong in use cases.
- Repositories own direct Sequelize access; controller-to-model imports are blocked by guardrails.
- Legacy `backend/src/controllers` and `backend/src/services` are compatibility facades while domains migrate.
- Frontend has three Vite app surfaces: root/Skupervisor, standalone POS, and Storefront.
- DGFY account and company access are landlord-scoped; tenant-local users remain authorization profiles.
- Browser session authority is cookie-backed in production; JavaScript may hold short-lived access tokens in memory but must not persist browser authority tokens.

## Layers

**HTTP Entrypoint Layer:**
- Purpose: Configure Express, security middleware, request context, health checks, static uploads, tenant resolution, and route mounts.
- Location: `backend/src/server.js`
- Contains: CORS, Helmet, compression, JSON parsing, rate limits, CSRF, health response, route registration, lifecycle shutdown.
- Depends on: `backend/src/middleware/*`, `backend/src/config/*`, `backend/src/routes/*`, `backend/src/services/*`, `backend/src/modules/*`.
- Used by: `backend/package.json` scripts and Docker runtime.

**Route Layer:**
- Purpose: Bind HTTP verbs and paths to controllers or module handlers.
- Location: `backend/src/routes/*.js`
- Contains: Route modules for auth, users, items, POS, store, commerce payments, DGFY, admin, compliance, and vertical modes.
- Depends on: controllers/handlers and auth/permission middleware.
- Used by: Route mounts in `backend/src/server.js`.

**Controller / Handler Layer:**
- Purpose: Translate HTTP requests/responses and call use cases or compatibility services.
- Location: `backend/src/controllers/*.js`, `backend/src/modules/*/controllers/*Handlers.js`
- Contains: Legacy controllers plus module handlers such as `backend/src/modules/pos/controllers/posHandlers.js` and `backend/src/modules/dgfy/controllers/dgfyAuthHandlers.js`.
- Depends on: Module use cases or legacy services.
- Used by: `backend/src/routes/*.js`.

**Use Case Layer:**
- Purpose: Own business workflow orchestration and domain decisions.
- Location: `backend/src/modules/*/usecases/*.js`
- Contains: POS checkout/shift/terminal flows, DGFY auth/company switching, commerce payment finalization, inventory item/barcode/storefront catalog workflows.
- Depends on: repositories, command services, domain utilities, selected compatibility services during migration.
- Used by: module controllers and module `index.js` composers.

**Repository / Data Access Layer:**
- Purpose: Own persistence and Sequelize model interaction.
- Location: `backend/src/modules/*/repositories/*.js`, `apps/dgfy-api/src/modules/dgfyAuth/repositories/*.js`
- Contains: Query/update logic for tenant and landlord models.
- Depends on: Sequelize models from `backend/src/models/*` or service-local models in `apps/dgfy-api/src/modules/dgfyAuth/models/*`.
- Used by: use cases and module composers.

**Domain / Contract Layer:**
- Purpose: Keep pure domain calculations, boundary contracts, and error mapping separate from transport and persistence.
- Location: `backend/src/modules/*/domain/*.js`, `backend/src/modules/*/contracts/*.js`, `apps/dgfy-api/src/modules/dgfyAuth/contracts/*.js`
- Contains: POS discount policy/calculation, repository contracts, use-case responder contracts, domain error mappers.
- Depends on: Minimal local utilities.
- Used by: use cases, repositories, tests, and handlers.

**Tenant Context Layer:**
- Purpose: Resolve tenant routing and bind tenant-local model factories for the request.
- Location: `backend/src/middleware/tenantHandler.js`, `backend/src/utils/TenantConnector.js`, `backend/src/utils/tenantModelFactory.js`, `backend/src/utils/dbStore.js`
- Contains: Tenant lookup cache, token/cookie/invite/store-slug resolution, tenant DB connection cache, request-scoped tenant context.
- Depends on: Landlord services/models and Sequelize.
- Used by: All tenant-scoped API routes after global/public middleware.

**Frontend App Layer:**
- Purpose: Render Skupervisor, POS, and Storefront surfaces.
- Location: `frontend/src/main.jsx`, `frontend/apps/pos/src/main.jsx`, `frontend/apps/store/src/main.jsx`
- Contains: React Router trees, protected routes, workflow gates, POS terminal routes, Storefront app mount.
- Depends on: `frontend/src/features/*`, `frontend/src/services/*`, `frontend/Components/*`, `frontend/Pages/*`.
- Used by: Vite app configs under `frontend/vite.config.js` and `frontend/apps/*/vite.config.js`.

**Frontend Feature Layer:**
- Purpose: Group newer React feature code by domain.
- Location: `frontend/src/features/*`
- Contains: Feature pages, components, APIs, hooks, tests, and utility contracts for inventory, POS, settings, sales, F&B, hospitality, services, job orders, and stock movements.
- Depends on: shared UI components, `frontend/src/services/api.js`, and feature-local utilities.
- Used by: Skupervisor and POS app shells.

**Standalone DGFY API Layer:**
- Purpose: Provide mobile-oriented DGFY account authentication and registration without exposing the tenant-shaped backend API.
- Location: `apps/dgfy-api/src`
- Contains: Express `/v1` app, health routes, DGFY auth routes, independent Sequelize/Redis config, auth-only DGFY module.
- Depends on: Same landlord database tables and Redis token blacklist conventions; bounded duplicated logic from `backend/src/modules/dgfy`.
- Used by: Mobile clients and future standalone DGFY API deployments.

**Hardware / LAN Runtime Layer:**
- Purpose: Keep printer/drawer control and native client runtime outside the core backend API.
- Location: `backend/device-bridge/*`, `mobile/hardware-pos/src/*`, `android/imin-wrapper/app/src/*`, `Standalone POS/app/src/*`
- Contains: Device bridge HTTP process, ESC/POS printer/drawer modules, mobile local database/sync/domain layers, Android wrapper assets.
- Depends on: Backend API contracts for sales, inventory, shift, checkout, and device authorization.
- Used by: Windows host / POS clients per ADR 0025.

## Data Flow

### Primary Tenant API Request Path

1. Client sends a request to `/api/v1/...` from Skupervisor, POS, Storefront, or a native wrapper (`frontend/src/services/api.js`, `frontend/src/features/pos/services/posService.js`).
2. `backend/src/server.js` applies global middleware, CSRF protection, then `tenantHandler` for tenant-aware routes.
3. `backend/src/middleware/tenantHandler.js` resolves tenant context from `x-company-token`, strict auth cookies, DGFY membership bridge, refresh cookies, invite tokens, or storefront slug.
4. `backend/src/utils/TenantConnector.js` obtains/caches the tenant database connection and `tenantModelFactory` binds tenant models.
5. `backend/src/routes/*.js` dispatches to a legacy controller or module handler.
6. Handler calls a module use case from `backend/src/modules/<domain>/index.js`.
7. Use case calls repositories and command services; repositories touch Sequelize models.
8. Response returns through error handling in `backend/src/middleware/errorHandler.js`.

### POS Checkout / Stock Effect Flow

1. POS terminal UI runs through `frontend/apps/pos/src/main.jsx` and `frontend/src/features/pos/pages/TerminalPage.jsx`.
2. POS service calls `/api/v1/pos/...` via `frontend/src/features/pos/services/posService.js`.
3. `backend/src/routes/pos.js` dispatches to POS handlers/controllers.
4. `backend/src/modules/pos/index.js` composes `checkoutPosUseCase` with `posRepository` and `inventoryStockCommandService`.
5. POS owns transaction/payment/receipt execution in `backend/src/modules/pos/*`.
6. Inventory owns stock effects through `backend/src/modules/inventory/commands/stockCommandService.js`.
7. Tenant models persist POS transaction rows, stock movement rows, and item/location stock state.

### Storefront Commerce Payment Flow

1. Storefront renders through `frontend/apps/store/src/StorefrontApp.jsx`.
2. Storefront APIs call tenant/public store endpoints and commerce payment endpoints.
3. `backend/src/routes/store.js`, `backend/src/routes/storefrontDiscovery.js`, and `backend/src/routes/commercePayments.js` mount Storefront and payment behavior.
4. Commerce payment handlers in `backend/src/modules/commercePayments/controllers/commercePaymentHandlers.js` call use cases for PayMongo session creation/finalization/webhooks.
5. Landlord-owned payment session records in `backend/src/models/Landlord/CommercePaymentSession.js` resolve tenant context before tenant order finalization.
6. Storefront checkout may validate availability, but Inventory owns stock deduction when an order is fulfilled.

### DGFY Account / Company Switching Flow

1. DGFY account UI enters through `frontend/Pages/DgfyAuthPage.jsx`, `frontend/Pages/RegisterCompany.jsx`, Storefront account paths, or POS unlock flows.
2. Backend DGFY routes mount at `/api/v1/dgfy` in `backend/src/server.js` and route through `backend/src/routes/dgfy.js`.
3. `backend/src/modules/dgfy/index.js` composes account, invitation, company switching, tenant-session, POS-session, and legal-term use cases.
4. `backend/src/modules/dgfy/repositories/dgfyAccountRepository.js` writes landlord-scoped accounts, memberships, handoffs, legal acknowledgements, and audit evidence.
5. Tenant sessions are created only after accepted explicit `DgfyAccountTenantMembership` authorization.

### Standalone DGFY API Flow

1. Client calls `apps/dgfy-api` on `/v1/...`.
2. `apps/dgfy-api/src/app.js` applies Helmet, CORS, morgan, JSON parsing, and route registration.
3. `apps/dgfy-api/src/routes/index.js` delegates DGFY auth routes to `apps/dgfy-api/src/modules/dgfyAuth/routes/dgfyAuthRoutes.js`.
4. `apps/dgfy-api/src/modules/dgfyAuth/controllers/dgfyAuthHandlers.js` calls duplicated auth-only use cases.
5. Repository/model code uses the landlord database through `apps/dgfy-api/src/config/db.js`.
6. Redis/token blacklist and OTP infrastructure mirror backend conventions through `apps/dgfy-api/src/infra/tokenSession.js` and `apps/dgfy-api/src/infra/emailOtp.js`.

**State Management:**
- Backend request state uses Express request context plus `dbStore` tenant context.
- Landlord state is centralized in landlord Sequelize models under `backend/src/models/Landlord/*`.
- Tenant state is per-tenant MySQL schema/model binding through `TenantConnector`.
- Frontend Skupervisor/POS shared app state uses React contexts such as `frontend/src/store/PermissionContext.jsx` and `frontend/src/features/settings/WorkflowModeContext.jsx`.
- Browser auth access token and company token are in module memory in `frontend/src/services/browserSession.js`; standalone POS additionally persists active POS session state in `sessionStorage` under `pos_browser_session_v1`.
- Cross-tab refresh coordination uses `BroadcastChannel` in `frontend/src/services/api.js`.
- Mobile hardware POS has local domain/repository/service state under `mobile/hardware-pos/src/db`, `mobile/hardware-pos/src/repositories`, and `mobile/hardware-pos/src/services`.

## Key Abstractions

**Module Composer:**
- Purpose: Wire concrete repositories/services into use cases once per domain.
- Examples: `backend/src/modules/pos/index.js`, `backend/src/modules/inventory/index.js`, `backend/src/modules/dgfy/index.js`.
- Pattern: Dependency injection through `build*UseCase({ ...deps })`.

**Repository Contract:**
- Purpose: Define/verify persistence capabilities expected by use cases.
- Examples: `backend/src/modules/pos/contracts/posRepository.contract.js`, `backend/src/modules/inventory/contracts/itemRepository.contract.js`, `backend/src/modules/storefrontDiscovery/contracts/storefrontDiscoveryRepository.contract.js`.
- Pattern: Contract files colocated with module repositories.

**Tenant Context:**
- Purpose: Bind request execution to landlord or tenant-local database models.
- Examples: `backend/src/middleware/tenantHandler.js`, `backend/src/utils/TenantConnector.js`, `backend/src/utils/dbStore.js`.
- Pattern: Middleware resolves context before route handlers run.

**Browser Session Authority:**
- Purpose: Enforce ADR 0026 token/cookie split and CSRF header behavior.
- Examples: `frontend/src/services/browserSession.js`, `frontend/src/services/api.js`, `backend/src/middleware/csrfProtection.js`, `backend/src/utils/browserSessionCookies.js`.
- Pattern: HttpOnly refresh/session cookies plus in-memory bearer access token and CSRF cookie/header pairing.

**DGFY Membership:**
- Purpose: Authorize company switching, invitations, POS unlock, and tenant session creation.
- Examples: `backend/src/modules/dgfy/usecases/dgfyAuthUseCases.js`, `backend/src/models/Landlord/DgfyAccountTenantMembership.js`.
- Pattern: Landlord-scoped account/membership registry creates tenant sessions only after accepted active membership checks.

**Inventory Stock Command Service:**
- Purpose: Centralize stock effects so POS/Storefront request stock changes rather than mutating inventory tables.
- Examples: `backend/src/modules/inventory/commands/stockCommandService.js`, `backend/src/modules/pos/index.js`.
- Pattern: POS passes `inventoryStockCommandService` into checkout, void, and online order status use cases.

**Device Bridge:**
- Purpose: Isolate physical printer/drawer operations from the backend API and clients.
- Examples: `backend/device-bridge/server.js`, `backend/src/services/posDeviceBridgeService.js`, `backend/src/modules/pos/usecases/posDeviceUseCases.js`.
- Pattern: POS backend authorizes/audits, then calls bridge for hardware action.

## Entry Points

**Root monorepo scripts:**
- Location: `package.json`
- Triggers: `npm run dev`, `npm run dev:local-pos-stack`, `npm run build:*`, `npm run test:*`, `npm run check:architecture`.
- Responsibilities: Coordinate backend, device bridge, frontend apps, DGFY API, validation, and deployment scripts.

**Backend API:**
- Location: `backend/src/server.js`
- Triggers: `backend/package.json` start/dev scripts and backend Docker image.
- Responsibilities: Express API on the backend port, tenant middleware, route mounts, health checks, scheduled audits/workers.

**Skupervisor app:**
- Location: `frontend/src/main.jsx`, `frontend/apps/skupervisor/src/main.jsx`
- Triggers: root Vite app or Skupervisor Vite config.
- Responsibilities: IMS/admin protected routes, account registration, settings, inventory, reports, POS management, admin pages.

**Standalone POS web app:**
- Location: `frontend/apps/pos/src/main.jsx`
- Triggers: POS Vite config, PWA, or desktop shell.
- Responsibilities: POS terminal routing, account/session bootstrap, cashier-focused terminal UI, Skupervisor handoff.

**Storefront app:**
- Location: `frontend/apps/store/src/main.jsx`
- Triggers: Storefront Vite config.
- Responsibilities: Public DGFY storefront/discovery/customer commerce shell.

**Standalone DGFY API:**
- Location: `apps/dgfy-api/src/server.js`
- Triggers: `apps/dgfy-api/package.json` start/dev scripts or `infrastructure/docker/dgfy-api/Dockerfile`.
- Responsibilities: Mobile DGFY account auth/registration and health endpoints.

**Device bridge:**
- Location: `backend/device-bridge/server.js`
- Triggers: root and backend device bridge scripts.
- Responsibilities: Host-local printer and drawer operations.

**Native/hardware POS:**
- Location: `mobile/hardware-pos/src/app/App.tsx`, `android/imin-wrapper/app/src/main/AndroidManifest.xml`, `Standalone POS/index.js`
- Triggers: mobile/native build or Android wrapper runtime.
- Responsibilities: Hardware POS UI, local journal/sync, native hardware bridges, web POS wrapper.

## Architectural Constraints

- **Layering:** Follow `routes -> controllers -> usecases -> repositories -> models` for backend changes. New domain behavior belongs in `backend/src/modules/<domain>`.
- **Legacy compatibility:** `backend/src/controllers` and `backend/src/services` remain compatibility facades; use them only where migration is incomplete and avoid expanding legacy patterns.
- **Model imports:** Controllers must not import Sequelize models. Temporary non-repository model imports are tracked in `backend/src/config/architectureModelImportAllowlist.js`; controller exceptions are tracked in `backend/src/config/controllerModelImportAllowlist.js`.
- **Guardrails:** Run `npm run check:architecture` for architecture-sensitive changes. It runs backend guardrails and `apps/dgfy-api` guardrails.
- **Tenant isolation:** Tenant requests depend on `tenantHandler` and `TenantConnector`; do not infer tenant/company access from email or phone matches.
- **DGFY access:** Company switching and POS unlock require explicit accepted landlord membership rows; tenant-local users are authorization profiles, not credential authority.
- **Browser session authority:** Do not persist browser authority tokens in `localStorage` or `sessionStorage`. The standalone POS sessionStorage path in `frontend/src/services/browserSession.js` is a surface-specific active-session compatibility path.
- **Catalog/Inventory/POS/Storefront ownership:** Catalog owns item identity; Inventory owns stock truth/effects; POS owns sales execution; Storefront owns public presentation.
- **Payment boundary:** Storefront commerce payment sessions are landlord-owned and separate from subscription billing routes.
- **Device boundary:** Physical printer/drawer operations go through `backend/device-bridge`; clients should not print from scraped browser HTML.
- **Standalone API boundary:** `apps/dgfy-api` duplicates only the bounded auth slice from `backend/src/modules/dgfy` and is not a shared package or backend HTTP proxy.
- **Global state:** Module-level caches exist in `backend/src/middleware/tenantHandler.js`, `backend/src/utils/TenantConnector.js`, `frontend/src/services/api.js`, and `frontend/src/services/browserSession.js`; change them with concurrency and cross-tab behavior in mind.
- **Threading:** Node/Express services run on the single-threaded event loop with async I/O. Background schedulers/workers run in-process from `backend/src/server.js` and `backend/src/workers/*`.
- **Circular imports:** Not detected during this map; guardrails should be used for architecture-sensitive changes.

## Anti-Patterns

### Controller-Owned Persistence

**What happens:** A controller imports Sequelize models or performs data mutations directly.
**Why it's wrong:** It violates `docs/architecture/ARCHITECTURE_BOUNDARIES.md` and bypasses use-case/repository ownership.
**Do this instead:** Add or extend a module handler/use case/repository under `backend/src/modules/<domain>/...`, then route through `backend/src/routes/*.js`.

### POS or Storefront Updating Stock Truth

**What happens:** POS or Storefront code updates `item_location_stocks`, `fifo_batches`, `stock_movements`, or `items.current_stock` directly.
**Why it's wrong:** ADR 0029 assigns stock truth and stock effects to Inventory.
**Do this instead:** Call Inventory stock commands such as `backend/src/modules/inventory/commands/stockCommandService.js`; POS already composes this dependency in `backend/src/modules/pos/index.js`.

### Tenant Access From Contact Matches

**What happens:** Account/company access is inferred from matching email or phone between DGFY and tenant-local users.
**Why it's wrong:** ADR 0028 requires explicit `DgfyAccountTenantMembership` authorization.
**Do this instead:** Use DGFY membership use cases in `backend/src/modules/dgfy/usecases/dgfyAuthUseCases.js` and repository methods in `backend/src/modules/dgfy/repositories/dgfyAccountRepository.js`.

### Browser Token Persistence

**What happens:** Browser clients store access, refresh, tenant, admin, DGFY, or storefront customer tokens in browser-readable persistent storage.
**Why it's wrong:** ADR 0026 moves browser session authority to HttpOnly cookies and CSRF-protected unsafe requests.
**Do this instead:** Use `frontend/src/services/browserSession.js` and `frontend/src/services/api.js`; backend cookie/CSRF behavior belongs in middleware/utilities such as `backend/src/middleware/csrfProtection.js`.

### Shared Package Extraction for DGFY Auth

**What happens:** Backend and `apps/dgfy-api` are coupled through a shared auth package or backend proxy for Phase 1 DGFY auth.
**Why it's wrong:** ADR 0032 deliberately chose bounded duplication to avoid coupling the existing backend image to the new service.
**Do this instead:** Update both `backend/src/modules/dgfy/*` and `apps/dgfy-api/src/modules/dgfyAuth/*` deliberately and keep parity tests green.

## Error Handling

**Strategy:** HTTP transport converts domain/use-case failures into stable API responses, with centralized fallback error and not-found middleware.

**Patterns:**
- Backend not-found and error middleware are mounted in `backend/src/server.js` via `backend/src/middleware/notFoundHandler.js` and `backend/src/middleware/errorHandler.js`.
- `apps/dgfy-api` mounts `notFoundHandler` and `errorHandler` from `apps/dgfy-api/src/middleware/errorHandler.js`.
- DGFY API uses domain error contracts in `apps/dgfy-api/src/modules/dgfyAuth/contracts/domainErrors.js`, `domainErrorMapper.js`, and `useCaseResponder.js`.
- Tenant resolution failures return explicit `error_code` responses from `backend/src/middleware/tenantHandler.js`.
- Frontend API errors are normalized/emitted through `frontend/src/services/api.js` and `frontend/src/utils/errorHandler.js`.

## Cross-Cutting Concerns

**Logging:** Backend uses `backend/src/config/logger.js`, morgan in `backend/src/server.js`, request outcome logging in `backend/src/middleware/requestOutcomeLogger.js`, and device bridge logging in `backend/device-bridge/bridgeLogger.js`. `apps/dgfy-api` uses morgan plus console startup/shutdown logs.

**Validation:** Backend validation is distributed across route/controller/use-case layers and domain validators such as `backend/src/validators/*`, module use-case policy files, and scripts under `backend/scripts/*` and `scripts/*`.

**Authentication:** Tenant auth, DGFY account auth, platform admin auth, POS session authority, and Storefront customer auth are separate surfaces. Use `backend/src/modules/auth`, `backend/src/modules/dgfy`, `backend/src/modules/adminAuth`, and frontend session services rather than merging token scopes.

**Authorization:** Tenant-local `users` rows, permissions, roles, and location grants authorize IMS/POS actions after tenant selection. DGFY landlord memberships authorize company access and tenant-session creation.

**Payments:** Subscription billing lives under `backend/src/routes/payments.js` and `backend/src/modules/payments`; Storefront commerce payment sessions live under `backend/src/routes/commercePayments.js` and `backend/src/modules/commercePayments`.

**Compliance:** Compliance lifecycle and BIR/fiscal artifacts are routed through `backend/src/routes/compliance.js`, `backend/src/modules/compliance`, POS fiscal models, and governed docs under `docs/compliance/*`.

**Architecture enforcement:** `backend/scripts/check-architecture-guardrails.js`, `backend/scripts/check-controller-boundaries.js`, root `npm run check:architecture`, `.husky/pre-commit`, and CI workflow files enforce boundary drift checks.

---

*Architecture analysis: 2026-07-10*
