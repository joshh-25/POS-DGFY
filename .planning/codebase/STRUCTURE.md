---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-07-10
analysis_date: 2026-07-10
last_mapped_commit: c19885a7ca2f17474adc1b825eb94aa739bf9f27
applies_to: codebase_mapping
topic: structure
---

# Codebase Structure

**Analysis Date:** 2026-07-10

## Directory Layout

```text
dgfy-platform/
├── apps/                  # New top-level deployable apps; currently `apps/dgfy-api`
├── backend/               # Main Express API, tenant/landlord data model, device bridge
├── frontend/              # React/Vite Skupervisor, POS, Storefront workspace
├── mobile/                # React Native / hardware POS TypeScript runtime
├── android/               # Android wrapper projects, including iMin wrapper
├── Standalone POS/        # Legacy/native standalone POS Android-style project
├── packages/              # Small shared package placeholders (`types`, `ui`)
├── infrastructure/        # Docker, nginx, local-dev, local-test, backup/restore runtime files
├── nginx/                 # Additional nginx deployment config
├── scripts/               # Root validation, release, smoke, deploy, and evidence scripts
├── release-controller/    # Release controller package and tests
├── docs/                  # Authoritative/reference/historical project documentation
├── .planning/             # GSD planning and generated codebase maps
├── .codex/skills/         # Repo-local Codex skills
├── .github/workflows/     # CI workflows
├── .husky/                # Git hooks
├── dist-apps/             # Built frontend app outputs
├── artifacts/             # Rendered QA/evidence artifacts
├── releases/              # Release artifacts
├── logs/                  # Local/runtime logs
├── package.json           # Monorepo orchestration scripts
└── README.md              # Project overview
```

## Directory Purposes

**`apps/`:**
- Purpose: Top-level deployable app convention for new services.
- Contains: `apps/dgfy-api`, a standalone Express service for mobile DGFY account auth/registration.
- Key files: `apps/dgfy-api/src/app.js`, `apps/dgfy-api/src/server.js`, `apps/dgfy-api/src/modules/dgfyAuth/index.js`, `apps/dgfy-api/package.json`.

**`backend/`:**
- Purpose: Main API and business backend.
- Contains: Express server, route files, legacy controllers/services, modular domain modules, Sequelize models, migrations, tests, scripts, uploads, and device bridge.
- Key files: `backend/src/server.js`, `backend/src/middleware/tenantHandler.js`, `backend/src/modules/index.js`, `backend/src/models/index.js`, `backend/src/utils/TenantConnector.js`, `backend/package.json`.

**`backend/src/modules/`:**
- Purpose: Current target location for backend domain code under the modular-monolith contract.
- Contains: Domain folders with `controllers`, `usecases`, `repositories`, `contracts`, `domain`, `services`, `utils`, `index.js`, and `README.md` as applicable.
- Key files: `backend/src/modules/pos/index.js`, `backend/src/modules/inventory/index.js`, `backend/src/modules/dgfy/index.js`, `backend/src/modules/commercePayments/index.js`, `backend/src/modules/storefrontDiscovery/index.js`.

**`backend/src/routes/`:**
- Purpose: Express route definitions for `/api/v1/*` endpoints.
- Contains: One file per route/domain, including `auth.js`, `pos.js`, `store.js`, `commercePayments.js`, `dgfy.js`, `items.js`, and vertical-mode routes.
- Key files: `backend/src/routes/pos.js`, `backend/src/routes/dgfy.js`, `backend/src/routes/commercePayments.js`, `backend/src/routes/store.js`.

**`backend/src/controllers/` and `backend/src/services/`:**
- Purpose: Legacy compatibility facades during migration.
- Contains: Older transport and business logic files still used by route surfaces and module composers.
- Key files: `backend/src/controllers/authController.js`, `backend/src/controllers/posController.js`, `backend/src/services/authService.js`, `backend/src/services/userService.js`, `backend/src/services/tenantProvisioningService.js`.

