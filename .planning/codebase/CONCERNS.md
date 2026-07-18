---
status: reference
authority_level: reference
owner: gsd-codebase-mapper
last_reviewed: 2026-07-10
last_mapped_commit: c19885a7ca2f17474adc1b825eb94aa739bf9f27
applies_to: full_repo
topic: codebase_concerns
---

# Codebase Concerns

**Analysis Date:** 2026-07-10

## Tech Debt

**Expired architecture allowlist entries:**
- Issue: Architecture exceptions still exist with planned removal date `2026-06-30`, which is before this mapping date. ADR 0001 and `docs/architecture/ARCHITECTURE_BOUNDARIES.md` require the target flow `routes -> controllers -> usecases -> repositories -> models`, and `docs/architecture/ARCHITECTURE_GOVERNANCE.md` requires exceptions to carry an active removal plan.
- Files: `backend/src/config/architectureModelImportAllowlist.js`, `backend/src/config/architectureGuardrailsAllowlist.js`, `backend/src/modules/ai/aiCore.js`, `backend/src/modules/ai/usecases/toolHandlers/toolRegistryMap.js`, `backend/src/modules/payments/usecases/handleWebhookUseCase.js`, `backend/src/modules/payments/usecases/upgradeToPremiumUseCase.js`, `backend/src/modules/tenants/usecases/registerCompanyRequestUseCase.js`, `backend/src/modules/shared/controllers/useCaseResponder.js`
- Impact: Future phases can normalize stale exceptions as acceptable architecture, weakening the migration contract and making CI allowlists less meaningful.
- Fix approach: Remove each exception by moving model access into repositories and legacy service calls behind module-owned use cases; if an exception is still required, update the linked task, ADR/evidence, and planned removal date before merging dependent work.

**Oversized UI and use-case modules:**
- Issue: Several files combine routing, state orchestration, view rendering, business branching, and recovery behavior in one module.
- Files: `frontend/apps/store/src/StorefrontApp.jsx`, `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx`, `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`, `frontend/src/features/pos/pages/TerminalPage.jsx`, `backend/src/modules/pos/usecases/posUseCases.js`, `backend/src/modules/pos/repositories/posRepository.js`, `backend/src/modules/store/usecases/storeUseCases.js`
- Impact: Changes to Storefront, POS, payment, or fiscal flows have high regression risk because unrelated concerns share state and helper functions. Reviewers must reason through thousands of lines to validate a narrow change.
- Fix approach: Extract route/page sections, domain-specific hooks, and use-case files by workflow. Preserve existing tests while moving one user-facing flow at a time.

**Legacy script surface with hard-coded local assumptions:**
- Issue: Many operational scripts create Sequelize connections directly, assume local usernames/databases, or use historical tenant tokens for local/legacy workflows.
- Files: `backend/scripts/migrate_all_dbs.js`, `backend/scripts/find_data_champion.js`, `backend/scripts/scan_tenants_esm.js`, `backend/scripts/scan_tenants_data.js`, `backend/scripts/smoke-local-pos.js`, `backend/scripts/register_original_tenant.js`, `backend/scripts/audit_original_legacy_account.js`
- Impact: Operators can accidentally run scripts against the wrong database shape or propagate old tenant-token assumptions into new workflows.
- Fix approach: Move production-safe scripts behind validated env contracts, add dry-run defaults, and mark legacy-only scripts with explicit guardrails or archive them outside normal operations.

## Known Bugs

**Browser-token storage guard appears to fail against active admin code:**
- Symptoms: The guard test forbids `sessionStorage` reads/writes for `admin_token`, while active admin service code stores and reads that key.
- Files: `frontend/src/services/__tests__/browserTokenStorage.guard.test.js`, `frontend/src/services/adminService.js`
- Trigger: Run the frontend browser-token storage guard. The test scans `frontend/src` and includes patterns for `sessionStorage.setItem('admin_token')` and `sessionStorage.getItem('admin_token')`.
- Workaround: None detected. The admin auth surface should either move to cookie-backed authority or the guard/test contract must be updated with a documented exception, but ADR 0026 says admin tokens must not persist in browser-readable storage.

