# Testing Docs

When to use:
1. Test/audit definitions and validation protocols
2. Measurement and telemetry verification rules
3. Production-readiness evidence

## Evidence Classification (Phase 65.2)

Use this table to avoid over-claiming what a green test run proves.

| Evidence type | Typical examples | What it proves | What it does not prove |
|---|---|---|---|
| Syntax / unit mocks | isolated use-case/service unit tests | Branch logic, error mapping, payload shaping | Real network/provider behavior, real user behavior |
| Transport/controller tests | handler transport contract tests | HTTP wiring, token/header forwarding, status/payload contracts | Provider reality, DB persistence parity in production |
| DB integration tests | `supertest` + real test DB suites | Route-level state transitions and telemetry persistence in controlled env | Production ingress parity, adoption/retention |
| Live sandbox tests (legacy/opt-in) | PayPal sandbox canary E2E suites | Real provider verification flow + backend transition contracts when payments are explicitly re-enabled | Production traffic behavior, customer engagement depth |
| Production evidence | reconciliation dashboards, longitudinal audits | Real-world behavior over time in deployed environment | Causal impact without controlled experiments |

## Claim Guardrail

Current approved claim language for subscription telemetry:
1. "Payment/subscription workflows are disabled by default; default quality gates validate the disabled contract."
2. "Legacy provider-specific billing telemetry checks exist as opt-in suites for explicitly re-enabled payment workflows."
3. "Selected backend-observed product usage events are recorded."

Disallowed claim language until production longitudinal evidence exists:
1. "This proves real-world engagement."
2. "This proves retention or adoption causality."

## POS UAT Signoff

Use this checklist for final cashier/admin acceptance before changing status from `in_progress`:

- `docs/testing/pos-e2e-uat-checklist.md`
- Canonical readiness state: `docs/testing/pos-readiness-status.md`
- Current release checklist: `docs/testing/release-go-no-go-checklist.md`
- Latest execution evidence snapshot: `docs/testing/pos-e2e-uat-run-2026-04-16.md`
- Cross-app manual readiness runbook (IMS + POS + Store):
  - `docs/testing/manual-qa-readiness-runbook-pos-ims-store.md`

Current price/cost readiness checks:
- POS, Storefront, Dispatch Orders, and barcode cart handoff require `default_sale_price > 0` for customer-facing sale lines.
- Missing or zero selling price must fail closed with setup/readiness feedback; customer sale flows must not use `cost_per_unit` as a fallback price.
- Cost fields remain internal evidence for stock movements, valuation, COGS, and profitability reporting.

Targeted UX regression tests for PO/JO quantity controls and numeric step policy:
1. `npm --prefix frontend test -- --run src/components/common/__tests__/NumberStepper.behavior.test.jsx`
2. `npm --prefix frontend test -- --run src/features/__tests__/poJoQuantityUx.contract.test.js`
3. `npm --prefix frontend test -- --run src/features/__tests__/numericStepperPolicy.contract.test.js`

Historical note:
- Early exploratory Phase 32 Gemini QA artifacts were archived to `docs/archive/testing/2026-02/`.
- Legacy receive-token verification notes were archived to `docs/archive/testing/2026-02/receive-token-fix-evaluation.md`.
- Legacy SKU expansion manual walkthrough notes were archived to `docs/archive/testing/2026-03/sku-expansion-manual-test-runbook-2026-03-31.md`.
- Dated release go/no-go snapshot was archived to `docs/archive/testing/2026-04/release-go-no-go-checklist-2026-04-21.md`.
- Active POS readiness source of truth is `docs/testing/pos-readiness-status.md`; historical run logs remain evidence-only and must not be used as current behavior contracts.
- Latest fee/branding contract hardening evidence is recorded in section `3.14` of `docs/testing/pos-readiness-status.md`.

## Compliance Activation Readiness E2E

For the guided compliance activation flow (Settings + POS blocker behavior), use:

Operational note:
1. Final Review documentary requirements are now completed in Settings > Compliance > Final review (upload or external URL). No repository edits are required for tenant activation paths.

1. Browser E2E (Chromium, desktop profile):
   - `npm --prefix backend run test:frontend-compliance-e2e`
2. Browser E2E matrix (Chromium, desktop + mobile profiles):
   - `npm --prefix backend run test:frontend-compliance-e2e:matrix`
3. Frontend component/integration coverage (compliance panel, settings remediation deep links, POS blocker contracts, admin review contracts):
   - `npm --prefix frontend test -- --run src/features/settings/__tests__/settingsDeepLink.contract.test.js src/pages/__tests__/Settings.deepLinking.integration.test.jsx src/features/compliance/__tests__/ComplianceProgramPanel.integration.test.jsx src/features/compliance/__tests__/complianceProgramContracts.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/receiptContractConformance.contract.test.js src/pages/__tests__/TenantManager.complianceReviewContracts.test.js src/services/__tests__/complianceService.preflight.test.js`