**`backend/src/models/`:**
- Purpose: Sequelize model definitions for tenant-local tables and landlord tables.
- Contains: Tenant models at the root and landlord models under `backend/src/models/Landlord`.
- Key files: `backend/src/models/index.js`, `backend/src/models/Item.js`, `backend/src/models/PosTransaction.js`, `backend/src/models/Landlord/Tenant.js`, `backend/src/models/Landlord/DgfyAccount.js`.

**`backend/migrations/`:**
- Purpose: Database migrations.
- Contains: CommonJS migration files for landlord and tenant schema changes.
- Key files: migration files under `backend/migrations/*.cjs`.

**`backend/device-bridge/`:**
- Purpose: LAN host process for POS hardware integration.
- Contains: Bridge server, printer discovery/test print, drawer pulse, receipt formatting, bridge auth, runtime config.
- Key files: `backend/device-bridge/server.js`, `backend/device-bridge/printers/usbPrinter.js`, `backend/device-bridge/drawer/openDrawer.js`, `backend/device-bridge/receipts/receiptFormatter.js`.

**`frontend/`:**
- Purpose: React/Vite frontend workspace.
- Contains: Root Skupervisor shell, app-specific Vite entries, shared features/components/services, tests, E2E/load tests, desktop Electron POS shell.
- Key files: `frontend/src/main.jsx`, `frontend/package.json`, `frontend/vite.config.js`, `frontend/apps/pos/src/main.jsx`, `frontend/apps/store/src/main.jsx`.

**`frontend/src/`:**
- Purpose: Shared Skupervisor app code and feature-first frontend modules.
- Contains: Main router, feature directories, services, hooks, store contexts, utilities, shared components.
- Key files: `frontend/src/main.jsx`, `frontend/src/services/api.js`, `frontend/src/services/browserSession.js`, `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/store/PermissionContext.jsx`.

**`frontend/src/features/`:**
- Purpose: Preferred location for newer frontend domain slices.
- Contains: Feature-local pages, components, APIs, hooks, tests, utils, and route contracts.
- Key files: `frontend/src/features/inventory/pages/ItemsPage.jsx`, `frontend/src/features/pos/pages/TerminalPage.jsx`, `frontend/src/features/settings/WorkflowModeContext.jsx`, `frontend/src/features/sales/pages/SalesPage.jsx`.

**`frontend/Components/` and `frontend/Pages/`:**
- Purpose: Legacy/shared React components and page-level surfaces.
- Contains: IMS pages, modals, UI primitives, admin pages, older feature components, and colocated tests.
- Key files: `frontend/Pages/RegisterCompany.jsx`, `frontend/Pages/Settings.jsx`, `frontend/Components/ui/button.jsx`, `frontend/Components/users/UserManagementModal.jsx`.

**`frontend/apps/`:**
- Purpose: Vite app-specific shells.
- Contains: `skupervisor`, `pos`, and `store` app entries, public assets, manifests, service workers, and app-local configs.
- Key files: `frontend/apps/skupervisor/src/main.jsx`, `frontend/apps/pos/src/main.jsx`, `frontend/apps/store/src/StorefrontApp.jsx`.

**`frontend/desktop/pos-electron/`:**
- Purpose: Electron wrapper for the POS desktop shell.
- Contains: Electron main process and builder config.
- Key files: `frontend/desktop/pos-electron/main.cjs`, `frontend/desktop/pos-electron/electron-builder.json`.

**`frontend/tests/`:**
- Purpose: Frontend Playwright E2E, load, and security tests.
- Contains: `frontend/tests/e2e` and `frontend/tests/load`.
- Key files: `frontend/playwright.config.js`, `frontend/tests/e2e/*`, `frontend/tests/load/smoke-load.js`.

**`mobile/hardware-pos/`:**
- Purpose: Hardware/mobile POS TypeScript runtime.
- Contains: App screens/components, API clients, domain logic, SQLite/local repositories, sync services, native bridge contracts.
- Key files: `mobile/hardware-pos/src/app/App.tsx`, `mobile/hardware-pos/src/domain/checkout.ts`, `mobile/hardware-pos/src/db/schema.ts`, `mobile/hardware-pos/src/services/manualSyncService.ts`.

