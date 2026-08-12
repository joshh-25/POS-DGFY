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

## Dependency Audit Gates

Dependency vulnerability audits are mandatory release evidence.

Required commands:
1. `npm run audit:dependencies:prod`
2. `npm run audit:dependencies`

Evidence semantics:
1. The production audit blocks production packaging when root, backend, or frontend shipped dependency trees contain known npm advisory vulnerabilities.
2. The full audit blocks release readiness when dev/test tooling contains known npm advisory vulnerabilities, because the toolchain is part of release evidence generation.
3. A green audit proves the locked dependency trees have no known npm advisories at execution time. It does not prove packages are vulnerability-free outside the npm advisory database.

## Browser Session Security Gates

Browser session security evidence is mandatory for auth, POS, DGFY, storefront, or admin changes.

Required commands:
1. `npm --prefix backend test -- --runTestsByPath tests/browserSessionCookies.test.js`
2. `npm --prefix backend test -- --runTestsByPath tests/rtr_verification.test.js`
3. `npm --prefix apps/dgfy-web test -- --run src/services/__tests__/browserTokenStorage.guard.test.js`
4. For DGFY-to-SKUpervisor tenant-session handoff, tenant-session rate limiting, or tenant refresh routing changes: `npm --prefix backend test -- --runTestsByPath tests/rateLimiter.behavior.test.js tests/dgfyTenantSession.transport.test.js tests/dgfyAdminAccountRoutes.contract.test.js tests/tenantHandler.emailOtp.test.js tests/browserSessionCookies.test.js`
5. For DGFY account company switching or invitation Business-tab changes: include backend DGFY company-list/switch/invitation tests, `tests/dgfyAuthMiddleware.test.js` for the IMS tenant-session membership bridge, frontend IMS switcher tests, Storefront account Business-tab tests, and browser storage guards proving DGFY, refresh, tenant, and company tokens are not persisted in browser-readable storage.
6. For explicit DGFY sign-out or customer-login launcher changes: `npm --prefix apps/dgfy-web test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx --testTimeout 30000`. This proves `reason=signed-out` suppresses cookie auto-restore, only the signed-out email is prefilled, the password remains blank for browser password managers, and discovery/storefront **Log in / Sign up** does not reopen the old dashboard.

Evidence semantics:
1. Backend cookie tests prove refresh/session authority is issued and cleared with the ADR 0026 cookie attributes.
2. RTR tests prove refresh authority is cookie-only, CSRF-protected, rotated on use, and replay-rejected.
3. Frontend storage guards prove privileged tenant, refresh, DGFY, storefront, and admin tokens are not persisted in browser-readable storage.
4. Tenant-handler and DGFY tenant-session transport tests prove the one-click company-registration handoff sets normal tenant cookies and that `/auth/refresh-token` can recover tenant context from a signed tenant-bound refresh cookie when the companion tenant-context cookie is missing. `rateLimiter.behavior.test.js` proves the DGFY tenant-session limiter is scoped to authenticated account plus tenant instead of the generic credential-login bucket. `dgfyAuthMiddleware` tests prove direct IMS sessions can load business switching only through an accepted DGFY membership row and cannot infer account ownership from matching email or mobile data.
5. Frontend API interceptor tests prove protected requests preflight cookie-backed session refresh after hard reload when the in-memory access token is empty.
6. Backend auth tests prove login and refresh responses include `data.company.token` when tenant context is available, allowing the frontend to restore the company-token header without browser-readable tenant-token persistence.
7. These gates do not prove all XSS vectors are impossible; CSP and input/output encoding reviews remain required for UI changes.

## PayMongo Webhook Security Gates

PayMongo webhook integrity evidence is mandatory when subscription/payment workflows or payment-provider configuration change.

Required command:
1. `npm --prefix backend test -- --runTestsByPath tests/paymongoWebhookSignature.test.js`