**Tenant schema drift has a recorded recurrence path:**
- Symptoms: Existing tenants can miss tenant-scoped columns after migrations, producing runtime errors such as missing POS catalog or POS transaction columns.
- Files: `docs/ops/BETA_TENANT_PROVISIONING_INCIDENT_2026-07-04.md`, `backend/scripts/sync-tenant-schemas.js`, `scripts/deploy.sh`, `backend/src/services/tenantProvisioningService.js`, `backend/migrations/20260629000001-add-pos-always-available-contract.cjs`
- Trigger: A migration adds tenant-scoped tables/columns, `npm run migrate` updates only the landlord DB, and deploy leaves `DEPLOY_TENANT_SCHEMA_SYNC_MODE` at the default `report` instead of applying declared tenant repairs.
- Workaround: Run `backend/scripts/sync-tenant-schemas.js --mode repair-apply` with an auditable report after tenant-scoped migrations. Keep `DEPLOY_TENANT_SYNC_REQUIRE_ZERO=1` so report-only drift blocks release.

**CSV import controller logs request upload metadata in production code:**
- Symptoms: Item CSV upload handling prints request body keys and the full Multer file object to stdout.
- Files: `backend/src/modules/csv/controllers/itemCsvImportHandlers.js`
- Trigger: Item CSV preview/import request with `csvContent` or file upload.
- Workaround: None detected. Replace debug `console.log` calls with structured logger messages that exclude raw file metadata and are disabled outside local debugging.

## Security Considerations

**Browser-readable admin and storefront/customer tokens conflict with cookie-authority ADR:**
- Risk: XSS can read `sessionStorage` tokens and the global DGFY customer token bridge. ADR 0026 requires production browser session authority for tenant, DGFY, storefront customer, and admin tokens to live in `HttpOnly` cookies, with JavaScript holding only short-lived in-memory access tokens.
- Files: `frontend/src/services/adminService.js`, `frontend/apps/store/src/auth/storefrontSessionStorage.js`, `frontend/apps/store/src/StorefrontApp.jsx`, `frontend/apps/store/src/services/requestJson.js`, `frontend/src/services/dgfyAuthService.js`, `docs/architecture/adr/0026-browser-session-cookie-authority.md`
- Current mitigation: Tenant API sessions use `frontend/src/services/browserSession.js` memory state plus cookie-backed refresh and CSRF handling. Storefront token cleanup removes legacy `localStorage` keys.
- Recommendations: Move admin and storefront/DGFY customer auth to the same cookie-backed session model; keep only in-memory bearer tokens; remove `admin_token`, `dgfy_store_customer_token`, and `dgfy_customer_account_token` persistence; extend guard tests to cover collection-based sessionStorage reads/writes for customer tokens as well as admin tokens.

**Admin API duplicates token handling instead of using unified browser-session client:**
- Risk: `frontend/src/services/adminService.js` manually stores a JWT, manually attaches `Authorization`, and manually adds CSRF headers. This duplicates the security-sensitive retry/session behavior already centralized in `frontend/src/services/api.js` and `frontend/src/services/browserSession.js`.
- Files: `frontend/src/services/adminService.js`, `frontend/src/services/api.js`, `frontend/src/services/browserSession.js`, `backend/src/modules/adminAuth/controllers/adminAuthHandlers.js`
- Current mitigation: Backend admin login sets an admin cookie in `backend/src/modules/adminAuth/controllers/adminAuthHandlers.js`, and `adminService` adds CSRF for unsafe methods.
- Recommendations: Make admin API requests cookie-first with bounded refresh/session bootstrap where needed, and delete browser-readable admin token usage.