4. Backend residual-risk hardening suites (transport security, documentary readiness, incident dispatch):
   - `npm --prefix backend test -- backend/tests/securityTransport.middleware.test.js backend/tests/complianceRepository.documentaryReadiness.test.js backend/tests/complianceSecuritySignal.usecase.test.js backend/tests/complianceSecurityIncidents.usecase.test.js backend/tests/rbacRouteCoverage.contract.test.js backend/tests/posOperationReplayParity.usecase.test.js`

Use `RUN_BROWSER_E2E=true` only for browser-driven suites. Default backend test runs stay fast and deterministic, while release/main and nightly workflows execute enforced browser journey gates.

## IMS -> POS -> Sales Journey E2E

For the end-to-end cashier/admin continuity path (create item -> POS-ready -> checkout -> POS history -> Sales export), use:

1. Browser E2E (Chromium, desktop profile):
   - `npm --prefix backend run test:frontend-ims-pos-sales-e2e`
2. Browser E2E matrix with keyboard/screen-reader accessibility pass (desktop + mobile):
   - `npm --prefix backend run test:frontend-ims-pos-sales-e2e:matrix`

CI enforcement policy:
1. `main` and `release/*` pushes run the core desktop journey as a release gate before build/deploy stages.
2. Nightly schedule runs the matrix journey (desktop + mobile) for drift detection.
3. Failure artifacts (trace/video/screenshot) are uploaded and retained for 14 days (release gate) and 21 days (nightly).

## Startup Regression Guard (PM2 + Local)

Before running manual UAT after backend changes:

1. Ensure `backend/.env` has `DB_AUTO_SYNC=false`.
2. Apply DB changes through migrations (`cd backend && npm run migrate`).
3. Run runtime doctor (`cd backend && npm run doctor:runtime`) and confirm healthy.
4. Restart backend (`pm2 restart sku-backend`).
5. Verify health endpoint returns `200` before opening POS flows:
   - `http://localhost:5000/health`
6. Verify token validation endpoint returns `200`:
   - `http://localhost:5000/api/v1/auth/validate-token/token-original`
7. Verify login transport contract uses header-based tenant selection:
   - Request header: `x-company-token: token-original`
   - Request body: `{ "email": "admin@test.com", "password": "Admin123!" }`
   - Expected: `200`
   - Note: sending `company_token` in body is invalid and returns `422`.
8. Verify runtime-sensitive read endpoints return `200` after migration/restart:
   - `http://localhost:5000/api/v1/compliance/profile`
   - `http://localhost:5000/api/v1/compliance/artifacts`
   - `http://localhost:5000/api/v1/compliance/peripherals`
   - `http://localhost:5000/api/v1/pos/incoming-orders`
   - `http://localhost:5000/api/v1/sales/transactions`
9. Verify store checkout validation path is fail-closed:
   - `POST /api/v1/store/checkout` should return `422` for invalid/out-of-stock payloads, not `500`.
10. Verify storefront catalog location-scope compatibility path is fail-closed:
   - `GET /api/v1/store/catalog?limit=120&location_id=<active_location_id>` should return `200` for active tenants.
   - If tenant location-stock schema is not fully aligned yet, API must degrade to global availability computation (still `200`, never `500`).
11. Verify tenant storefront empty-state UX is explicit when no sellable items are configured:
   - Open `tenant-store/<slug>` for a tenant with zero storefront-visible sellable rows.
   - Expect a clear setup-state panel (`Storefront items are not set up yet`) instead of a silent/blank catalog grid.
12. Verify storefront search-on-empty state does not regress to blank content:
   - On a tenant with zero catalog rows, enter any catalog search query.
   - Expect explicit message (`No items are available to search yet`) and no blank/unstyled gap.
13. Verify POS location-scoped catalog compatibility path is fail-closed:
   - Use a tenant with temporary `item_location_stocks` table/column drift and call POS catalog reads with `location_id`.
   - Expected behavior: fallback to global stock compatibility view (no `500`, no forced all-zero stock overlay).
14. Verify `/store/catalog` explicit error codes for frontend guidance:
   - Invalid `location_id` should return `422` + `error_code=STORE_CATALOG_LOCATION_INVALID`.
   - Unexpected runtime failure should return `500` + `error_code=STORE_CATALOG_RUNTIME_ERROR`.
   - Frontend guidance for catalog errors must be code-driven (not message substring heuristics).