**`android/imin-wrapper/`:**
- Purpose: Android wrapper for iMin/hardware POS surfaces.
- Contains: Gradle Android app, layouts, manifests, wrapper resources.
- Key files: `android/imin-wrapper/app/src/main/AndroidManifest.xml`, `android/imin-wrapper/app/src/main/res/layout/activity_web_pos.xml`.

**`Standalone POS/`:**
- Purpose: Existing standalone POS Android-style project.
- Contains: React Native/Android project files and bundled Android assets.
- Key files: `Standalone POS/index.js`, `Standalone POS/app/src/main/AndroidManifest.xml`, `Standalone POS/package.json`.

**`packages/`:**
- Purpose: Shared package placeholders.
- Contains: `packages/types` and `packages/ui`.
- Key files: `packages/types/index.js`, `packages/ui/index.js`.

**`infrastructure/`:**
- Purpose: Container, nginx, local stack, backup, restore, and environment fixture infrastructure.
- Contains: Dockerfiles, compose files, nginx templates, local-dev/local-test stacks, scripts.
- Key files: `infrastructure/docker/backend/Dockerfile`, `infrastructure/docker/frontend/Dockerfile`, `infrastructure/docker/dgfy-api/Dockerfile`, `infrastructure/docker/docker-compose.yml`, `infrastructure/docker/nginx/nginx.conf.template`.

**`scripts/`:**
- Purpose: Root automation for validation, smoke tests, deployment, release evidence, and architecture-sensitive gates.
- Contains: Node, Bash, and PowerShell scripts.
- Key files: `scripts/smoke-pos-terminal-ui.js`, `scripts/smoke-dgfy-access-ui.js`, `scripts/lint-docs.js`, `scripts/deploy.sh`.