Evidence semantics:
1. Service-level tests prove PayMongo webhook verification rejects missing secrets, missing signatures, invalid signatures, stale timestamps, and mode-mismatched signatures.
2. Use-case tests prove invalid PayMongo signatures are rejected before webhook-log creation or payment/subscription mutation.
3. Replay tests prove already processed PayMongo events return an idempotent response without repeating payment mutation.
4. These gates do not prove live PayMongo delivery, provider dashboard configuration, child-account webhook registration, parent/platform merchant identity, split-payment marketplace capability, or settlement correctness.
5. Live QR Ph split checkout must stay disabled unless PayMongo externally confirms the DGFY parent merchant ID plus live split-payment capability and production sets `PAYMONGO_LIVE_PLATFORM_SPLIT_CONFIRMED=true` or `PAYMONGO_PLATFORM_SPLIT_CONFIRMED=true`. Current provider evidence is negative: PayMongo support confirmed on June 25, 2026 that Linked Accounts is not configured for the account and self-service onboarding is still under development.

## Production Env Security Gates

Production env validation evidence is mandatory when authentication, payments, browser sessions, hosting profiles, deploy scripts, PM2 startup, or production configuration changes.

Required commands:
1. `npm run check:production-env`
2. `npm --prefix backend test -- --runTestsByPath tests/productionEnvValidation.test.js tests/productionEnvGuard.test.js tests/hostingProfilePreflight.test.js`

Evidence semantics:
1. Production validation tests prove missing or invalid required values fail closed before the backend accepts traffic.
2. Startup guard tests prove failing output names variables and validation reasons without logging secret values.
3. Fixture validation proves shared, VPS, and payment-enabled PayMongo production env shapes stay valid without requiring real production secrets in CI.
4. These gates do not prove the live server has correct secret values; deploy must still validate the real `backend/.env` on the target host.

## DGFY Company Access And Legacy Invitation Gates

DGFY company-access evidence is mandatory for company registration handoff, platform-admin assisted provisioning, user-management invitation, Settings, AI user-management, company switching, ownership transfer, legacy linking, and POS unlock changes.

Required commands:
1. `npm --prefix backend test -- --runTestsByPath tests/settingsCompanyInfo.usecase.test.js tests/settingsHandlers.companyInfo.test.js tests/userManagementToolRegistry.test.js tests/aiTools.test.js tests/emailTemplates.invitation.test.js`
2. `npm --prefix backend test -- --runTestsByPath tests/authTenantIsolation.hardening.test.js tests/authUsecases.applicationResult.test.js tests/tenantHandler.emailOtp.test.js tests/emailOtpService.test.js`
3. `npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js tests/dgfyLegacyLinkService.test.js tests/dgfyTenantSession.transport.test.js tests/auth.test.js`
4. `npm --prefix apps/dgfy-web test -- --run Pages/__tests__/AcceptInvite.test.jsx Components/users/__tests__/UserManagementModal.rbacContract.test.js`
5. `npm --prefix apps/dgfy-web test -- --run src/features/pos/__tests__/TerminalLockDrawer.dgfy.test.jsx Components/users/__tests__/UserInvitationModal.dgfy.test.jsx src/services/__tests__/dgfyAuthService.cookieSession.test.js --testTimeout 20000`
6. For platform-admin assisted provisioning: `npm --prefix backend test -- --runTestsByPath tests/dgfyAdminAccountUseCases.test.js tests/adminAssistedProvisioningUseCase.test.js tests/dgfyAdminAccountRoutes.contract.test.js tests/adminAssistedProvisioningRoutes.contract.test.js tests/tenantAdminAuditLogActions.contract.test.js`
7. For the Tenant Manager and DGFY Accounts admin panels: `npm --prefix apps/dgfy-web test -- --run src/services/__tests__/adminService.adminOperations.contract.test.js src/pages/__tests__/DgfyAccountManager.integration.test.jsx src/pages/__tests__/TenantManager.capabilities.integration.test.jsx`
8. `npm run smoke:dgfy-access-ui` after local IMS, POS, and Storefront dev or preview servers are running.
9. `DGFY_ACCESS_STRICT_NETWORK=true npm run smoke:dgfy-access-ui` for seeded local-stack or staging proof; local HTTPS-enforced backend smoke may also set `DGFY_ACCESS_FORWARDED_PROTO=https`.
10. `npm --prefix apps/dgfy-web run build:skupervisor`, `npm --prefix apps/dgfy-web run build:store`, and `npm --prefix apps/dgfy-web run build:pos`.