15. Verify Services Mode contracts for a Services tenant:
   - Authenticated `/api/v1/services/dashboard`, `/catalog`, `/bookings`, `/clients`, `/waitlist`, `/resources`, `/assignments`, and `/reminders` return `200`.
   - Public `/api/v1/store/services/catalog` returns service metadata and normalized intake schema.
   - Public `POST /api/v1/store/services/bookings` creates a booking/ticket and preserves ADR 0016 account prompt rules.
   - Public booking lookup by reference redacts customer contact fields.
   - `/api/v1/pos/catalog` includes `category=service` rows when `visible_in_pos` is not false, even with `current_stock=0`.
   - POS service checkout succeeds without stock deduction and uses the appointment order method when appropriate.
16. Verify Customer Access Mode rollout behavior before enabling production-wide:
   - Keep `CUSTOMER_ACCESS_MODES_ENABLED=false` for default production compatibility.
   - Set `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS` to a controlled tenant ID, company token, slug, or tenant name for canary smoke.
   - Re-run discovery index sync for that tenant after mode/settings changes.
   - Confirm discovery/profile rows include `customer_access_mode`, `effective_customer_access_mode`, `inventory_display_mode`, `access_capabilities`, limitation metadata, and `customer_access_modes_enabled=true`.
   - Confirm `ghost` tenants remain discoverable by store/profile fields but do not match by item search and return empty public catalog rows.
   - Confirm `catalog` and `inquiry` tenants can show catalog rows but cannot quote, checkout, book, or join service waitlists.
   - Confirm `transaction` tenants can still quote, checkout, and book subject to existing stock/location/compliance/payment gates.
   - Confirm raw `current_stock` and `cost_per_unit` are absent from public Storefront catalog payloads, and only `inventory_display` carries customer-facing stock text or display quantity.

This prevents transient startup-side `500` errors caused by runtime schema `alter` operations.

## Customer Access Mode Targeted Regression

Use these after changing customer access, inventory display, Storefront catalog, Settings, onboarding classifier, Services Mode booking, or discovery indexing.

Backend:
```bash
npm --prefix backend test -- onboardingRepository.schemaCompatibility.test.js catalogVisibilityPolicy.test.js storeUsecases.applicationResult.test.js servicesMode.usecases.test.js settingsValidator.customerAccessModes.test.js onboardingUsecases.applicationResult.test.js customerAccessPolicy.test.js storefrontDiscoveryRepository.test.js settingsHandlers.transport.test.js runtimeSchemaAuditService.test.js
```

Frontend:
```bash
npm --prefix frontend test -- apps/store/src/__tests__/checkoutRules.test.js apps/store/src/__tests__/customerAccess.test.js src/features/settings/__tests__/settingsDeepLink.contract.test.js src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx
```

Build and governance:
```bash
npm run lint:docs
npm run check:architecture
npm run build:store
npm --prefix frontend run build:skupervisor
git diff --check
```

## Tenant Registration Auto-Accept Smoke

Use these checks when changing company registration, tenant provisioning, auth login handoff, public registration rate limits, or `TENANT_REGISTRATION_APPROVAL_MODE`.

Targeted backend suites:
```bash
npm --prefix backend test -- --runTestsByPath tests/registerCompanyRequestUseCase.autoApproval.test.js tests/rateLimiter.behavior.test.js tests/adminTenantHandlers.transport.test.js tests/adminTenantLifecycle.integration.test.js
```

Tenant provisioning/model graph suites:
```bash
npm --prefix backend test -- --runTestsByPath tests/tenantModelFactory.contract.test.js tests/tenantProvisioning.test.js
```

Fresh-schema proof:
1. Run a disposable MySQL tenant schema sync against the complete model graph when a mode adds tenant-local models or foreign keys.
2. Confirm the mode matrix covers every value in `WORKFLOW_MODE_VALUES`, including placeholder modes using conservative defaults.
3. Confirm failed approval/auto-approval provisioning restores a retryable `pending` landlord status and drops zombie tenant databases.

Targeted frontend suite:
```bash
npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx
```

Manual smoke for an auto-standard environment:
1. Set `TENANT_REGISTRATION_APPROVAL_MODE=auto_standard`.
2. Register a new standard company from `/register-company`.
3. Confirm the tenant is created as non-loginable until provisioning completes, then returned as `status=active`.
4. Confirm the frontend calls the normal login API and lands on the authenticated app.
5. Confirm manual-login fallback pre-fills email and company token if the follow-up login fails.
6. Confirm premium/subscription registration still returns `503` with `PAYMENTS_DISABLED` while `PAYMENTS_ENABLED=false`.

## Hosting Profile Smoke Tests