**`docs/`:**
- Purpose: Governed project documentation.
- Contains: Authoritative architecture docs, ADRs, API/database/testing/feature docs, reference docs, archive.
- Key files: `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, `docs/architecture/adr/*.md`.

**`.planning/`:**
- Purpose: GSD planning artifacts and generated codebase maps.
- Contains: `codebase` reference docs and workflow artifacts.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

## Key File Locations

**Entry Points:**
- `package.json`: Root orchestration for dev/build/test/check/deploy.
- `backend/src/server.js`: Main Express API entrypoint and route mount table.
- `apps/dgfy-api/src/server.js`: Standalone DGFY API process entrypoint.
- `apps/dgfy-api/src/app.js`: Standalone DGFY API Express app.
- `frontend/src/main.jsx`: Root/Skupervisor React app and route tree.
- `frontend/apps/skupervisor/src/main.jsx`: Skupervisor app entry that imports root frontend app.
- `frontend/apps/pos/src/main.jsx`: Standalone POS React app.
- `frontend/apps/store/src/main.jsx`: Storefront React app.
- `backend/device-bridge/server.js`: Device bridge process entrypoint.
- `mobile/hardware-pos/src/app/App.tsx`: Hardware POS app entry.
- `Standalone POS/index.js`: Standalone POS project entry.
- `frontend/desktop/pos-electron/main.cjs`: Electron POS shell entry.

**Configuration:**
- `backend/src/config/database.js`: Landlord Sequelize config and destructive-sync guard.
- `backend/src/config/redis.js`: Backend Redis config.
- `backend/src/config/architectureModelImportAllowlist.js`: Temporary model-import exceptions for architecture guardrails.
- `backend/src/config/controllerModelImportAllowlist.js`: Temporary controller model-import exceptions.
- `frontend/vite.config.js`: Root frontend Vite config.
- `frontend/apps/skupervisor/vite.config.js`: Skupervisor build/dev config.
- `frontend/apps/pos/vite.config.js`: POS build/dev config.
- `frontend/apps/store/vite.config.js`: Storefront build/dev config.
- `frontend/package.json`: Frontend scripts/dependencies.
- `backend/package.json`: Backend scripts/dependencies.
- `apps/dgfy-api/package.json`: Standalone DGFY API scripts/dependencies.
- `mobile/hardware-pos/package.json`: Hardware POS scripts/dependencies.
- `infrastructure/docker/docker-compose.yml`: Main compose stack.
- `infrastructure/docker/docker-compose.override.yml`: Local override compose stack.
- `infrastructure/docker/local-dev/docker-compose.yml`: Local dev disposable stack.
- `infrastructure/docker/local-test/docker-compose.yml`: Local test disposable stack.
- `.github/workflows/ci.yml`: CI pipeline.
- `.husky/pre-commit`: Pre-commit architecture-sensitive checks.

**Core Logic:**
- `backend/src/modules/pos/usecases/posUseCases.js`: POS sales, shifts, terminal, reports, discounts, drawer, and order use cases.
- `backend/src/modules/pos/repositories/posRepository.js`: POS data access.
- `backend/src/modules/inventory/commands/stockCommandService.js`: Inventory-owned stock mutation commands.
- `backend/src/modules/inventory/usecases/*`: Item, barcode, folder, storefront catalog, and stock history workflows.
- `backend/src/modules/dgfy/usecases/dgfyAuthUseCases.js`: DGFY account, invitation, company switching, POS session, and handoff workflows.
- `backend/src/modules/dgfy/repositories/dgfyAccountRepository.js`: DGFY landlord account/membership persistence.
- `backend/src/modules/commercePayments/usecases/*`: PayMongo commerce payment/session/webhook/finalization logic.
- `backend/src/modules/storefrontDiscovery/usecases/storefrontDiscoveryUseCases.js`: Storefront discovery behavior.
- `backend/src/middleware/tenantHandler.js`: Tenant resolution and request context binding.
- `backend/src/utils/TenantConnector.js`: Tenant DB connection lifecycle.
- `frontend/src/services/api.js`: Frontend Axios client, refresh retry, and API error handling.
- `frontend/src/services/browserSession.js`: Browser token, CSRF, refresh, and standalone POS session behavior.
- `frontend/src/features/pos/services/posService.js`: POS frontend API client.
- `apps/dgfy-api/src/modules/dgfyAuth/usecases/dgfyAuthUseCases.js`: Standalone service DGFY auth use cases.

**Testing:**
- `backend/tests/`: Backend Jest tests and fixtures.
- `backend/tests/parity/dgfyAuthUseCases.parity.test.js`: DGFY auth parity between backend and standalone DGFY API.
- `frontend/src/features/*/__tests__/*`: Frontend feature unit/contract tests.
- `frontend/Pages/__tests__/*`: Page-level tests.
- `frontend/Components/**/__tests__/*`: Component tests.
- `frontend/tests/e2e/`: Playwright E2E tests.
- `apps/dgfy-api/tests/`: Standalone DGFY API tests.
- `release-controller/test/`: Release controller tests.
- `backend/scripts/check-architecture-guardrails.js`: Backend/module architecture guardrail test script.
- `backend/scripts/check-controller-boundaries.js`: Controller boundary guardrail script.

**Documentation:**
- `docs/START_HERE.md`: Mandatory documentation lookup entry.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`: Backend layering and boundary rules.
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`: Architecture governance and hardening process.
- `docs/architecture/adr/0001-modular-monolith-boundaries.md`: Modular monolith decision.
- `docs/architecture/adr/0003-migration-facade-strategy.md`: Compatibility facade migration strategy.
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md`: Catalog/Inventory/POS/Storefront ownership.
- `docs/architecture/adr/0026-browser-session-cookie-authority.md`: Browser session/cookie/CSRF authority.
- `docs/architecture/adr/0032-standalone-dgfy-api-service.md`: Standalone DGFY API boundary.

## Naming Conventions

**Files:**
- Backend route files use domain names in lower camel/camel words: `backend/src/routes/commercePayments.js`, `backend/src/routes/storefrontDiscovery.js`.
- Legacy backend controllers use `*Controller.js`: `backend/src/controllers/posController.js`.
- Module handlers use `*Handlers.js`: `backend/src/modules/pos/controllers/posHandlers.js`.
- Module use cases use `*UseCases.js` for aggregate builders or specific `*UseCase.js` files: `backend/src/modules/dgfy/usecases/dgfyAuthUseCases.js`, `backend/src/modules/inventory/usecases/createItemUseCase.js`.
- Module repositories use `*Repository.js`: `backend/src/modules/pos/repositories/posRepository.js`.
- Sequelize models use PascalCase singular names: `backend/src/models/PosTransaction.js`, `backend/src/models/Landlord/DgfyAccount.js`.
- React components/pages use PascalCase `.jsx` or `.tsx`: `frontend/src/features/pos/pages/TerminalPage.jsx`, `mobile/hardware-pos/src/app/App.tsx`.
- Frontend utility/service modules use camelCase: `frontend/src/services/browserSession.js`, `frontend/apps/store/src/defaultStorefrontRoute.js`.
- Tests use `.test.js`, `.test.jsx`, `.contract.test.js`, `.integration.test.jsx`, or `.behavior.test.jsx` according to scope.

**Directories:**
- Backend modules use lower camel/camel domain names: `backend/src/modules/commercePayments`, `backend/src/modules/storefrontDiscovery`, `backend/src/modules/tenantLocations`.
- Module subdirectories follow layer names: `controllers`, `usecases`, `repositories`, `contracts`, `domain`, `services`, `utils`.
- Frontend feature directories use lower camel domain names: `frontend/src/features/stockMovements`, `frontend/src/features/jobOrders`.
- Vite app directories use simple app names: `frontend/apps/pos`, `frontend/apps/store`, `frontend/apps/skupervisor`.
- Top-level deployable app directories should use `apps/<name>` for new services, following `apps/dgfy-api`.

## Where to Add New Code

**New Backend Feature:**
- Primary code: `backend/src/modules/<domain>/`
- Route wiring: `backend/src/routes/<domain>.js` and route mount in `backend/src/server.js` when a new endpoint group is needed.
- Transport handlers: `backend/src/modules/<domain>/controllers/*Handlers.js`
- Business logic: `backend/src/modules/<domain>/usecases/*UseCase.js` or `*UseCases.js`
- Data access: `backend/src/modules/<domain>/repositories/*Repository.js`
- Tests: `backend/tests/` or module-specific existing test pattern if present.
- Documentation: `backend/src/modules/<domain>/README.md` when adding or materially changing a module.

**Backend Compatibility Change:**
- Primary code: Prefer `backend/src/modules/<domain>/`.
- Facade glue: Use `backend/src/controllers/*.js` or `backend/src/services/*.js` only when preserving an existing route/service contract during migration.
- Guardrail proof: Run `npm run check:architecture` for architecture-sensitive changes.

**New Sequelize Model:**
- Tenant-local model: `backend/src/models/<ModelName>.js`, registered in `backend/src/models/index.js` and tenant model factory paths.
- Landlord model: `backend/src/models/Landlord/<ModelName>.js`, registered in `backend/src/models/index.js`.
- Migration: `backend/migrations/*.cjs`.
- Repository access: Use `backend/src/modules/<domain>/repositories/*Repository.js`; do not import models in controllers.

**New Frontend Skupervisor Feature:**
- Primary code: `frontend/src/features/<feature>/`.
- Page route: import and route from `frontend/src/main.jsx`.
- API client: `frontend/src/features/<feature>/api/*Api.js` or existing shared service if already established.
- Shared component: `frontend/Components/<domain>/` if it must integrate with legacy shared component surfaces; otherwise prefer feature-local components.
- Tests: `frontend/src/features/<feature>/__tests__/`.

**New Standalone POS Feature:**
- Primary UI: `frontend/src/features/pos/`.
- POS app route/shell: `frontend/apps/pos/src/main.jsx` only for app-shell routing changes.
- Backend API: `backend/src/modules/pos/` and `backend/src/routes/pos.js`.
- Hardware bridge: `backend/device-bridge/` only for host hardware operations.
- Tests: `frontend/src/features/pos/__tests__/`, `frontend/tests/e2e/pos`, and backend POS tests as applicable.

**New Storefront Feature:**
- Public app code: `frontend/apps/store/src/`.
- Shared/account/frontend service code: `frontend/src/services/*` only when behavior crosses Skupervisor/POS/Storefront.
- Backend Storefront logic: `backend/src/modules/store`, `backend/src/modules/storefrontDiscovery`, `backend/src/modules/commercePayments`, or Inventory/Catalog/POS modules according to ownership.
- Tests: `frontend/apps/store/src/__tests__/` if app-local, otherwise feature/service tests under `frontend/src`.

**New DGFY Account / Company Access Feature:**
- Backend primary code: `backend/src/modules/dgfy/`.
- Landlord persistence: `backend/src/modules/dgfy/repositories/dgfyAccountRepository.js` plus landlord models/migrations.
- Standalone mobile API counterpart: `apps/dgfy-api/src/modules/dgfyAuth/` only when the auth-only mobile contract changes.
- Parity tests: update `backend/tests/parity/dgfyAuthUseCases.parity.test.js` for duplicated auth behavior.

**New Standalone Service:**
- Primary code: `apps/<service-name>/`.
- Dockerfile: `infrastructure/docker/<service-name>/Dockerfile`.
- Compose wiring: `infrastructure/docker/docker-compose.yml` and local compose stacks as needed.
- Architecture guardrail integration: root `package.json` `check:architecture:*` script when the service uses backend module conventions.

**New Native / Hardware POS Code:**
- React Native/hardware runtime: `mobile/hardware-pos/src/`.
- Android wrapper changes: `android/imin-wrapper/app/src/`.
- Legacy standalone wrapper: `Standalone POS/` only when maintaining that surface.
- Backend sync/API support: `backend/src/modules/pos/`, `backend/src/routes/mobilePos.js`, and `backend/src/modules/pos/usecases/mobilePosUseCases.js`.

**Utilities:**
- Backend shared utilities: `backend/src/utils/` for technical helpers; `backend/src/modules/shared/` for module-owned shared business support.
- Frontend shared utilities: `frontend/src/utils/` or `frontend/src/lib/`.
- Feature-local utilities: keep inside `frontend/src/features/<feature>/utils/` or `backend/src/modules/<domain>/utils/` when not broadly reusable.
- Root automation utilities: `scripts/`.

## Special Directories

**`.planning/codebase/`:**
- Purpose: Generated architecture/structure/stack/testing/convention/concern maps for GSD workflows.
- Generated: Yes
- Committed: Yes, when the orchestrator chooses to commit planning artifacts.

**`docs/archive/`:**
- Purpose: Historical/non-authoritative documentation.
- Generated: No
- Committed: Yes
- Usage: Do not use as a planning source for new architecture decisions.

**`dist-apps/` and `frontend/dist/`:**
- Purpose: Built frontend outputs.
- Generated: Yes
- Committed: Repository currently contains build output directories; avoid hand-editing generated assets.

**`frontend/playwright-report/`, `frontend/test-results/`, `artifacts/rendered-qa/`:**
- Purpose: Test and rendered QA evidence.
- Generated: Yes
- Committed: Evidence policy depends on workflow; do not treat as source code.

**`backend/uploads/` and `backend/storage/`:**
- Purpose: Runtime uploads and temporary export/storage data.
- Generated: Mixed runtime data.
- Committed: Only placeholders or intentional fixtures should be committed.

**`backend/logs/` and `logs/`:**
- Purpose: Runtime logs.
- Generated: Yes
- Committed: No for ordinary runtime log output.

**`node_modules/`, `backend/node_modules/`, `frontend/node_modules/`, `apps/dgfy-api/node_modules/`:**
- Purpose: Installed dependencies.
- Generated: Yes
- Committed: No.

**`.env` files and compose env fixtures:**
- Purpose: Environment configuration.
- Generated: No
- Committed: Only safe examples/fixtures should be committed. Do not read, quote, or copy secret values from `.env`, `.env.*`, `*.env`, or credential files.

**`backups/`, `output/`, `System_Audit/`, `releases/`:**
- Purpose: Operational backups, generated outputs, audit material, and release artifacts.
- Generated: Mixed.
- Committed: Treat as workflow artifacts; do not use as primary architecture source unless explicitly authoritative.

**`.codex/skills/`:**
- Purpose: Repo-local skill instructions for agents.
- Generated: No
- Committed: Yes.
- Key file: `.codex/skills/web-performance-qa/SKILL.md`.

---

*Structure analysis: 2026-07-10*