Evidence semantics:
1. Settings company-info tests prove the API no longer returns `registration_link`.
2. AI tests prove the retired `get_company_join_link` tool cannot generate company-token registration URLs.
3. Email-template and user-management tests prove new DGFY invitations do not expose manual links or `company_token`; the old `/accept-invite?token=...` route is compatibility-only and must remain non-mutating for new business onboarding.
4. Backend DGFY tests prove account search safe fields, DGFY-only invitation creation, accept/reject, leave, ownership transfer, legacy grace, POS session authorization, owner-transfer demotion, and no normal email-fallback tenant-session authentication.
5. Platform-admin assisted provisioning tests prove public OTP rules remain unchanged, admin-created DGFY accounts use temporary-password state, ownerless tenants cannot issue DGFY/POS sessions, combined provisioning creates explicit accepted membership, force assignment targets an active account id, and audit snapshots exclude secrets.
6. Frontend invitation/POS/service tests prove the IMS invite modal selects registered DGFY accounts, DGFY auth service errors stay scoped away from generic tenant global toasts, development auto-login is opt-in and excluded from DGFY/POS lock entrypoints, and the POS drawer exposes DGFY sign-in, company, terminal, and legacy-grace states.
7. Admin frontend tests prove Tenant Manager separates Company-only from DGFY+Company provisioning, reason fields are required, DGFY Accounts creation shows temporary-password state, and owner/company/account submit boundaries do not trigger adjacent actions.
8. The rendered smoke writes structured JSON under `.tmp/rendered-qa/dgfy-access/` plus desktop/mobile screenshots. Default mode is frontend-only and records API failures as diagnostics; strict mode fails on 5xx network responses for full-stack evidence.
9. These gates do not prove all historically issued links have expired, that POS hardware bridges are device-proven after DGFY unlock, or that every admin-created merchant has accepted current legal terms. Seeded UAT must still cover legal acknowledgement before owner-authorized self-service, receipt printing, cash drawer, iMin warnings, shift state, terminal policy denial, and offline queue replay.

## Frontend Contract Gates

Frontend contract evidence is mandatory for release readiness and for changes touching Storefront discovery, DGFY account surfaces, admin auth, hospitality mode, F&B POS/storefront behavior, purchase-order receipt valuation, marker rendering, or follow controls.

Required commands:
1. `npm run test:frontend:contracts`
2. `npm run test:frontend`

Evidence semantics:
1. The focused contract gate covers the admin interceptor, hospitality storefront integration, marker preview coordinates/fallbacks, F&B checkout/storefront contracts, discovery endpoint/abort behavior, follow/profile/discovery-header interactions, and PO receipt valuation.
2. The full frontend suite proves the focused contract gate does not pass only in isolation and that adjacent frontend suites still execute together.
3. The local release gate runs `npm run test:frontend:contracts` through `scripts/gate-release-local.js`.
4. These gates do not prove browser visual parity, live map-provider behavior, or production account-provider behavior; manual/browser QA remains required where visual placement or live provider interaction matters.

## Tenant Capability Messaging Gate

Tenant capability messaging evidence is mandatory when changing platform-admin IMS/POS/Storefront capability controls, tenant-visible disabled-state UI, global API error normalization, POS terminal availability messaging, or Storefront access-mode blocked-action copy.

Required commands:
1. From `apps/dgfy-web/`: `npm exec vitest run src/utils/__tests__/tenantCapabilityMessages.test.js src/utils/__tests__/errorHandler.test.js src/components/common/__tests__/GlobalApiErrorListener.test.js src/components/common/__tests__/TenantCapabilityNotice.test.jsx src/components/common/__tests__/TenantCapabilityLayout.render.test.jsx src/components/common/__tests__/tenantCapabilityNotice.contract.test.js src/features/pos/__tests__/TerminalPageLayout.capabilityNotice.test.jsx src/features/pos/__tests__/terminalViewModeContracts.test.js src/services/__tests__/api.globalErrors.test.js apps/store/src/__tests__/customerAccess.test.js apps/store/src/__tests__/storefrontErrorMessages.test.js src/pages/__tests__/TenantManager.capabilities.integration.test.jsx -- --pool=threads`
2. `npm --prefix apps/dgfy-web run build:skupervisor`
3. `npm --prefix apps/dgfy-web run build:pos`
4. `npm --prefix apps/dgfy-web run build:store`
5. `npm run lint:docs`
6. `npm run check:architecture`
7. `npm run check:compliance`
8. `git diff --check`