Use these tests whenever changing hosting profile env, Redis/cache behavior, AI export temp storage, auth blacklist failure mode, rate limiting, scheduler locks, health output, or Admin > Hosting.

Shared hosting degraded profile:
```bash
npm run preflight:shared
npm run test:hosting:shared
```

Expected shared-mode evidence:
1. `REDIS_URL` is absent.
2. `AUTH_BLACKLIST_FAILURE_MODE=fail_open`.
3. `TEMP_FILE_STORAGE=local`.
4. Local AI export temp files are written under `backend/storage/temp-ai-exports/`, outside public `/uploads`.
5. `/health` and `/api/v1/health` expose Redis as not configured/not connected without failing the shared runtime.

Redis-capable VPS profile:
```bash
npm run preflight:vps
npm run test:hosting:vps
```

Expected VPS-mode evidence:
1. `REDIS_URL` is present.
2. `AUTH_BLACKLIST_FAILURE_MODE=fail_closed`.
3. Redis-connected runtime reports Redis-backed rate limits, distributed scheduler locks, and cache temp storage where applicable.
4. A Redis outage in `HOSTING_PROFILE=vps` degrades health instead of reporting a fully healthy runtime.

Targeted backend regression suites:
```bash
npm --prefix backend test -- --runTestsByPath tests/hostingProfilePreflight.test.js tests/tempFileService.local.test.js tests/healthService.test.js tests/authFailClosed.test.js tests/rateLimiterStoreMode.test.js tests/ai_export_e2e.test.js tests/securityTransport.middleware.test.js
```

Frontend/admin readiness check:
```bash
npm --prefix frontend run build
```

Manual UI verification:
1. Log in as an admin.
2. Open Admin > Hosting.
3. Confirm the page shows the intended profile, Redis state, blacklist mode, temp storage mode, rate-limit mode, scheduler lock mode, readiness checklist, runbook actions, and copyable diagnostics.

## Production Multi-Location Contract Smoke

Use this for pre-deploy and post-deploy production validation of multi-location stock/report contracts.

Command:
1. `npm run gate:release:prod-contracts`
2. `npm run gate:release:prod-contracts:env` (loads `.env.prod.local` first)

Recommended local setup:
1. `cp .env.prod.local.example .env.prod.local`
2. Set `PROD_COMPANY_TOKEN` to the current active production tenant token.
3. Run `npm run gate:release:prod-contracts:env`.

Script:
1. `scripts/verify-prod-multi-location.ps1`

Environment variables:
1. `PROD_COMPANY_TOKEN` (default `token-original`)
2. `PROD_EMAIL` (default `admin@test.com`)
3. `PROD_PASSWORD` (default `Admin123!`)
4. `PROD_AUTH_JWT` (optional, recommended during repeated runs to avoid auth rate limits)
5. `PROD_VERIFY_OUTPUT` (optional output JSON file path)

Operational note:
1. If the production tenant token has been rotated away from `token-original`, `PROD_COMPANY_TOKEN` must be set or the gate will fail with `TENANT_TOKEN_INVALID`.

Required pass checks:
1. `/items/{id}` detail contains `item_location_stocks`.
2. `/stock-movements/export?format=csv` header contains location columns (`Location` or `Movement Location`, plus `Source Location`, `Destination Location`).
3. `/reports/export?type=expiry&location_id=...` header contains `Location`.

## QA Multi-Location Contract Smoke

Command:
1. `npm run gate:release:qa-contracts`

Required environment:
1. `QA_BASE_URL` (required)
2. `QA_COMPANY_TOKEN` (optional default `token-original`)
3. `QA_EMAIL` / `QA_PASSWORD` (optional defaults)
4. `QA_AUTH_JWT` (optional)
5. `QA_VERIFY_OUTPUT` (optional output JSON path)

## QA Drill Outputs

Rollback drill:
1. `npm run drill:qa:rollback`
2. Output: `.tmp/release-gates/<sha>/rollback_drill_result.json`

Restore drill:
1. `npm run drill:qa:restore`
2. Output: `.tmp/release-gates/<sha>/restore_drill_result.json`

## No-Staging Verdict Contract

Aggregate gate:
1. `RELEASE_TARGET_SHA=<sha> npm run gate:release:no-staging`
2. With local QA env file:
   - `npm run gate:release:no-staging:qa-env`

Output:
1. `.tmp/release-gates/<sha>/release_verdict.json`

Pass condition:
1. `verdict` equals `pass` (or `bypassed` only with incident metadata).

## Local Readiness Gate

Use this local-only release readiness gate when you need deterministic project health evidence without remote QA dependency.

Command:
1. `npm run gate:release:local`

Output:
1. `.tmp/release-gates/<sha>/local_readiness.json`