**CSV template signing has a static fallback secret:**
- Risk: If neither `CSV_TEMPLATE_SIGNING_SECRET` nor `JWT_SECRET` is loaded in an isolated script/test/runtime path, template signatures fall back to a static string.
- Files: `backend/src/services/csvImportService.js`
- Current mitigation: Normal backend startup requires `JWT_SECRET` in `backend/src/services/authService.js` and production env validation checks critical secrets.
- Recommendations: Fail closed when no signing secret is configured outside tests. Use a test-only fallback gated by `NODE_ENV=test`.

**Direct DOM HTML injection is present in map and tracking surfaces:**
- Risk: Current call sites appear to inject locally generated SVG/HTML snippets, but `innerHTML` and `dangerouslySetInnerHTML` are fragile if future data-derived strings are added.
- Files: `frontend/apps/store/src/discoveryMapDom.js`, `frontend/apps/store/src/features/tracking/components/DeliveryTrackingView.jsx`, `frontend/apps/store/src/Components/DeliveryTrackingView.jsx`, `frontend/apps/store/src/StorefrontApp.jsx`, `frontend/src/components/maps/MapPinPicker.jsx`, `frontend/apps/store/src/Components/storefront/pages/DgfyCustomerAccountPage.jsx`
- Current mitigation: Most snippets are static icons or locally generated marker SVG.
- Recommendations: Keep dynamic text out of HTML strings, sanitize any future provider/customer fields, and prefer DOM node construction or React rendering for content-bearing markers/popups.

## Performance Bottlenecks

**Storefront monolith load and render cost:**
- Problem: The Storefront app root is over 22k lines and owns discovery, account state, checkout, tracking, maps, recent stores, auth resume, and POS launch behavior.
- Files: `frontend/apps/store/src/StorefrontApp.jsx`
- Cause: Many workflows are implemented in one React component tree with extensive local state and helper functions.
- Improvement path: Split into route-level modules and lazy-load heavy surfaces such as account, tracking, maps, checkout, and booking. Keep `frontend/tests/e2e/store/smoke.spec.js` and Storefront integration tests green after each extraction.