Evidence semantics:
1. The focused Vitest set proves backend `code` / `error_code` compatibility is normalized for `TENANT_CAPABILITY_DISABLED` and `CUSTOMER_ACCESS_MODE_BLOCKED`, tenant-wide IMS notices render after settings hydration or blocked-action events, POS terminal surfaces show POS-specific blocked copy, Storefront catalog/checkout helpers use mode-specific public copy, and Tenant Manager shows capability impact before the audit reason is submitted.
2. The three frontend builds prove the shared message utility resolves in SKUpervisor, POS, and Storefront bundles.
3. These gates do not prove proactive email, notification-center delivery, or production tenant behavior. V1 messaging is reactive in-app UI only, and backend route gates remain the enforcement source.

## Backend Test Matrix Gate

Backend matrix evidence is mandatory for release readiness and for changes touching backend auth, payment, compliance, POS/fiscal, tenant provisioning, storefront, inventory, reporting, AI tools, database integration, or platform services.

Required command:
1. `npm run test:backend:matrix`

Evidence semantics:
1. The matrix discovers active backend Jest test files from the backend Jest config, then runs them in bounded groups with one file per chunk by default.
2. The matrix writes `.tmp/release-gates/<sha>/backend-test-matrix/backend_test_matrix.json` with target SHA, active test count, group count, schema preflight result, per-chunk duration, status, timeout, and log path.
3. Schema preflight must pass before test execution; it verifies the matrix is pointed at a test database and repairs only known test-schema drift needed for current suites.
4. The local release gate runs `npm run test:backend:matrix` through `scripts/gate-release-local.js`.
5. CI runs `node ../scripts/run-backend-test-matrix.js` from the backend job and uploads `.tmp/release-gates/<sha>/backend-test-matrix/**` as the backend matrix artifact.
6. A green matrix proves the backend Jest inventory completes under the configured chunk timeout in the local or CI test environment. It does not prove production database parity, live provider behavior, browser E2E assertions behind opt-in flags, or external compliance approval.

## Frontend Bundle Guard

Current bundle-gate expectations:
1. `npm run check:frontend-budgets` owns a fresh `npm --prefix apps/dgfy-web run build:all` execution by default, then enforces route-chunk ceilings for login, POS, terminal, and sales surfaces.
2. The gate requires all three current app artifact directories: `dist-apps/skupervisor/assets`, `dist-apps/pos/assets`, and `dist-apps/store/assets`. Falling back to a partial or legacy artifact set is not release evidence.
3. Freshness is checked against the build start time for every budgeted route chunk. A missing, renamed, or stale route chunk fails the gate before it can be treated as a passing budget verdict.
4. Prebuilt artifacts are allowed only through the explicit contract `npm run check:frontend-budgets -- --skip-build --built-after <ISO timestamp or epoch ms>`. This mode is for CI jobs that have already run the same multi-app build and need a timestamped freshness proof.
5. The default standalone report is `.tmp/frontend-budgets/frontend_budget_report.json`. The local release gate writes the release-owned report to `.tmp/release-gates/<sha>/frontend-budgets/frontend_budget_report.json`.
6. The shared MapLibre dependency is intentionally isolated as `vendor-maplibre-*`; it is large but lazy-loaded by map-picker surfaces and is checked against the dedicated build cap instead of being treated as a generic vendor regression.
7. Other vendor growth still remains actionable through the largest-chunk report.
8. After the PR #11 DGFY POS surface split, the budget gate enforces the renamed SKUpervisor POS route chunk and the standalone POS checkout chunk separately. Do not treat a missing or renamed route chunk as harmless without updating the budget script and recording new evidence in `docs/testing/pos-readiness-status.md`.
9. The merged frontend toolchain targets Vite 8 / `@vitejs/plugin-react` 6. Deterministic installs for frontend builds require a Node version accepted by that toolchain (`^20.19.0 || ^22.12.0 || >=24.0.0`), even though backend runtime support can remain broader.

## MapLibre Picker Runtime Gate

Use this focused gate when changing the shared IMS MapLibre picker used by onboarding primary-location setup and Settings > Storefront location editing:

1. `npm --prefix apps/dgfy-web test -- --run src/components/maps/__tests__/MapPinPicker.maplibre.test.jsx`
2. `npm --prefix apps/dgfy-web test -- --run src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx`

Evidence semantics:
1. The focused MapLibre suite proves the picker initializes with the shared Storefront MapLibre basemap over Iloilo City, preserves the Settings locked mode and onboarding first-pin adjust mode, keeps click/geolocation/drag coordinate updates inside the explicit adjust contract, ignores stale reverse-geocode responses, reverse-geocodes selected pins into editable address suggestions when possible, keeps coordinate updates usable when reverse geocoding fails, disables MapLibre's internal resize tracker for modal/panel teardown safety, skips unsafe hidden-container resize calls, and keeps the coordinate fallback usable when tile resource requests emit MapLibre errors.
2. The onboarding and Settings suites prove both user-facing surfaces still wire the shared picker into their location forms.
3. These gates do not prove live tile-provider availability, browser WebGL support, or production CSP/proxy parity; rendered browser QA remains required before claiming visual map parity.

## Item Image Carousel Gate

Use this focused gate when changing onboarding starter-item images, Storefront Catalog item images, or the shared selected-image carousel:

Commands:
1. `npm --prefix apps/dgfy-web test -- --run src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx src/features/inventory/__tests__/itemProductWizard.contract.test.js`

Expected evidence:
1. F&B onboarding exposes `Menu Item` as the first-login starter choice and submits the customer-facing `menu_item` preset.
2. Onboarding file selections append up to the five-image cap instead of replacing the existing selected set.
3. Onboarding and item create/edit surfaces render the selected-image carousel with a focused image, count/filename context, and one-by-one focused removal.
4. Storefront Catalog remains the single wizard image upload surface; POS Controls must not reintroduce a separate image uploader.

## Storefront Public Visibility Gate

Use this gate when changing tenant provisioning, onboarding primary-location setup, Settings > Storefront visibility controls, discovery indexing, or public storefront profile visibility.

Required commands:
1. `npm run audit:storefront-public-visibility -- --json`
2. `npm --prefix backend test -- --runTestsByPath tests/tenantProvisioning.storefrontBootstrap.test.js tests/onboardingUsecases.applicationResult.test.js tests/onboardingValidator.test.js tests/storefrontPublicVisibilityAuditService.test.js`
3. From `apps/dgfy-web/`: `npm exec vitest run src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx --pool=threads`
4. `npm run lint:docs`
5. `npm run check:architecture`
6. `npm --prefix apps/dgfy-web run build:skupervisor`
7. `git diff --check`

Evidence semantics:
1. The audit proves the current tenant data has no hidden tenant still indexed, no invalid or missing explicit `store_is_visible` setting, no visible map-published tenant missing an active primary pin, no stale indexed location, no legacy fallback-location publication beyond the governed compatibility path, and no `store_has_no_location=true` tenant still publishing public coordinates.
2. `-- --fail-on warning` may be used as a stricter pre-release gate when fallback-location publication should block promotion.
3. `-- --repair-missing-settings` only backfills an explicit setting that preserves current discovery-index exposure. It must not be used as a substitute for deciding whether a tenant should be public.
4. A green local audit does not prove production tenant data is clean. Production or canary release evidence must include the same audit against the target data plus public discovery/profile smoke for hidden and visible tenants.

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
- F&B operational readiness gate: `docs/testing/fnb-operational-readiness-qa.md`
- Current release checklist: `docs/testing/release-go-no-go-checklist.md`
- Latest execution evidence snapshot: `docs/testing/pos-e2e-uat-run-2026-04-16.md`
- Cross-app manual readiness runbook (IMS + POS + Store):
  - `docs/testing/manual-qa-readiness-runbook-pos-ims-store.md`