**POS terminal surfaces duplicate large offline/replay orchestration:**
- Problem: Standalone and Skupervisor POS checkout components both carry queue, replay, device, terminal, and checkout behavior.
- Files: `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`, `frontend/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx`, `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- Cause: Similar terminal-operation logic is embedded in components rather than a shared hook/service boundary.
- Improvement path: Extract shared terminal-operation orchestration into tested hooks/services under `frontend/src/features/pos/`, then leave components focused on rendering and event binding.

**Tenant schema repair can be expensive and lock-prone:**
- Problem: `alter` mode uses `tenantSequelize.sync({ alter: true })` across active tenants, and docs warn that automatic alters can hold metadata locks and produce temporary 500s.
- Files: `backend/scripts/sync-tenant-schemas.js`, `backend/src/server.js`, `docs/guides/SCRIPTS_GUIDE.md`
- Cause: Sequelize alter mode is broad and database-driven; declared repair mode is safer but depends on registry coverage.
- Improvement path: Prefer `repair-dry-run` and `repair-apply` with declared additive SQL in `backend/scripts/sync-tenant-schemas.js`; reserve full `alter` mode for controlled maintenance windows.

## Fragile Areas

**Tenant provisioning and existing-tenant schema lifecycle:**
- Files: `backend/src/services/tenantProvisioningService.js`, `backend/scripts/sync-tenant-schemas.js`, `backend/src/config/tenantSchemaCoverageExemptions.js`, `backend/tests/checkTenantSchemaRegistryCoverageScript.integration.test.js`, `scripts/deploy.sh`
- Why fragile: New tenants use `tenantSequelize.sync({ alter: true })`, existing tenants require a separate schema-sync path, and a July 2026 beta incident records the gap as recurring unless deploy automation applies tenant-scoped repairs.
- Safe modification: For every tenant-scoped migration, add registry entries in `backend/scripts/sync-tenant-schemas.js`, run the coverage script, run repair dry-run, and require zero drift before release.
- Test coverage: Registry coverage tests exist, but release safety still depends on deploy-time mode and report handling.

**POS fiscal compliance and terminal operations:**
- Files: `backend/src/modules/pos/usecases/posUseCases.js`, `backend/src/modules/pos/repositories/posRepository.js`, `backend/src/routes/pos.js`, `backend/src/modules/pos/services/posTerminalPairingService.js`, `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`, `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx`, `docs/architecture/adr/0025-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md`, `docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md`
- Why fragile: Fiscal issuing, reprint, void, eSales, terminal registration, shift state, device compatibility, and location grants are coupled to the same POS surface. ADR 0031 also distinguishes logical terminal selection from optional physical pairing, so route guards must be reviewed carefully when adding protected POS mutations.
- Safe modification: Keep new POS mutations behind explicit permissions, selected active terminal, terminal-location binding, location grants, compliance state, and open-shift checks. Do not add physical pairing as a normal checkout/shift-open requirement.
- Test coverage: POS use-case, pairing, cashier, route, fiscal, and E2E tests exist, but component size and cross-surface duplication increase untested interaction risk.

**PayMongo commerce payment readiness and settlement reconciliation:**
- Files: `backend/src/modules/commercePayments/usecases/commercePaymentAdminUseCases.js`, `backend/src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js`, `backend/src/modules/commercePayments/usecases/finalizePaidCommerceSession.js`, `backend/src/modules/store/usecases/storeUseCases.js`, `frontend/src/services/adminService.js`, `docs/architecture/adr/0027-paymongo-commerce-qrph-platform-split-settlement.md`, `docs/features/PAYMONGO_QRPH_COMMERCE_PAYMENTS.md`
- Why fragile: Provider readiness, wallet evidence, split evidence, webhook registration, refund state, manual-resolution statuses, and local order finalization all depend on external PayMongo facts.
- Safe modification: Preserve fail-closed readiness gates for `verification_reference`, `verified_at`, `wallet_status=enabled`, and `wallet_verified_at`; keep paid-but-not-finalized sessions in manual-resolution states; add provider evidence before enabling live QR Ph.
- Test coverage: `backend/tests/commercePaymentReadiness.usecases.test.js` and `backend/tests/paymongoWebhookSignature.test.js` cover core readiness/signature behavior, but sandbox certification and provider-controlled lifecycle still require external evidence.

**Cross-app browser session coordination:**
- Files: `frontend/src/services/api.js`, `frontend/src/services/browserSession.js`, `frontend/src/services/sessionCleanup.js`, `frontend/tests/e2e/cross-app/shared-session.spec.js`, `.codex/skills/web-performance-qa/SKILL.md`
- Why fragile: Multi-tab refresh coordination, CSRF rotation, POS standalone session behavior, BroadcastChannel logout, and tenant switching all interact. The local skill requires cross-app checks for Skupervisor, POS, Storefront, and session isolation.
- Safe modification: Use shared clients/helpers for all browser-authenticated requests. Do not broadcast tokens across tabs. Re-run cross-app and security E2E after auth/session changes.
- Test coverage: Unit and E2E coverage exists, but admin and storefront/customer token paths are not yet aligned with the cookie-authority model.

## Scaling Limits

**Per-process rate limiting state:**
- Current capacity: Rate limiters are configured in `backend/src/middleware/rateLimiter.js`; health reports expose store mode through `backend/src/services/healthService.js`.
- Limit: If Redis/shared store is unavailable or not configured, limits become process-local and weaken under horizontal scaling.
- Scaling path: Ensure production uses a shared rate-limit store, alert on fallback store mode, and include rate-limit store mode in deployment health gates.

**Tenant-by-tenant schema and audit jobs:**
- Current capacity: `backend/scripts/sync-tenant-schemas.js`, `backend/scripts/audit-tenant-index-headroom.js`, `backend/scripts/audit-fifo-drift.js`, and `backend/scripts/audit-location-stock-parity.js` iterate active tenants.
- Limit: Runtime grows with tenant count, and repair/alter modes increase lock and maintenance-window pressure.
- Scaling path: Keep concurrency bounded, emit per-tenant reports, separate report from repair, and add tenant batching for large production fleets.

## Dependencies at Risk

**Sequelize alter-based schema management:**
- Risk: `sync({ alter: true })` is convenient for provisioning and maintenance but risky for mature multi-tenant production schemas.
- Impact: Metadata locks, unreviewed schema changes, and tenant drift can break POS, Storefront, and onboarding flows.
- Migration plan: Continue moving tenant changes to explicit migrations plus declared repair SQL in `backend/scripts/sync-tenant-schemas.js`; keep `sync({ alter: true })` limited to new tenant provisioning and controlled maintenance.

**Manual PayMongo provider evidence:**
- Risk: Live QR Ph split checkout depends on provider-side child merchant, wallet, split, webhook, and sandbox evidence that the app cannot fully infer.
- Impact: Incorrect readiness can expose customer checkout before settlement/refund behavior is verified.
- Migration plan: Replace manual readiness bridges with PayMongo hosted/API onboarding, capability sync, webhook endpoint verification, and operator-visible evidence records.

## Missing Critical Features

**Automated tenant schema repair in deployment default:**
- Problem: Deploy currently defaults tenant schema sync to `report`, while existing-tenant repair requires `repair-apply`.
- Blocks: Safe rollout of tenant-scoped migrations without a manual post-deploy step.

**Cookie-backed admin and storefront/customer sessions:**
- Problem: Admin and Storefront customer/DGFY token paths are not fully using `HttpOnly` cookie authority.
- Blocks: Full closure of ADR 0026 and reliable browser-token storage guard enforcement.

**Provider-backed PayMongo live readiness automation:**
- Problem: Manual readiness and sandbox evidence remain a bridge for PayMongo child merchant and split-settlement readiness.
- Blocks: Confident live customer QR Ph split checkout at scale.

## Test Coverage Gaps

**Browser-readable token persistence guard drift:**
- What's not tested: The current guard does not appear reconciled with active admin token storage, and customer token sessionStorage arrays remain active.
- Files: `frontend/src/services/__tests__/browserTokenStorage.guard.test.js`, `frontend/src/services/adminService.js`, `frontend/apps/store/src/auth/storefrontSessionStorage.js`
- Risk: ADR 0026 regressions can persist or tests can stay red/ignored.
- Priority: High

**Tenant schema deploy mode coverage:**
- What's not tested: A release-level proof that tenant-scoped migration registry entries are applied, not only reported, for existing tenants.
- Files: `scripts/deploy.sh`, `backend/scripts/sync-tenant-schemas.js`, `backend/tests/tenantSchemaSyncScripts.test.js`, `backend/tests/checkTenantSchemaRegistryCoverageScript.integration.test.js`
- Risk: Existing tenants break after migrations that pass landlord migration tests.
- Priority: High

**Large Storefront/POS component interaction coverage:**
- What's not tested: Full matrix coverage across Storefront account/order/checkout/tracking states and POS terminal/shift/offline replay states.
- Files: `frontend/apps/store/src/StorefrontApp.jsx`, `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`, `frontend/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx`, `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx`, `frontend/tests/e2e/store/smoke.spec.js`, `frontend/tests/e2e/pos/smoke.spec.js`
- Risk: Refactors or feature additions can break adjacent flows without focused test failures.
- Priority: Medium

**PayMongo external lifecycle certification:**
- What's not tested: Real provider evidence for QR Ph payment completion, child merchant activation, split acceptance, child webhook delivery, and refund/split-refund behavior.
- Files: `backend/src/modules/commercePayments/usecases/paymongoSandboxCertificationUseCase.js`, `backend/tests/commercePaymentReadiness.usecases.test.js`, `backend/tests/paymongoWebhookSignature.test.js`, `docs/architecture/adr/0027-paymongo-commerce-qrph-platform-split-settlement.md`
- Risk: App-level tests pass while provider configuration blocks live settlement.
- Priority: High

---

*Concerns audit: 2026-07-10*