Repeatable DGFY POS split-surface smoke:
1. Start standalone POS locally, for example `npm --prefix apps/dgfy-web run dev:pos -- --port 5174`.
2. Run `npm run smoke:pos-terminal-ui`.
3. Expected proof:
   - desktop `1440x960`, tablet `820x1180`, and mobile `390x844` render terminal identity, POS catalog, current sale, and lock drawer
   - login form fields are editable
   - locked drawer blocks catalog actions until unlock
   - standalone `/sales` hands off to the SKUpervisor origin; production may complete that proof as an auth-guarded `/login` redirect when no SKUpervisor session is present
   - no console errors

Targeted DGFY POS split-surface contract checks:
1. Run `npm --prefix apps/dgfy-web test -- --run src/features/pos/utils/__tests__/checkoutSurfaceContract.test.js src/features/pos/__tests__/checkoutSurfaceParity.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/receiptContractConformance.contract.test.js`.
2. Expected proof:
   - standalone POS and SKUpervisor POS use the shared checkout payload builder
   - terminal ID, payment handoff, discount, F&B metadata, modifiers, kitchen station, and scan metadata stay aligned
   - DGFY fee label/rate and receipt fallback behavior stay centralized
   - receipt fiscal/non-fiscal rendering is driven only by explicit server `document_type` and `document_context`; `INV-`/`NFS-` invoice prefixes are not fiscal-status signals
   - intentional UI differences remain documented by contract assertions

Current price/cost readiness checks:
- POS, Storefront, Dispatch Orders, and barcode cart handoff require `default_sale_price > 0` for customer-facing sale lines.
- Missing or zero selling price must fail closed with setup/readiness feedback; customer sale flows must not use `cost_per_unit` as a fallback price.
- Cost fields remain internal evidence for stock movements, valuation, COGS, and profitability reporting.

Targeted UX regression tests for PO/JO quantity controls and numeric step policy:
1. `npm --prefix apps/dgfy-web test -- --run src/components/common/__tests__/NumberStepper.behavior.test.jsx`
2. `npm --prefix apps/dgfy-web test -- --run src/features/__tests__/poJoQuantityUx.contract.test.js`
3. `npm --prefix apps/dgfy-web test -- --run src/features/__tests__/numericStepperPolicy.contract.test.js`

Historical note:
- Early exploratory Phase 32 Gemini QA artifacts were archived to `docs/archive/testing/2026-02/`.
- Legacy receive-token verification notes were archived to `docs/archive/testing/2026-02/receive-token-fix-evaluation.md`.
- Legacy SKU expansion manual walkthrough notes were archived to `docs/archive/testing/2026-03/sku-expansion-manual-test-runbook-2026-03-31.md`.
- Dated release go/no-go snapshot was archived to `docs/archive/testing/2026-04/release-go-no-go-checklist-2026-04-21.md`.
- `docs/testing/release-go-no-go-checklist.md`'s historical evidence log was archived to `docs/archive/testing/2026-08/release-go-no-go-checklist-2026-08-12.md`; the live doc is now the `npm run gate:release:local` runbook (#375).
- Active POS readiness source of truth is `docs/testing/pos-readiness-status.md`; historical run logs remain evidence-only and must not be used as current behavior contracts.
- Latest DGFY POS/SKUpervisor surface split review and post-fix ratings are recorded in section `3.24` of `docs/testing/pos-readiness-status.md`.

## Compliance Activation Readiness E2E

For the guided compliance activation flow (Settings + POS blocker behavior), use:

Operational note:
1. Final Review documentary requirements are now completed in Settings > Compliance > Final review (upload or external URL). No repository edits are required for tenant activation paths.

1. Browser E2E (Chromium, desktop profile):
   - `npm --prefix backend run test:frontend-compliance-e2e`
2. Browser E2E matrix (Chromium, desktop + mobile profiles):
   - `npm --prefix backend run test:frontend-compliance-e2e:matrix`
3. Frontend component/integration coverage (compliance panel, settings remediation deep links, POS blocker contracts, admin review contracts):
   - `npm --prefix apps/dgfy-web test -- --run src/features/settings/__tests__/settingsDeepLink.contract.test.js src/pages/__tests__/Settings.deepLinking.integration.test.jsx src/features/compliance/__tests__/ComplianceProgramPanel.integration.test.jsx src/features/compliance/__tests__/complianceProgramContracts.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/receiptContractConformance.contract.test.js src/pages/__tests__/TenantManager.complianceReviewContracts.test.js src/services/__tests__/complianceService.preflight.test.js`
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
   - A `500` caused by missing nullable POS fiscal-prep fields such as `pos_transactions.buyer_tin` is runtime schema drift. Apply migrations, rerun `doctor:runtime`, and restart before treating compliance profile or incoming-order failures as product-state failures.
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
16. Verify Customer Access Mode enforcement behavior:
   - Keep `CUSTOMER_ACCESS_MODES_ENABLED=true` or unset for default production enforcement.
   - Use `CUSTOMER_ACCESS_MODES_ENABLED=false` only as a rollback switch. If rollback is active, set `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS` to a controlled tenant ID, company token, slug, or tenant name for canary re-enablement smoke.
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
npm --prefix apps/dgfy-web test -- apps/store/src/__tests__/checkoutRules.test.js apps/store/src/__tests__/customerAccess.test.js src/features/settings/__tests__/settingsDeepLink.contract.test.js src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx
```

Build and governance:
```bash
npm run lint:docs
npm run check:architecture
npm run build:store
npm --prefix apps/dgfy-web run build:skupervisor
git diff --check
```

## Platform Admin Manual Registration Review And QA Invoice Smoke

Use these checks when changing public company registration, Platform Admin identity/permissions, approval provisioning, applicant status/resubmission, or QA landlord invoicing.

Targeted backend suites:
```bash
npm --prefix backend test -- --runTestsByPath tests/registerCompanyRequestUseCase.autoApproval.test.js tests/companyRegistrationStatusUseCase.test.js tests/platformAdminUsersUseCase.test.js tests/platformAdminRouteClassification.test.js tests/platformInvoiceUseCases.test.js
```

Tenant provisioning/model graph suites:
```bash
npm --prefix backend test -- --runTestsByPath tests/tenantModelFactory.contract.test.js tests/tenantProvisioning.test.js
```

Platform-admin assisted provisioning suites:
```bash
npm --prefix backend test -- --runTestsByPath tests/adminAssistedProvisioningUseCase.test.js tests/adminAssistedProvisioningRoutes.contract.test.js
```

Fresh-schema proof:
1. Run a disposable MySQL tenant schema sync against the complete model graph when a mode adds tenant-local models or foreign keys.
2. Confirm the mode matrix covers every value in `WORKFLOW_MODE_VALUES`, including placeholder modes using conservative defaults.
3. Confirm a public submission creates a pending application without a tenant database or company-token capability.
4. Confirm approval provisions once, activation follows successful provisioning, and a failure remains retryable without a zombie tenant database.
5. Confirm delegated Platform Admin users cannot call routes outside their live database grants.
6. Confirm QA invoices remain `TEST-` numbered, cash-only, privately stored, hash-verified, and blocked from live fiscal/email behavior unless the QA delivery sink/allowlist is configured.

Targeted frontend suite:
```bash
npm --prefix apps/dgfy-web test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx apps/store/src/__tests__/businessRegistrationApprovalHandoff.contract.test.js src/features/pos/__tests__/serviceWorkerCaching.contract.test.js
```

Manual smoke:
1. Register a company from either `/register-company` or Storefront `/business/grow`.
2. Confirm the response/status route shows `Waiting for approval`, with no `Proceed to POS` action and no company token.
3. Confirm the Platform Admin tenant page can approve or reject with an audit reason and that rejection details are visible only to the submitting DGFY account.
4. After approval/provisioning succeeds, confirm the applicant status becomes `ready` and can start the normal tenant session.
5. Open `/admin/invoices` on a phone viewport, select an approved company, confirm company name/email autofill, enter the PHP amount, and create a QA draft.
6. Issue a cash invoice, inspect the stored PDF for `Payment details`, `DGFY platform fee`, the Sieitz seller block/logo, TEST-only warning, and red missing-fiscal placeholders.
7. Open standalone POS at `http://localhost:5174/terminal`; confirm required assets return `200`, no stale service-worker controller remains in development, and the rendered terminal is not blank.

## Platform Admin Compliance Lifecycle Smoke

Use these checks when changing Tenant Manager compliance actions, admin tenant lifecycle routes, compliance mode selection, downgrade/upgrade audit behavior, or `admin_compliance_mode_action` enrichment.

Targeted backend suites:
```bash
npm --prefix backend test -- --runTestsByPath tests/complianceModeDowngrade.usecase.test.js tests/adminForceNonCompliant.handler.test.js tests/adminForceNonCompliant.transport.test.js tests/rbacRouteCoverage.contract.test.js tests/checkComplianceImpactScript.integration.test.js
```

Targeted frontend suites:
```bash
cd apps/dgfy-web
npm exec vitest run src/pages/__tests__/TenantManager.forceNonCompliant.integration.test.jsx src/pages/__tests__/TenantManager.capabilities.integration.test.jsx src/pages/__tests__/TenantManager.compliancePartialLoad.integration.test.jsx
```

Governance gates:
```bash
npm run lint:docs
npm run check:architecture
npm run check:compliance
git diff --check
```

Expected behavior:
1. Legacy/no-mode tenants show one `Set compliance mode` action.
2. `non_compliant_active` tenants show `Move to compliant pending`.
3. `compliant_pending` and eligible `compliant_active` tenants show `Force non-compliant`.
4. “Make compliant” never sets `compliant_active`; it lands in `compliant_pending`.
5. Every lifecycle mutation requires an audit reason and fails closed if primary audit persistence is unavailable.
6. Tenant lookup/cache is invalidated after successful lifecycle mutation.
7. The modal copy states the operational effect: non-compliant POS uses non-fiscal slips, compliant pending waits for checklist activation, and force non-compliant disables fiscal output.

## Hosting Profile Smoke Tests

Use these tests whenever changing hosting profile env, Redis/cache behavior, AI export temp storage, auth blacklist failure mode, rate limiting, scheduler locks, health output, or Admin > Hosting.

Shared hosting degraded profile:
```bash
npm run check:production-env
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
npm run check:production-env
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
npm --prefix backend test -- --runTestsByPath tests/productionEnvValidation.test.js tests/productionEnvGuard.test.js tests/hostingProfilePreflight.test.js tests/tempFileService.local.test.js tests/healthService.test.js tests/authFailClosed.test.js tests/rateLimiterStoreMode.test.js tests/ai_export_e2e.test.js tests/securityTransport.middleware.test.js
```

Frontend/admin readiness check:
```bash
npm --prefix apps/dgfy-web run build
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

## Merge Adoption Gate

Use this whenever a release adopts PR, branch, or `merge-docs/` behavior and the final tree must prove both new behavior and preserved master behavior.

Standalone command:
1. `npm run check:merge-adoption -- --manifest path/to/merge-adoption.json`

No-staging release integration:
1. `MERGE_ADOPTION_MANIFEST=path/to/merge-adoption.json RELEASE_TARGET_SHA=<sha> npm run gate:release:no-staging`

Evidence semantics:
1. The manifest records each feature-area decision as `adopt`, `combine`, `preserve-master`, or `reject`.
2. The gate verifies required files, required strings, forbidden strings, and optional source-added file adoption/rejection.
3. A passing gate proves final-tree adoption evidence only. Production completion still needs deploy summary SHA parity, live runtime SHA health proof, frontend asset parity, and rendered/API QA for the affected surface.

## Local Readiness Gate

Use this local-only release readiness gate when you need deterministic project health evidence without remote QA dependency.

Command:
1. `npm run gate:release:local`

Output:
1. `.tmp/release-gates/<sha>/local_readiness.json`

## Production Observability Evidence

Use this gate to attach production traceability evidence to local and no-staging release artifacts.

Command:
1. `npm run gate:release:observability`

Output:
1. `.tmp/release-gates/<sha>/observability_evidence.json`

Default behavior:
1. Report mode, non-blocking for the first rollout.
2. Checks `/health`, request/trace header round-trip, `/metrics` when enabled, structured request logging configuration, incident bundle dry-run, deploy SHA evidence, and stale QA deploy-head review.
3. Set `OBSERVABILITY_GATE_MODE=enforce` after one successful production release proves the evidence workflow.

Incident bundle command:
1. `npm run evidence:incident -- --request-id <request_id> --since <iso> --until <iso> --surface <surface>`
2. Output: `.tmp/incident-bundles/<timestamp>-<slug>/`
