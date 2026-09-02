# Backend test-suite value audit

Status: informational (ungoverned doc, not an ADR)
Last updated: 2026-09-03
Owner: #1441

## 1. Purpose and scope

Issue #1441 asks the question none of the in-flight test-gate work answers: does every backend
test earn its cost, and can the set be reduced by subtraction rather than re-organized. This
document is that audit's output — a keep/consolidate/delete/trim/demote classification for every
active file in `apps/dgfy-api/tests/`, the rationale per cut, and measured before/after numbers for
the highest-confidence cuts applied in PR-A (this PR, Phase 252).

**Out of scope** (named explicitly so this audit isn't mistaken for covering them): test **speed**
(#1015), test **tiering mechanics** — fast vs. db, chunking, worker limits (#438), CI **wiring** for
the matrix (#1147/#1431), and the **test-matrix rot repair** that fixed a `--ci` snapshot false-pass
plus a worker-memory OOM (#1432). Those projects ask "does the suite run efficiently and reliably";
this audit asks "does the suite need to exist at the size it's at."

**PR sequence.** This work ships as four PRs cut from each other's heads, each opened against
`develop`: **PR-A** (this PR, Phase 252) — the audit tool, this doc, and the 11 deletions + 4
consolidations + 3 trims + 6 db-manifest demotions + 1 correctness fix that were high-confidence
enough to apply immediately. **PR-B** (Phase 253, planned) — a static-parse POS barrel-mock helper
so the two worst hand-enumerated-stub transport tests stop hand-maintaining ~135/~120 factory keys
each. **PR-C** (Phase 254, planned) — transport/source-text trims across the remaining ~20 files the
rule engine below flags, with every compliance-cited case left untouched. **PR-D** (Phase 255,
planned) — db-tier tenant-sync consolidation, the only cut that actually moves gate wall-clock. (Renumbered 2026-09-03 from the plan's original
250-253 — #1431's own Phase 250/251 entries merged into `develop` first and claimed those
numbers; see the ledger's Phase 252 entry for the full note.)

## 2. Method

**Tool.** `scripts/audit-backend-test-inventory.js` (`npm run audit:backend-tests` /
`audit:backend-tests:check` / `test:audit-backend-tests`) statically discovers
`apps/dgfy-api/tests/*.test.js` (excluding `.legacy.test.js`, mirroring `jest.config.cjs`'s own
`testPathIgnorePatterns`), computes per-file static signals, partitions against
`scripts/backend-db-dependent-tests.js`, and runs a first-match-wins rule engine plus
`scripts/backend-test-audit-overrides.js` for the judgment calls a static signal can't reproduce —
see section 4. It needs no `node_modules` to run `--check`, so it can sit in a doc-lint path later.

**Machine.** Apple Silicon Mac (`hw.ncpu` and full detail recorded per run below), Node
`v22`/`v24` (container/host respectively — see the environment note below), MySQL 8.0.46.

**Environment note — this session's measurement setup differs from the plan's original host-side
assumption.** The plan called for host-side `127.0.0.1:3306`/`6379` runs against the already-running
`dgfy-mysql-test`/`dgfy-redis-test` containers. In this environment those containers publish no
host port; a Lima VM's own forwarder happened to be listening on the same host ports but for an
unrelated MySQL/Redis instance whose credentials didn't match — confirmed by `docker port` (no
mapping) plus an auth failure against the container's actual, verified `MYSQL_ROOT_PASSWORD`.
Per the coordinator's explicit direction, all **db-tier** measurement instead ran inside a `node:22`
container on the `dgfy-local-test` docker network, using the exact `DB_HOST=dgfy-mysql-test` /
`DB_PASSWORD=testpassword` invocation `docs/testing/release-go-no-go-checklist.md`'s containerized
gate path already documents. **Fast-tier** measurement ran host-side (Node v24) since it
deliberately pins `DB_HOST`/`DB_PORT` unreachable by design and needs no database at all.

**Pinned knobs.** `BACKEND_TEST_MATRIX_FAST_MAX_WORKERS=4`,
`BACKEND_TEST_MATRIX_FAST_WORKER_IDLE_MEMORY_LIMIT=1G`, `BACKEND_TEST_MATRIX_CHUNK_SIZE=8` (db
tier default, unchanged).

**DB-state equalization.** `npm run cleanup:test-tenants` (report/dry-run mode) before each side's
measurement, to record stale test-tenant rows without mutating shared state; one `npm run
test:backend:db` run first so any preflight schema repairs (`runSchemaPreflight`) are applied and
amortized before the timed runs.

**Runs.** One warm-up fast-tier run, then per side: 3× full `npm run test:backend:matrix`
(fast tier host-side, db tier container-side) for wall-clock, plus one per-file timing run per tier
(`--ci --json --outputFile --logHeapUsage --maxWorkers=4 --DB_PORT=1` for fast, `--runInBand` for
db) so the audit tool's `--jest-json`/`--heap-log` flags can report per-file duration and heap.
Section 5 states plainly whichever of these could not be completed in this session's time/compute
budget, rather than presenting an incomplete run as if it were the full protocol.

## 3. Signals

Per-file static signals: line count; case count (regex over `it`/`test` plus wrapper-alias
detection, e.g. `itIfRuntimeReady`); top-level `describe` titles (duplicate-stem detection);
`expect(` count; `expect(res...)`/`toHaveBeenCalled*` count (the transport-responder-only signal);
`readFileSync` + `toContain`/`toMatch` ratio (the source-text-only/mixed signal);
`jest.unstable_mockModule` factory stub count via brace-matching (the hand-enumerated-barrel
signal); `jest.fn(` count; supertest/snapshot usage; db-manifest membership;
`createTestTenant`/`landlordSchemaReadiness` use; `../src` import resolution on disk; filename
suffix; and citations from a repo-wide scan split into `live` / `historical` (leave-alone prefixes
per `docs/architecture/apps-layout-migration.md:173-184`) / `hardcoded` (the db manifest, the F&B
readiness gate, the promotion quality-gate workflow, `apps/dgfy-api/package.json`).

## 4. Rules and precedence

First match wins: **R0** an entry in `scripts/backend-test-audit-overrides.js` overrides everything
below it. **R1** pins — a hardcoded citation, db-manifest membership, or a snapshot guard — keep,
regardless of any other signal. **R3** `source-text-only` (no `../src` runtime import, text ratio
≥0.8) → delete; `duplicate-describe` (a top-level `describe` title shared with a filename-stem
sibling) → consolidate. **R4** `hand-enumerated-barrel` (≥40 mock factory stubs) → consolidate;
`source-text-mixed` (ratio 0.5–0.8) → consolidate; `transport-responder-only` (a `.transport` file,
≥90% of assertions are `res`/call assertions, ≤6 cases) → consolidate; `thin-file` (≤2 cases in
≥200 lines) → consolidate. **R5** default: keep, with a suffix-derived reason.

`scripts/backend-test-audit-overrides.js` carries the ~90-file manual classification pass done
while planning this issue — the judgment calls (e.g. "this file is *not* a subset of its sibling
because of a legacy alias") a static rule can't reproduce. It throws on a stale path the same way
the db manifest does, for delete/consolidate entries once the cut is actually applied.

<!-- backend-test-inventory:start -->

### Summary

Total active test files: **637** | db-manifest members: **30** | findings: **4**

### By classification

| Classification | Count |
| --- | --- |
| consolidate | 35 |
| delete | 18 |
| demote | 5 |
| keep | 576 |
| trim | 3 |

### By suffix

| Suffix | Count |
| --- | --- |
| (none) | 219 |
| unit | 62 |
| usecase | 52 |
| transport | 40 |
| contract | 33 |
| usecases | 30 |
| migration | 27 |
| applicationResult | 20 |
| integration | 13 |
| middleware | 12 |
| repository | 9 |
| route.contract | 5 |
| db.integration | 4 |
| schemaCompatibility | 3 |
| workflowMode | 2 |
| util | 2 |
| crossLayer.contract | 2 |
| security.contract | 2 |
| schema.contract | 2 |
| locationStockFallback | 2 |
| transactionsQuery | 2 |
| handler | 1 |
| cacheInvalidation | 1 |
| storeTemplateKey | 1 |
| ratelimit.e2e | 1 |
| hardening | 1 |
| phoneCompletionGate.middleware | 1 |
| subscriptionGate.middleware | 1 |
| idempotency | 1 |
| routeContracts | 1 |
| e2e.transport | 1 |
| documentaryReadiness | 1 |
| profileMerge | 1 |
| authorization | 1 |
| budgetFeature | 1 |
| checkoutFallback.unit | 1 |
| parity.unit | 1 |
| invitationSchema | 1 |
| slotEnforcement.unit | 1 |
| deliveryLog | 1 |
| deliveryProvider | 1 |
| companyApproved | 1 |
| invitation | 1 |
| loggingPolicy | 1 |
| route | 1 |
| routes | 1 |
| qa | 1 |
| complianceActivationReadiness.e2e | 1 |
| imsPosSalesJourney.e2e | 1 |
| sessionIsolation.e2e | 1 |
| tenantCompanyToken | 1 |
| alwaysAvailable | 1 |
| imageGeneration | 1 |
| publicRoutes.transport | 1 |
| simulateWebhook | 1 |
| disabled.transport | 1 |
| config | 1 |
| utils | 1 |
| catalogImages | 1 |
| transactionInclude.contract | 1 |
| foundation | 1 |
| validation | 1 |
| affiliateCode | 1 |
| deliveryAssignment | 1 |
| deliveryPersonnelRegistry | 1 |
| deliveryRun | 1 |
| discountPolicy | 1 |
| orderHistoryQuery | 1 |
| reportsOverviewQuery | 1 |
| terminalShiftIdentity | 1 |
| route.transport | 1 |
| behavior | 1 |
| autoApproval | 1 |
| registrationIndustry | 1 |
| poAnalysis | 1 |
| companyInfo | 1 |
| customerAccessModes | 1 |
| deliveryFeeMode | 1 |
| orderMethodFees | 1 |
| posHardwareProfile | 1 |
| posSoftwareIdentity | 1 |
| singleSettingArray | 1 |
| storefrontPromoDates | 1 |
| terminalRegistry | 1 |
| serviceMode | 1 |
| dgfyFallback | 1 |
| canonical | 1 |
| tenantIdentifier | 1 |
| equivalence.contract | 1 |
| fnbModifiers | 1 |
| follow | 1 |
| disabled | 1 |
| catalogVisibility | 1 |
| controllerAuth | 1 |
| dnsVerification | 1 |
| handlers | 1 |
| hostnamePolicy | 1 |
| operations | 1 |
| slugAlignment | 1 |
| discovery.integration | 1 |
| local | 1 |
| evictionSafety.unit | 1 |
| security | 1 |
| emailOtp | 1 |
| storefrontDomain | 1 |
| coverage | 1 |
| referenceGuard | 1 |
| deliveryTimingPolicy | 1 |
| storefrontBootstrap | 1 |
| money | 1 |
| rollback | 1 |
| modeRbac | 1 |
| posDayClosePin | 1 |
| supertest | 1 |
| enforcement.contract | 1 |

### Findings

| File | Finding | Detail |
| --- | --- | --- |
| tests/e2e-full-cycle.test.js | false-green-wrapper | a wrapper alias returns before awaiting its wrapped fn() |
| tests/frontend.complianceActivationReadiness.e2e.test.js | always-pending-in-matrix | gated behind TEST_TYPE/RUN_BROWSER_E2E, which the matrix never sets |
| tests/frontend.imsPosSalesJourney.e2e.test.js | always-pending-in-matrix | gated behind TEST_TYPE/RUN_BROWSER_E2E, which the matrix never sets |
| tests/frontend.sessionIsolation.e2e.test.js | always-pending-in-matrix | gated behind TEST_TYPE/RUN_BROWSER_E2E, which the matrix never sets |

### Full inventory

| File | Lines | Cases | Classification | Rule | Reason |
| --- | --- | --- | --- | --- | --- |
| tests/addDeliveryAssignmentShift.migration.test.js | 71 | 3 | keep | R5-default | default keep (suffix: migration) |
| tests/addDeliveryFeeBreakdown.migration.test.js | 219 | 10 | keep | R5-default | default keep (suffix: migration) |
| tests/addDeliveryFeeModeDiscoveryIndex.migration.test.js | 90 | 6 | keep | R5-default | default keep (suffix: migration) |
| tests/addDeliveryVoucherBenefit.migration.test.js | 308 | 13 | keep | R5-default | default keep (suffix: migration) |
| tests/addThirdPartyDeliveryPersonnelName.migration.test.js | 49 | 3 | keep | R5-default | default keep (suffix: migration) |
| tests/addVoucherAutoApply.migration.test.js | 236 | 13 | keep | R5-default | default keep (suffix: migration) |
| tests/adminAssistedProvisioningRoutes.contract.test.js | 20 | 2 | delete | R3-source-text-only | source-text-only (text_ratio=1) |
| tests/adminAssistedProvisioningUseCase.test.js | 294 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/adminAuthConfig.test.js | 66 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/adminAuthHandlers.test.js | 141 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/adminAuthUsecase.test.js | 142 | 7 | keep | R5-default | default keep (suffix: (none)) |
| tests/adminFinancialRoles.middleware.test.js | 78 | 3 | keep | R5-default | default keep (suffix: middleware) |
| tests/adminForceNonCompliant.handler.test.js | 216 | 4 | keep | R5-default | default keep (suffix: handler) |
| tests/adminForceNonCompliant.transport.test.js | 215 | 7 | keep | R5-default | default keep (suffix: transport) |
| tests/adminLoginLockoutPolicy.test.js | 43 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/adminLoginLockoutPolicyRedis.test.js | 81 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/adminLogoutUsecase.test.js | 43 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/adminRegistrationIndustries.transport.test.js | 251 | 19 | keep | R5-default | default keep (suffix: transport) |
| tests/adminRegistrationIndustryUseCases.test.js | 503 | 32 | keep | R5-default | default keep (suffix: (none)) |
| tests/adminTemplates.transport.test.js | 239 | 15 | keep | R5-default | default keep (suffix: transport) |
| tests/adminTenantCapabilities.transport.test.js | 231 | 7 | keep | R5-default | default keep (suffix: transport) |
| tests/adminTenantCapabilityValidator.test.js | 50 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/adminTenantHandlers.transport.test.js | 403 | 10 | keep | R5-default | default keep (suffix: transport) |
| tests/adminTenantLifecycle.integration.test.js | 472 | 9 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/adminTenantRegistrationValidation.test.js | 83 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/affiliateCategoryRates.unit.test.js | 450 | 16 | keep | R5-default | default keep (suffix: unit) |
| tests/affiliateCommissionAccrual.unit.test.js | 560 | 29 | keep | R5-default | default keep (suffix: unit) |
| tests/affiliateEarningsCap.unit.test.js | 535 | 29 | keep | R5-default | default keep (suffix: unit) |
| tests/affiliatePriceRuleResolution.unit.test.js | 105 | 12 | keep | R5-default | default keep (suffix: unit) |
| tests/affiliatePricingPolicy.unit.test.js | 159 | 16 | keep | R5-default | default keep (suffix: unit) |
| tests/affiliateShareCodeResolve.unit.test.js | 163 | 11 | keep | R5-default | default keep (suffix: unit) |
| tests/aiModelRates.test.js | 81 | 6 | keep | R5-default | default keep (suffix: (none)) |
| tests/aiModuleUsecases.test.js | 561 | 15 | keep | R5-default | default keep (suffix: (none)) |
| tests/aiTools.test.js | 216 | 19 | keep | R5-default | default keep (suffix: (none)) |
| tests/aiTransportHandlers.transport.test.js | 201 | 4 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/ai_cost_control_e2e.test.js | 186 | 2 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/ai_export_e2e.test.js | 225 | 5 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/alertsHandlers.transport.test.js | 98 | 2 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/alertsUsecases.applicationResult.test.js | 35 | 2 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/analysisToolRegistry.test.js | 66 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/analyticsHandlers.transport.test.js | 115 | 2 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/analyticsUsecases.applicationResult.test.js | 88 | 4 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/appendCancelledActionConversationUseCase.test.js | 54 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/appendConfirmedActionConversationUseCase.test.js | 85 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/applicationResultHelpers.test.js | 39 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/applyTemplateToTenantUseCase.cacheInvalidation.test.js | 190 | 4 | keep | R5-default | default keep (suffix: cacheInvalidation) |
| tests/applyTemplateToTenantUseCase.test.js | 240 | 7 | keep | R5-default | default keep (suffix: (none)) |
| tests/approveTenantUseCase.storeTemplateKey.test.js | 85 | 4 | keep | R5-default | default keep (suffix: storeTemplateKey) |
| tests/architectureGuardrailsScript.integration.test.js | 44 | 2 | keep | R5-default | default keep (suffix: integration) |
| tests/audit.usecase.test.js | 32 | 2 | keep | R5-default | default keep (suffix: usecase) |
| tests/auditBillingFunnelScript.integration.test.js | 38 | 2 | keep | R5-default | default keep (suffix: integration) |
| tests/auditIndexesScript.integration.test.js | 38 | 2 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/auditModeRbacUsers.test.js | 57 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/auditRepository.test.js | 107 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/auditRoute.contract.test.js | 17 | 1 | delete | R3-source-text-only | source-text-only (text_ratio=1) |
| tests/auth.ratelimit.e2e.test.js | 117 | 1 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/auth.test.js | 439 | 12 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/authCheckPermission.unit.test.js | 60 | 3 | keep | R5-default | default keep (suffix: unit) |
| tests/authEmailOtpTenantScope.test.js | 25 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/authFailClosed.test.js | 130 | 3 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/authModuleExports.contract.test.js | 22 | 1 | keep | R5-default | default keep (suffix: contract) |
| tests/authTenantIsolation.hardening.test.js | 243 | 8 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/authUsecases.applicationResult.test.js | 102 | 6 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/authenticate.phoneCompletionGate.middleware.test.js | 186 | 6 | keep | R5-default | default keep (suffix: phoneCompletionGate.middleware) |
| tests/authenticate.subscriptionGate.middleware.test.js | 147 | 2 | keep | R5-default | default keep (suffix: subscriptionGate.middleware) |
| tests/authenticateAdmin.middleware.test.js | 94 | 3 | keep | R5-default | default keep (suffix: middleware) |
| tests/autoAppliedCampaignPolicy.unit.test.js | 239 | 16 | keep | R5-default | default keep (suffix: unit) |
| tests/backendDockerfile.test.js | 25 | 1 | keep | R5-default | default keep (suffix: (none)) |
| tests/backfillRedemptionTransactionLink.migration.test.js | 164 | 8 | keep | R5-default | default keep (suffix: migration) |
| tests/barcodePolicy.test.js | 61 | 6 | keep | R5-default | default keep (suffix: (none)) |
| tests/billingRouteAuditService.test.js | 41 | 1 | keep | R5-default | default keep (suffix: (none)) |
| tests/billingScheduler.db.integration.test.js | 133 | 4 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/billingScheduler.idempotency.test.js | 236 | 5 | keep | R5-default | default keep (suffix: idempotency) |
| tests/browserSessionCookies.test.js | 172 | 11 | keep | R5-default | default keep (suffix: (none)) |
| tests/cachePolicy.middleware.test.js | 103 | 5 | keep | R5-default | default keep (suffix: middleware) |
| tests/cachePolicy.routeContracts.test.js | 131 | 3 | delete | R3-source-text-only | source-text-only (text_ratio=0.8) |
| tests/capabilityModules.contract.test.js | 249 | 16 | keep | R5-default | default keep (suffix: contract) |
| tests/cashierPosPermissions.test.js | 32 | 1 | keep | R5-default | default keep (suffix: (none)) |
| tests/catalogChangeEventBus.test.js | 39 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/catalogImageUploadStatusStore.test.js | 34 | 1 | keep | R5-default | default keep (suffix: (none)) |
| tests/catalogImageUploadWorker.test.js | 52 | 2 | consolidate | R4-source-text-mixed | source-text-mixed (text_ratio=0.6) |
| tests/catalogVisibilityPolicy.test.js | 139 | 9 | keep | R5-default | default keep (suffix: (none)) |
| tests/checkAnyPermission.middleware.test.js | 126 | 5 | keep | R5-default | default keep (suffix: middleware) |
| tests/checkComplianceImpactScript.integration.test.js | 272 | 10 | keep | R5-default | default keep (suffix: integration) |
| tests/checkStorefrontBrandingEditPermission.middleware.test.js | 91 | 4 | keep | R5-default | default keep (suffix: middleware) |
| tests/checkTenantSchemaRegistryCoverageScript.integration.test.js | 86 | 5 | keep | R5-default | default keep (suffix: integration) |
| tests/cleanupTestTenantsScript.test.js | 35 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/commerceOrderLifecycle.usecase.test.js | 314 | 12 | keep | R5-default | default keep (suffix: usecase) |
| tests/commercePaymentReadiness.usecases.test.js | 325 | 7 | keep | R5-default | default keep (suffix: usecases) |
| tests/commercePaymentReconciliation.usecase.test.js | 225 | 4 | keep | R5-default | default keep (suffix: usecase) |
| tests/commercePaymentRefunds.usecases.test.js | 339 | 8 | keep | R5-default | default keep (suffix: usecases) |
| tests/commercePaymentRouteMount.contract.test.js | 20 | 2 | delete | R3-source-text-only | source-text-only (text_ratio=1) |
| tests/commercePaymentSandboxConfirmation.usecase.test.js | 179 | 8 | keep | R5-default | default keep (suffix: usecase) |
| tests/commercePaymentSettlement.usecases.test.js | 119 | 3 | keep | R5-default | default keep (suffix: usecases) |
| tests/commercePaymentValidator.test.js | 117 | 7 | keep | R5-default | default keep (suffix: (none)) |
| tests/commercialPromoPolicy.unit.test.js | 154 | 5 | keep | R5-default | default keep (suffix: unit) |
| tests/companyRegistrationStatusUseCase.test.js | 22 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/complianceActivation.transport.test.js | 137 | 4 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/complianceActivation.usecase.test.js | 65 | 2 | keep | R5-default | default keep (suffix: usecase) |
| tests/complianceActivationReadiness.e2e.transport.test.js | 442 | 2 | consolidate | R4-thin-file | thin-file (2 cases in 442 lines) |
| tests/complianceAuditFallback.usecase.test.js | 98 | 2 | keep | R5-default | default keep (suffix: usecase) |
| tests/complianceDowngradeTrigger.db.integration.test.js | 257 | 4 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/complianceModeDowngrade.transport.test.js | 93 | 2 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/complianceModeDowngrade.usecase.test.js | 338 | 11 | keep | R5-default | default keep (suffix: usecase) |
| tests/compliancePolicyEngine.test.js | 662 | 14 | keep | R5-default | default keep (suffix: (none)) |
| tests/compliancePreflight.transport.test.js | 212 | 5 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/compliancePreflightUsecase.test.js | 125 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/complianceRepository.documentaryReadiness.test.js | 211 | 4 | keep | R5-default | default keep (suffix: documentaryReadiness) |
| tests/complianceRepository.profileMerge.test.js | 97 | 1 | keep | R5-default | default keep (suffix: profileMerge) |
| tests/complianceSecurityIncidents.usecase.test.js | 188 | 2 | keep | R5-default | default keep (suffix: usecase) |
| tests/complianceSecuritySignal.usecase.test.js | 154 | 4 | keep | R5-default | default keep (suffix: usecase) |
| tests/complianceUsecases.authorization.test.js | 46 | 2 | keep | R5-default | default keep (suffix: authorization) |
| tests/controllerBoundaryScript.integration.test.js | 38 | 2 | keep | R5-default | default keep (suffix: integration) |
| tests/controllerFacadeParity.test.js | 88 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/corsPolicy.test.js | 109 | 6 | keep | R5-default | default keep (suffix: (none)) |
| tests/corsPreflight.transport.test.js | 25 | 1 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/costValuationService.test.js | 259 | 7 | keep | R5-default | default keep (suffix: (none)) |
| tests/createEmailDeliveryLogs.migration.test.js | 107 | 5 | keep | R5-default | default keep (suffix: migration) |
| tests/createMenuImportJobUseCase.budgetFeature.test.js | 36 | 1 | keep | R5-default | default keep (suffix: budgetFeature) |
| tests/csrfProtection.test.js | 93 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/csvExportFolderFilter.test.js | 78 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/csvExportService.workflowMode.test.js | 291 | 5 | keep | R5-default | default keep (suffix: workflowMode) |
| tests/csvHandlers.transport.test.js | 369 | 8 | keep | R5-default | default keep (suffix: transport) |
| tests/csvImportService.workflowMode.test.js | 518 | 19 | keep | R5-default | default keep (suffix: workflowMode) |
| tests/csvTransferToolRegistry.test.js | 245 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/csvUsecases.applicationResult.test.js | 96 | 5 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/customerAccessPolicy.test.js | 244 | 17 | keep | R5-default | default keep (suffix: (none)) |
| tests/customerActivityRecorder.test.js | 125 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/dashboardAndInsightsToolRegistry.test.js | 151 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/dashboardHandlers.transport.test.js | 114 | 2 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/dashboardUsecases.applicationResult.test.js | 55 | 3 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/delegatedInventoryLookup.test.js | 160 | 10 | keep | R5-default | default keep (suffix: (none)) |
| tests/deleteTenantUseCase.test.js | 137 | 6 | keep | R5-default | default keep (suffix: (none)) |
| tests/deliveryFeeConfig.unit.test.js | 166 | 16 | keep | R5-default | default keep (suffix: unit) |
| tests/deliveryFeeModeConfig.checkoutFallback.unit.test.js | 170 | 5 | keep | R5-default | default keep (suffix: checkoutFallback.unit) |
| tests/deliveryFeeModeDiscoveryIndexPersistence.contract.test.js | 67 | 6 | delete | R3-source-text-only | source-text-only (text_ratio=0.83) |
| tests/deliveryFeePolicy.unit.test.js | 116 | 9 | keep | R5-default | default keep (suffix: unit) |
| tests/deliveryFromPrice.parity.unit.test.js | 74 | 5 | keep | R5-default | default keep (suffix: parity.unit) |
| tests/deliveryFromPrice.unit.test.js | 140 | 14 | keep | R5-default | default keep (suffix: unit) |
| tests/deliveryPersonnelRegistry.usecase.test.js | 224 | 9 | keep | R5-default | default keep (suffix: usecase) |
| tests/deliveryRun.usecase.test.js | 242 | 11 | keep | R5-default | default keep (suffix: usecase) |
| tests/deliveryRunDispatch.usecase.test.js | 468 | 18 | keep | R5-default | default keep (suffix: usecase) |
| tests/deliveryRunRoutes.transport.test.js | 245 | 9 | keep | R5-default | default keep (suffix: transport) |
| tests/deliveryRunWriteThrough.usecase.test.js | 320 | 11 | keep | R5-default | default keep (suffix: usecase) |
| tests/dgfyAccountRepository.invitationSchema.test.js | 84 | 2 | keep | R5-default | default keep (suffix: invitationSchema) |
| tests/dgfyAdminAccountHandlers.transport.test.js | 197 | 6 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/dgfyAdminAccountRoutes.contract.test.js | 24 | 2 | delete | R3-source-text-only | source-text-only (text_ratio=1) |
| tests/dgfyAdminAccountUseCases.test.js | 352 | 10 | keep | R5-default | default keep (suffix: (none)) |
| tests/dgfyAffiliateCashoutUseCases.unit.test.js | 202 | 8 | keep | R5-default | default keep (suffix: unit) |
| tests/dgfyAffiliateEnrollmentUseCases.unit.test.js | 298 | 17 | keep | R5-default | default keep (suffix: unit) |
| tests/dgfyAffiliatePriceRuleUseCases.unit.test.js | 255 | 18 | keep | R5-default | default keep (suffix: unit) |
| tests/dgfyAffiliateReactivationUseCase.unit.test.js | 418 | 11 | keep | R5-default | default keep (suffix: unit) |
| tests/dgfyAffiliateRepository.slotEnforcement.unit.test.js | 588 | 20 | keep | R5-default | default keep (suffix: slotEnforcement.unit) |
| tests/dgfyAffiliateStatusEvents.unit.test.js | 616 | 19 | keep | R5-default | default keep (suffix: unit) |
| tests/dgfyAuthMiddleware.test.js | 196 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/dgfyAuthUseCases.test.js | 2470 | 61 | keep | R5-default | default keep (suffix: (none)) |
| tests/dgfyCustomerHandlers.transport.test.js | 144 | 3 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/dgfyCustomerUseCases.test.js | 1001 | 34 | keep | R5-default | default keep (suffix: (none)) |
| tests/dgfyInvitationCompanyRole.test.js | 114 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/dgfyLaundryProviderUseCases.test.js | 60 | 6 | keep | R5-default | default keep (suffix: (none)) |
| tests/dgfyLegacyLinkService.test.js | 192 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/dgfyLegalUseCases.test.js | 26 | 1 | keep | R5-default | default keep (suffix: (none)) |
| tests/dgfyRegisterPreflight.transport.test.js | 116 | 2 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/dgfyTenantSession.transport.test.js | 439 | 6 | keep | R5-default | default keep (suffix: transport) |
| tests/dispatchOrderHandlers.transport.test.js | 223 | 5 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/dispatchOrderToolRegistry.test.js | 143 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/dispatchOrderUsecases.applicationResult.test.js | 85 | 5 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/downpaymentPolicy.unit.test.js | 283 | 23 | keep | R5-default | default keep (suffix: unit) |
| tests/downpaymentSettingsRepository.unit.test.js | 75 | 3 | keep | R5-default | default keep (suffix: unit) |
| tests/downpaymentSettingsUseCases.unit.test.js | 212 | 15 | keep | R5-default | default keep (suffix: unit) |
| tests/downpaymentSettingsValidator.unit.test.js | 83 | 6 | keep | R5-default | default keep (suffix: unit) |
| tests/downpaymentWebhookFinalization.unit.test.js | 482 | 7 | keep | R5-default | default keep (suffix: unit) |
| tests/dropRegistrationIndustryVisibility.migration.test.js | 193 | 7 | keep | R5-default | default keep (suffix: migration) |
| tests/e2e-full-cycle.test.js | 573 | 2 | keep | R0-override | correctness fix: beforeAll now throws when the runtime audit is unhealthy instead of silently returning (false-green fix, #1441) |
| tests/effectiveFnbModifierGroups.test.js | 54 | 3 | keep | R1-pin | hardcoded reference: scripts/run-fnb-readiness-gate.js |
| tests/emailDeliveryLogRepository.unit.test.js | 189 | 14 | keep | R5-default | default keep (suffix: unit) |
| tests/emailOtpService.test.js | 333 | 9 | keep | R5-default | default keep (suffix: (none)) |
| tests/emailService.deliveryLog.test.js | 169 | 8 | keep | R5-default | default keep (suffix: deliveryLog) |
| tests/emailService.deliveryProvider.test.js | 191 | 10 | keep | R5-default | default keep (suffix: deliveryProvider) |
| tests/emailTemplates.companyApproved.test.js | 21 | 1 | keep | R5-default | default keep (suffix: companyApproved) |
| tests/emailTemplates.invitation.test.js | 20 | 1 | keep | R5-default | default keep (suffix: invitation) |
| tests/employee.repository.test.js | 26 | 1 | keep | R5-default | default keep (suffix: repository) |
| tests/employeeCredit.repository.test.js | 34 | 1 | keep | R5-default | default keep (suffix: repository) |
| tests/employeeCredit.usecases.test.js | 663 | 15 | keep | R5-default | default keep (suffix: usecases) |
| tests/employeeCreditMigration.contract.test.js | 32 | 2 | trim | R0-override | keep 6 unique-constraint/ENUM assertions; drop 21 bare column greps |
| tests/employeeCreditRepaymentValidator.test.js | 71 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/engagementEventModel.test.js | 37 | 1 | demote | R0-override | imports models/index.js but issues no queries; src/config/database.js constructs Sequelize without connecting, so it passes under the fast tier's DB_PORT=1 guard |
| tests/engagementIntegrityAuditService.test.js | 213 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/engagementIntegrityHealthService.test.js | 67 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/engagementService.test.js | 103 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/errorHandler.loggingPolicy.test.js | 115 | 7 | keep | R5-default | default keep (suffix: loggingPolicy) |
| tests/executeConfirmedActionUseCase.test.js | 135 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/externalProductImageImport.test.js | 107 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/externalProductLookup.test.js | 183 | 6 | keep | R5-default | default keep (suffix: (none)) |
| tests/feedbackHandlers.transport.test.js | 108 | 2 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/feedbackUsecases.applicationResult.test.js | 43 | 2 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/fileEncapsulation.test.js | 209 | 9 | keep | R5-default | default keep (suffix: (none)) |
| tests/finalizePaidCommerceSession.usecase.test.js | 816 | 13 | keep | R5-default | default keep (suffix: usecase) |
| tests/fixEmailOtpDeliveryStatus.migration.test.js | 144 | 6 | keep | R5-default | default keep (suffix: migration) |
| tests/fnbFolderModifierAssignments.migration.test.js | 35 | 1 | keep | R1-pin | hardcoded reference: scripts/run-fnb-readiness-gate.js |
| tests/fnbKitchenQueueTemplateGate.route.test.js | 102 | 4 | keep | R5-default | default keep (suffix: route) |
| tests/fnbMode.usecases.test.js | 804 | 25 | keep | R1-pin | hardcoded reference: .github/workflows/promotion-quality-gate.yml, scripts/run-fnb-readiness-gate.js |
| tests/fnbModifierAvailability.migration.test.js | 68 | 2 | keep | R5-default | default keep (suffix: migration) |
| tests/fnbModifierCondition.migration.test.js | 46 | 3 | keep | R1-pin | hardcoded reference: .github/workflows/promotion-quality-gate.yml, scripts/run-fnb-readiness-gate.js |
| tests/fnbModifierDeGating.routes.test.js | 95 | 4 | keep | R5-default | default keep (suffix: routes) |
| tests/fnbModifierGroupKind.migration.test.js | 18 | 1 | keep | R5-default | default keep (suffix: migration) |
| tests/fnbOperationalReadiness.qa.test.js | 189 | 4 | keep | R1-pin | hardcoded reference: scripts/run-fnb-readiness-gate.js |
| tests/foldRegistrationIndustryVisibility.migration.test.js | 216 | 8 | keep | R5-default | default keep (suffix: migration) |
| tests/forecastHandlers.transport.test.js | 98 | 2 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/forecastUsecases.applicationResult.test.js | 35 | 2 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/frontend.complianceActivationReadiness.e2e.test.js | 840 | 2 | keep | R1-pin | hardcoded reference: apps/dgfy-api/package.json |
| tests/frontend.imsPosSalesJourney.e2e.test.js | 2431 | 8 | keep | R1-pin | hardcoded reference: apps/dgfy-api/package.json |
| tests/frontend.sessionIsolation.e2e.test.js | 332 | 1 | keep | R1-pin | hardcoded reference: apps/dgfy-api/package.json |
| tests/fulfillmentProfiles.contract.test.js | 295 | 25 | keep | R5-default | default keep (suffix: contract) |
| tests/generateConfirmationUseCase.test.js | 73 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/generateStorefrontSlug.usecase.test.js | 120 | 4 | keep | R5-default | default keep (suffix: usecase) |
| tests/geoAddressSearchUseCase.test.js | 27 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/geoCatalogSyncService.test.js | 149 | 8 | keep | R5-default | default keep (suffix: (none)) |
| tests/geoInventoryWorkerSku.contract.test.js | 21 | 1 | delete | R3-source-text-only | source-text-only (text_ratio=1) |
| tests/geoInventoryWorkerStartup.contract.test.js | 18 | 1 | delete | R3-source-text-only | source-text-only (text_ratio=1) |
| tests/geoSearchRepository.tenantCompanyToken.test.js | 99 | 1 | keep | R5-default | default keep (suffix: tenantCompanyToken) |
| tests/geoSearchReverseGeocode.usecase.test.js | 101 | 6 | keep | R5-default | default keep (suffix: usecase) |
| tests/grandMatadorCatalogAudit.test.js | 36 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/grandMatadorCatalogImport.test.js | 101 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/guestCheckoutDisabledEnforcement.usecase.test.js | 506 | 8 | keep | R5-default | default keep (suffix: usecase) |
| tests/handleSpecialQueriesUseCase.test.js | 33 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/handleToolCallsUseCase.test.js | 190 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/healthSchemaIndexAudit.test.js | 39 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/healthService.test.js | 554 | 9 | keep | R1-pin | hardcoded reference: apps/dgfy-api/package.json |
| tests/hospitalityFolioTotals.contract.test.js | 63 | 3 | keep | R5-default | default keep (suffix: contract) |
| tests/hospitalityUseCases.test.js | 671 | 20 | keep | R5-default | default keep (suffix: (none)) |
| tests/hostingProfilePreflight.test.js | 101 | 4 | keep | R1-pin | hardcoded reference: apps/dgfy-api/package.json |
| tests/imageAssetStorage.util.test.js | 228 | 6 | keep | R5-default | default keep (suffix: util) |
| tests/imageCleanupService.test.js | 54 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/imageLifecycleFullValidation.test.js | 142 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/imageLifecycleGaps.test.js | 96 | 8 | keep | R5-default | default keep (suffix: (none)) |
| tests/imageLifecycleUseCases.test.js | 139 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/imageUploadValidation.util.test.js | 51 | 3 | keep | R5-default | default keep (suffix: util) |
| tests/incidentBundleScript.test.js | 50 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/internalItemBarcode.contract.test.js | 80 | 6 | consolidate | R4-source-text-mixed | source-text-mixed (text_ratio=0.54) |
| tests/inventoryAuthorityGate.test.js | 97 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/inventoryGetItemsUseCase.test.js | 52 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/inventoryItemRepository.test.js | 2490 | 51 | keep | R5-default | default keep (suffix: (none)) |
| tests/inventoryReservationService.unit.test.js | 116 | 3 | keep | R5-default | default keep (suffix: unit) |
| tests/inventoryReservations.migration.test.js | 47 | 1 | keep | R5-default | default keep (suffix: migration) |
| tests/itemFinancialPolicy.test.js | 84 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/itemHandlers.transport.test.js | 620 | 14 | keep | R5-default | default keep (suffix: transport) |
| tests/itemImageGenerationService.test.js | 114 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/itemImageStatusStore.test.js | 68 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/itemImageWorker.test.js | 192 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/itemLocationStockOverlay.test.js | 142 | 12 | keep | R5-default | default keep (suffix: (none)) |
| tests/itemModeTaxonomyUseCases.test.js | 99 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/itemSoftDeletePolicy.test.js | 51 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/itemToolRegistry.test.js | 129 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/itemUseCasesEnabledCapabilities.test.js | 89 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/itemUseCasesInventoryAuthorityGate.test.js | 150 | 7 | keep | R5-default | default keep (suffix: (none)) |
| tests/itemsCategoryRoutes.contract.test.js | 17 | 1 | delete | R3-source-text-only | source-text-only (text_ratio=1) |
| tests/jobOrderHandlers.transport.test.js | 292 | 7 | keep | R5-default | default keep (suffix: transport) |
| tests/jobOrderToolRegistry.test.js | 177 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/jobOrderUsecases.applicationResult.test.js | 96 | 5 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/laundryWorkflowModeRuntimeGuard.usecases.test.js | 67 | 3 | keep | R5-default | default keep (suffix: usecases) |
| tests/legacyConfirmedActionUiFormatter.test.js | 54 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/listTenantCapabilityAuditLogs.usecase.test.js | 143 | 4 | keep | R5-default | default keep (suffix: usecase) |
| tests/listTenants.usecase.test.js | 72 | 1 | keep | R5-default | default keep (suffix: usecase) |
| tests/locationTransportValidators.contract.test.js | 79 | 2 | keep | R5-default | default keep (suffix: contract) |
| tests/lookup_v2.test.js | 320 | 10 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/materializeTemplateModuleSelection.test.js | 57 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/menuExtractionService.test.js | 546 | 29 | keep | R5-default | default keep (suffix: (none)) |
| tests/menuImportBatchHandlers.test.js | 83 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/menuImportBudgetRepository.test.js | 43 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/menuImportCategoryService.test.js | 144 | 8 | keep | R5-default | default keep (suffix: (none)) |
| tests/menuImportController.alwaysAvailable.test.js | 166 | 5 | keep | R5-default | default keep (suffix: alwaysAvailable) |
| tests/menuImportController.imageGeneration.test.js | 183 | 5 | keep | R5-default | default keep (suffix: imageGeneration) |
| tests/menuImportJobRepository.test.js | 257 | 15 | keep | R5-default | default keep (suffix: (none)) |
| tests/menuImportLegacyDeprecation.test.js | 126 | 6 | keep | R5-default | default keep (suffix: (none)) |
| tests/menuImportRouteRegistration.test.js | 93 | 5 | consolidate | R4-source-text-mixed | source-text-mixed (text_ratio=0.74) |
| tests/menuImportWorker.test.js | 216 | 7 | keep | R5-default | default keep (suffix: (none)) |
| tests/menuPdfRasterService.test.js | 191 | 10 | keep | R5-default | default keep (suffix: (none)) |
| tests/mergeMenuImportItems.test.js | 159 | 17 | keep | R5-default | default keep (suffix: (none)) |
| tests/metricsService.test.js | 59 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/mobilePosFinancialSync.usecases.test.js | 246 | 7 | keep | R5-default | default keep (suffix: usecases) |
| tests/mobilePosHandlers.transport.test.js | 356 | 9 | keep | R5-default | default keep (suffix: transport) |
| tests/mobilePosItemSync.usecases.test.js | 247 | 12 | keep | R5-default | default keep (suffix: usecases) |
| tests/mobilePosReplayGuard.test.js | 38 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/mobilePosSettingsBootstrap.contract.test.js | 73 | 5 | keep | R5-default | default keep (suffix: contract) |
| tests/modeFinancialTracking.contract.test.js | 27 | 2 | trim | R0-override | keep the buildStockBearingItemWhere import check; drop the rest |
| tests/modeItemTaxonomy.contract.test.js | 427 | 16 | keep | R5-default | default keep (suffix: contract) |
| tests/modeRbacFallback.test.js | 53 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/modeRbacRouteContracts.test.js | 77 | 4 | consolidate | R4-source-text-mixed | source-text-mixed (text_ratio=0.79) |
| tests/modeRolePresets.test.js | 141 | 7 | keep | R5-default | default keep (suffix: (none)) |
| tests/nestedTenancy.test.js | 72 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/normalizeRegistrationIndustryNiches.migration.test.js | 50 | 3 | keep | R5-default | default keep (suffix: migration) |
| tests/observabilityReleaseGateScript.test.js | 136 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/onboardingHandlers.transport.test.js | 195 | 5 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/onboardingRepository.schemaCompatibility.test.js | 171 | 3 | keep | R5-default | default keep (suffix: schemaCompatibility) |
| tests/onboardingUsecases.applicationResult.test.js | 337 | 13 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/onboardingValidator.test.js | 83 | 7 | keep | R5-default | default keep (suffix: (none)) |
| tests/onlineInventoryEffects.unit.test.js | 38 | 3 | keep | R5-default | default keep (suffix: unit) |
| tests/operationalAlertService.unit.test.js | 141 | 9 | keep | R5-default | default keep (suffix: unit) |
| tests/orderMethods.crossLayer.contract.test.js | 73 | 4 | keep | R5-default | default keep (suffix: crossLayer.contract) |
| tests/passwordValidation.test.js | 77 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/paymentAtomicity.test.js | 90 | 1 | keep | R0-override | demotion candidate rejected by the empirical re-proof (#1441): jest.spyOn(db.sequelize, "transaction") still opens a real transaction inside handleWebhook, so it fails under the fast tier's DB_PORT=1 guard even though the model methods themselves are mocked. Stays on the db manifest |
| tests/paymentHandlers.publicRoutes.transport.test.js | 169 | 5 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/paymentHandlers.simulateWebhook.test.js | 128 | 2 | keep | R5-default | default keep (suffix: simulateWebhook) |
| tests/paymentLifecycle.integration.test.js | 47 | 2 | keep | R5-default | default keep (suffix: integration) |
| tests/paymentTimingPolicy.test.js | 19 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/paymentsRoutes.disabled.transport.test.js | 75 | 2 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/paymongoDirectGcash.test.js | 177 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/paymongoHostedCheckout.test.js | 130 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/paymongoWebhookSignature.test.js | 236 | 9 | keep | R5-default | default keep (suffix: (none)) |
| tests/paypalWebhookHandlers.test.js | 563 | 22 | keep | R5-default | default keep (suffix: (none)) |
| tests/paypalWebhookVerification.test.js | 199 | 6 | keep | R5-default | default keep (suffix: (none)) |
| tests/permissionsRoleMatrix.test.js | 117 | 7 | keep | R5-default | default keep (suffix: (none)) |
| tests/persistChatTurnUseCase.test.js | 103 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/phoneCompletionRollout.config.test.js | 42 | 3 | keep | R5-default | default keep (suffix: config) |
| tests/phoneNumber.utils.test.js | 27 | 4 | keep | R5-default | default keep (suffix: utils) |
| tests/platformAdminRouteClassification.test.js | 41 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/platformAdminUsersUseCase.test.js | 48 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/platformInvoiceUseCases.test.js | 169 | 11 | keep | R5-default | default keep (suffix: (none)) |
| tests/posAuditAndParkedSaleMigrations.test.js | 82 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/posBalancePaymentProof.usecase.test.js | 238 | 8 | keep | R5-default | default keep (suffix: usecase) |
| tests/posCashRefund.usecase.test.js | 357 | 8 | keep | R5-default | default keep (suffix: usecase) |
| tests/posCashierAttendance.route.contract.test.js | 89 | 2 | consolidate | R4-source-text-mixed | source-text-mixed (text_ratio=0.57) |
| tests/posCashierAttendanceConfig.repository.test.js | 71 | 2 | keep | R5-default | default keep (suffix: repository) |
| tests/posCashierAttendanceConfig.route.contract.test.js | 47 | 3 | keep | R5-default | default keep (suffix: route.contract) |
| tests/posCashierAttendanceConfig.usecases.test.js | 170 | 6 | keep | R5-default | default keep (suffix: usecases) |
| tests/posCashierAttendanceIdempotency.migration.test.js | 105 | 3 | keep | R5-default | default keep (suffix: migration) |
| tests/posCashierAttendanceLifecycle.usecases.test.js | 230 | 7 | keep | R5-default | default keep (suffix: usecases) |
| tests/posCashierAttendanceOperatorSessions.migration.test.js | 162 | 4 | keep | R5-default | default keep (suffix: migration) |
| tests/posCashierAttendanceRepository.test.js | 88 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/posCashierAttendanceSchema.contract.test.js | 65 | 3 | demote | R0-override | import-only; no real query issued |
| tests/posCashierLifecycle.usecases.test.js | 391 | 9 | keep | R5-default | default keep (suffix: usecases) |
| tests/posCashierLoginRoute.transport.test.js | 30 | 2 | consolidate | R4-source-text-mixed | source-text-mixed (text_ratio=0.63) |
| tests/posCashierLoginUseCase.test.js | 37 | 1 | keep | R5-default | default keep (suffix: (none)) |
| tests/posCashierShiftHistory.usecase.test.js | 204 | 3 | keep | R5-default | default keep (suffix: usecase) |
| tests/posCatalogEvents.transport.test.js | 23 | 2 | delete | R3-source-text-only | source-text-only (text_ratio=1) |
| tests/posCheckout.db.integration.test.js | 854 | 11 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/posCheckoutAffiliateAttribution.unit.test.js | 492 | 8 | keep | R5-default | default keep (suffix: unit) |
| tests/posCheckoutFnbContracts.usecase.test.js | 2254 | 30 | keep | R1-pin | hardcoded reference: .github/workflows/promotion-quality-gate.yml, scripts/run-fnb-readiness-gate.js |
| tests/posDayClosePinPolicy.test.js | 36 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/posDayClosePinSelfService.contract.test.js | 63 | 5 | keep | R0-override | merge target for dgfyTenantSessionService.contract; encodes a real incident |
| tests/posDeliveryAssignment.usecase.test.js | 302 | 8 | keep | R5-default | default keep (suffix: usecase) |
| tests/posDeliveryCashCollection.usecase.test.js | 135 | 4 | keep | R5-default | default keep (suffix: usecase) |
| tests/posDeliveryCompletionGuard.usecase.test.js | 221 | 7 | keep | R5-default | default keep (suffix: usecase) |
| tests/posDeliveryFeeOverride.usecase.test.js | 282 | 12 | keep | R5-default | default keep (suffix: usecase) |
| tests/posDeliveryJobStatus.usecase.test.js | 232 | 7 | keep | R5-default | default keep (suffix: usecase) |
| tests/posDeliveryPersonnel.repository.test.js | 100 | 3 | keep | R5-default | default keep (suffix: repository) |
| tests/posDeliveryPricingAuditRoundTrip.integration.test.js | 169 | 2 | keep | R5-default | default keep (suffix: integration) |
| tests/posDeviceDrawerOpen.unit.test.js | 119 | 3 | keep | R5-default | default keep (suffix: unit) |
| tests/posDeviceDriverResolver.unit.test.js | 52 | 8 | keep | R5-default | default keep (suffix: unit) |
| tests/posDevicePrintReceipt.unit.test.js | 368 | 10 | keep | R5-default | default keep (suffix: unit) |
| tests/posDeviceShiftGuard.test.js | 31 | 1 | keep | R5-default | default keep (suffix: (none)) |
| tests/posDeviceStatus.unit.test.js | 66 | 4 | keep | R5-default | default keep (suffix: unit) |
| tests/posDiscountApprovalPolicy.unit.test.js | 106 | 9 | keep | R5-default | default keep (suffix: unit) |
| tests/posDiscountCalculator.unit.test.js | 213 | 14 | keep | R5-default | default keep (suffix: unit) |
| tests/posDiscountPolicy.unit.test.js | 539 | 29 | keep | R5-default | default keep (suffix: unit) |
| tests/posDrawerAuthorization.unit.test.js | 79 | 3 | keep | R5-default | default keep (suffix: unit) |
| tests/posExternalRefund.usecase.test.js | 267 | 7 | keep | R5-default | default keep (suffix: usecase) |
| tests/posGovernedDiscountLineId.contract.test.js | 23 | 1 | delete | R3-source-text-only | source-text-only (text_ratio=1) |
| tests/posHandlers.transport.test.js | 1366 | 27 | consolidate | R4-hand-enumerated-barrel | hand-enumerated-barrel (47 factory stubs) |
| tests/posItemDiscountPolicy.unit.test.js | 56 | 2 | keep | R5-default | default keep (suffix: unit) |
| tests/posMerchantTenderReconciliation.route.contract.test.js | 33 | 2 | keep | R5-default | default keep (suffix: route.contract) |
| tests/posMerchantTenderReconciliation.usecases.test.js | 127 | 4 | keep | R5-default | default keep (suffix: usecases) |
| tests/posOnlineInventoryReservationLifecycle.unit.test.js | 106 | 2 | keep | R5-default | default keep (suffix: unit) |
| tests/posOnlineOrderCompletionBalanceGate.usecase.test.js | 202 | 6 | keep | R5-default | default keep (suffix: usecase) |
| tests/posOperationReplayParity.usecase.test.js | 975 | 13 | keep | R5-default | default keep (suffix: usecase) |
| tests/posOperatorAuthority.migration.test.js | 128 | 3 | keep | R5-default | default keep (suffix: migration) |
| tests/posOperatorAuthority.security.contract.test.js | 92 | 4 | keep | R5-default | default keep (suffix: security.contract) |
| tests/posOperatorAuthority.usecases.test.js | 428 | 19 | keep | R5-default | default keep (suffix: usecases) |
| tests/posOperatorMutationAttribution.contract.test.js | 55 | 4 | delete | R3-source-text-only | source-text-only (text_ratio=1) |
| tests/posOperatorProtectedOperationLease.migration.test.js | 83 | 4 | keep | R5-default | default keep (suffix: migration) |
| tests/posOrderBalanceSettlement.usecase.test.js | 319 | 10 | keep | R5-default | default keep (suffix: usecase) |
| tests/posOrderHistory.repository.test.js | 73 | 2 | keep | R5-default | default keep (suffix: repository) |
| tests/posOrderHistory.usecase.test.js | 73 | 3 | keep | R5-default | default keep (suffix: usecase) |
| tests/posOrderPackedStep.usecase.test.js | 170 | 6 | keep | R5-default | default keep (suffix: usecase) |
| tests/posOrderRejectionAndAddressEdit.usecase.test.js | 255 | 8 | keep | R5-default | default keep (suffix: usecase) |
| tests/posParkedSale.repository.test.js | 125 | 4 | keep | R5-default | default keep (suffix: repository) |
| tests/posParkedSale.route.contract.test.js | 69 | 2 | keep | R5-default | default keep (suffix: route.contract) |
| tests/posParkedSale.schema.contract.test.js | 58 | 4 | demote | R0-override | import-only; no real query issued |
| tests/posParkedSale.usecases.test.js | 434 | 13 | keep | R5-default | default keep (suffix: usecases) |
| tests/posPayMongoReconciliation.test.js | 106 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/posPaymentBreakdown.test.js | 111 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/posPaymentProviderConfirmation.test.js | 45 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/posPickupCashCollection.usecase.test.js | 203 | 6 | keep | R5-default | default keep (suffix: usecase) |
| tests/posProviderRefund.usecase.test.js | 429 | 8 | keep | R5-default | default keep (suffix: usecase) |
| tests/posReadings.usecase.test.js | 438 | 9 | keep | R5-default | default keep (suffix: usecase) |
| tests/posReports.repository.test.js | 772 | 11 | keep | R5-default | default keep (suffix: repository) |
| tests/posReports.usecase.test.js | 84 | 5 | keep | R5-default | default keep (suffix: usecase) |
| tests/posRepository.catalogImages.test.js | 351 | 5 | keep | R5-default | default keep (suffix: catalogImages) |
| tests/posRepository.locationStockFallback.test.js | 162 | 5 | keep | R5-default | default keep (suffix: locationStockFallback) |
| tests/posRepository.transactionInclude.contract.test.js | 65 | 3 | keep | R5-default | default keep (suffix: transactionInclude.contract) |
| tests/posSalesReconciliation.db.integration.test.js | 1731 | 1 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/posSetupCashierRoute.transport.test.js | 22 | 2 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/posSetupCashierUseCase.test.js | 43 | 1 | keep | R5-default | default keep (suffix: (none)) |
| tests/posShiftAuthorizationPolicy.test.js | 101 | 6 | keep | R5-default | default keep (suffix: (none)) |
| tests/posShiftLocationBackfillRemediation.migration.test.js | 28 | 1 | trim | R0-override | keep only the "migrations must not import app code" negative |
| tests/posShiftLocationResolution.test.js | 63 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/posShiftOperatorInvariantScripts.contract.test.js | 56 | 3 | consolidate | R4-source-text-mixed | source-text-mixed (text_ratio=0.67) |
| tests/posShiftOperatorUniqueness.migration.test.js | 128 | 5 | keep | R5-default | default keep (suffix: migration) |
| tests/posShiftRecoveryPolicy.test.js | 88 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/posSplitAllocationReversal.usecase.test.js | 393 | 8 | keep | R5-default | default keep (suffix: usecase) |
| tests/posSplitPayment.repository.test.js | 74 | 2 | keep | R5-default | default keep (suffix: repository) |
| tests/posSplitPayment.route.contract.test.js | 93 | 2 | keep | R5-default | default keep (suffix: route.contract) |
| tests/posSplitPayment.schema.contract.test.js | 148 | 6 | demote | R0-override | import-only; no real query issued |
| tests/posSplitPayment.usecases.test.js | 1069 | 29 | keep | R5-default | default keep (suffix: usecases) |
| tests/posStaleShiftRecovery.usecase.test.js | 278 | 4 | keep | R5-default | default keep (suffix: usecase) |
| tests/posTerminalPairingCookie.test.js | 15 | 1 | keep | R5-default | default keep (suffix: (none)) |
| tests/posTerminalPairingService.test.js | 74 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/posTerminalPairingUseCase.test.js | 67 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/posTerminalReadiness.usecase.test.js | 386 | 12 | keep | R5-default | default keep (suffix: usecase) |
| tests/posTerminalRegistrySecrets.test.js | 34 | 1 | keep | R5-default | default keep (suffix: (none)) |
| tests/posTransactionAdjustment.foundation.test.js | 89 | 2 | keep | R5-default | default keep (suffix: foundation) |
| tests/posTransactionAdjustment.migration.test.js | 76 | 2 | keep | R5-default | default keep (suffix: migration) |
| tests/posTransactionHistory.repository.test.js | 91 | 1 | keep | R5-default | default keep (suffix: repository) |
| tests/posTransactionHistoryQuery.validation.test.js | 28 | 1 | keep | R5-default | default keep (suffix: validation) |
| tests/posUsecases.applicationResult.test.js | 1792 | 47 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/posValidator.affiliateCode.test.js | 93 | 5 | keep | R5-default | default keep (suffix: affiliateCode) |
| tests/posValidator.deliveryAssignment.test.js | 47 | 2 | keep | R5-default | default keep (suffix: deliveryAssignment) |
| tests/posValidator.deliveryPersonnelRegistry.test.js | 95 | 7 | keep | R5-default | default keep (suffix: deliveryPersonnelRegistry) |
| tests/posValidator.deliveryRun.test.js | 192 | 18 | keep | R5-default | default keep (suffix: deliveryRun) |
| tests/posValidator.discountPolicy.test.js | 460 | 17 | keep | R5-default | default keep (suffix: discountPolicy) |
| tests/posValidator.orderHistoryQuery.test.js | 62 | 3 | keep | R5-default | default keep (suffix: orderHistoryQuery) |
| tests/posValidator.reportsOverviewQuery.test.js | 167 | 9 | keep | R5-default | default keep (suffix: reportsOverviewQuery) |
| tests/posValidator.terminalShiftIdentity.test.js | 100 | 6 | keep | R5-default | default keep (suffix: terminalShiftIdentity) |
| tests/posValidator.transactionsQuery.test.js | 78 | 4 | keep | R5-default | default keep (suffix: transactionsQuery) |
| tests/posVoid.route.transport.test.js | 460 | 9 | keep | R5-default | default keep (suffix: route.transport) |
| tests/posVoidFinancialOutcome.test.js | 94 | 6 | keep | R5-default | default keep (suffix: (none)) |
| tests/posVoucherDiscountCalculator.unit.test.js | 135 | 6 | keep | R5-default | default keep (suffix: unit) |
| tests/prepareChatPayloadUseCase.test.js | 88 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/previewMenuImportJobUseCase.test.js | 200 | 10 | keep | R5-default | default keep (suffix: (none)) |
| tests/priceFallbackSource.contract.test.js | 30 | 1 | delete | R3-source-text-only | source-text-only (text_ratio=1) |
| tests/pricelistRoutePermissionParity.test.js | 85 | 6 | keep | R5-default | default keep (suffix: (none)) |
| tests/pricelistUseCases.usecases.test.js | 466 | 22 | keep | R5-default | default keep (suffix: usecases) |
| tests/pricelistValidator.test.js | 99 | 11 | keep | R5-default | default keep (suffix: (none)) |
| tests/processMessageUseCase.test.js | 165 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/processVerifiedPaidCommerceSession.usecase.test.js | 278 | 7 | keep | R5-default | default keep (suffix: usecase) |
| tests/productUsageTelemetryService.test.js | 143 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/productionEcosystemConfig.test.js | 29 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/productionEnvGuard.test.js | 120 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/productionEnvValidation.test.js | 359 | 14 | keep | R5-default | default keep (suffix: (none)) |
| tests/promoteLegacyPosGeneratedBarcodes.migration.test.js | 98 | 3 | keep | R5-default | default keep (suffix: migration) |
| tests/publicSearchAliasPolicy.test.js | 52 | 9 | keep | R5-default | default keep (suffix: (none)) |
| tests/purchaseOrder.test.js | 184 | 4 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/purchaseOrderHandlers.transport.test.js | 257 | 6 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/purchaseOrderToolRegistry.test.js | 169 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/purchaseOrderUsecases.applicationResult.test.js | 187 | 8 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/race_condition_repro.test.js | 85 | 1 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/rateLimiter.behavior.test.js | 548 | 22 | keep | R5-default | default keep (suffix: behavior) |
| tests/rateLimiterExemptionCoverage.contract.test.js | 110 | 7 | consolidate | R4-source-text-mixed | source-text-mixed (text_ratio=0.64) |
| tests/rateLimiterStoreMode.test.js | 45 | 2 | keep | R1-pin | hardcoded reference: apps/dgfy-api/package.json |
| tests/rbacRouteCoverage.contract.test.js | 290 | 5 | delete | R3-source-text-only | source-text-only (text_ratio=0.83) |
| tests/receiptLogoRaster.unit.test.js | 155 | 7 | keep | R5-default | default keep (suffix: unit) |
| tests/receiveTokenHandlers.transport.test.js | 248 | 6 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/receiveTokenUsecases.applicationResult.test.js | 106 | 6 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/registerCompanyRequestUseCase.autoApproval.test.js | 90 | 5 | keep | R5-default | default keep (suffix: autoApproval) |
| tests/registerCompanyRequestUseCase.registrationIndustry.test.js | 211 | 10 | keep | R5-default | default keep (suffix: registrationIndustry) |
| tests/registrationIndustries.contract.test.js | 131 | 10 | keep | R5-default | default keep (suffix: contract) |
| tests/registrationIndustries.transport.test.js | 237 | 10 | keep | R5-default | default keep (suffix: transport) |
| tests/registrationIndustryNiches.test.js | 21 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/reportHandlers.transport.test.js | 490 | 10 | keep | R5-default | default keep (suffix: transport) |
| tests/reportService.poAnalysis.test.js | 94 | 1 | keep | R5-default | default keep (suffix: poAnalysis) |
| tests/reportUsecases.applicationResult.test.js | 100 | 6 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/reproduce_import_bypass.test.js | 202 | 2 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/reproduce_invite_issue.test.js | 89 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/requestContext.middleware.test.js | 103 | 5 | keep | R5-default | default keep (suffix: middleware) |
| tests/requestOutcomeLogger.middleware.test.js | 91 | 2 | keep | R5-default | default keep (suffix: middleware) |
| tests/requirePremium.middleware.test.js | 116 | 4 | keep | R5-default | default keep (suffix: middleware) |
| tests/requireTenantAdmin.middleware.test.js | 48 | 2 | keep | R5-default | default keep (suffix: middleware) |
| tests/requireTenantContext.middleware.test.js | 76 | 4 | keep | R5-default | default keep (suffix: middleware) |
| tests/resolveStoreProfile.usecase.test.js | 205 | 9 | keep | R5-default | default keep (suffix: usecase) |
| tests/roadDistanceProvider.test.js | 121 | 8 | keep | R5-default | default keep (suffix: (none)) |
| tests/routeCalculatorRepository.test.js | 120 | 7 | keep | R5-default | default keep (suffix: (none)) |
| tests/routeCalculatorUseCase.test.js | 93 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/routeCalculatorValidator.test.js | 80 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/rtr_verification.test.js | 222 | 4 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/runtimeSchemaAuditService.test.js | 937 | 11 | keep | R5-default | default keep (suffix: (none)) |
| tests/salesHandlers.transport.test.js | 242 | 8 | keep | R5-default | default keep (suffix: transport) |
| tests/salesRepositoryPromoReadModel.test.js | 66 | 1 | keep | R5-default | default keep (suffix: (none)) |
| tests/salesValidator.transactionsQuery.test.js | 48 | 2 | keep | R5-default | default keep (suffix: transactionsQuery) |
| tests/schemaIndexAuditService.test.js | 185 | 6 | keep | R5-default | default keep (suffix: (none)) |
| tests/securityTransport.middleware.test.js | 75 | 5 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/seedCanonicalTemplatePresets.usecase.test.js | 60 | 3 | keep | R5-default | default keep (suffix: usecase) |
| tests/seedPosCatalogPerformanceItems.test.js | 54 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/seedRegistrationIndustries.migration.test.js | 151 | 8 | keep | R5-default | default keep (suffix: migration) |
| tests/seedStoreConfigurationTemplatePresets.migration.test.js | 157 | 8 | keep | R5-default | default keep (suffix: migration) |
| tests/sentryConfig.test.js | 419 | 34 | keep | R5-default | default keep (suffix: (none)) |
| tests/serviceBookingSettlement.usecases.test.js | 379 | 9 | keep | R5-default | default keep (suffix: usecases) |
| tests/serviceBookingValidator.test.js | 522 | 33 | keep | R5-default | default keep (suffix: (none)) |
| tests/serviceOptions.usecases.test.js | 258 | 5 | keep | R5-default | default keep (suffix: usecases) |
| tests/servicesCatalog.contract.test.js | 234 | 8 | keep | R5-default | default keep (suffix: contract) |
| tests/servicesMode.usecases.test.js | 2511 | 55 | keep | R5-default | default keep (suffix: usecases) |
| tests/settingsCompanyInfo.usecase.test.js | 37 | 2 | keep | R5-default | default keep (suffix: usecase) |
| tests/settingsComplianceChangedKeys.integration.test.js | 110 | 2 | keep | R5-default | default keep (suffix: integration) |
| tests/settingsCustomerAccessModeFulfillmentGuard.usecases.test.js | 140 | 8 | keep | R5-default | default keep (suffix: usecases) |
| tests/settingsHandlers.companyInfo.test.js | 104 | 2 | keep | R5-default | default keep (suffix: companyInfo) |
| tests/settingsHandlers.transport.test.js | 310 | 7 | keep | R5-default | default keep (suffix: transport) |
| tests/settingsStorefrontAsset.usecase.test.js | 225 | 7 | keep | R5-default | default keep (suffix: usecase) |
| tests/settingsUsecases.applicationResult.test.js | 1379 | 58 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/settingsValidator.customerAccessModes.test.js | 195 | 9 | keep | R5-default | default keep (suffix: customerAccessModes) |
| tests/settingsValidator.deliveryFeeMode.test.js | 137 | 9 | keep | R5-default | default keep (suffix: deliveryFeeMode) |
| tests/settingsValidator.orderMethodFees.test.js | 69 | 3 | keep | R5-default | default keep (suffix: orderMethodFees) |
| tests/settingsValidator.posHardwareProfile.test.js | 64 | 3 | keep | R5-default | default keep (suffix: posHardwareProfile) |
| tests/settingsValidator.posSoftwareIdentity.test.js | 47 | 2 | keep | R5-default | default keep (suffix: posSoftwareIdentity) |
| tests/settingsValidator.singleSettingArray.test.js | 245 | 11 | keep | R5-default | default keep (suffix: singleSettingArray) |
| tests/settingsValidator.storefrontPromoDates.test.js | 78 | 3 | keep | R5-default | default keep (suffix: storefrontPromoDates) |
| tests/settingsValidator.terminalRegistry.test.js | 149 | 7 | keep | R5-default | default keep (suffix: terminalRegistry) |
| tests/softDeleteHardeningRegression.test.js | 86 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/stockBearingPolicy.test.js | 220 | 23 | keep | R5-default | default keep (suffix: (none)) |
| tests/stockMovementHandlers.transport.test.js | 234 | 5 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/stockMovementService.serviceMode.test.js | 43 | 1 | keep | R5-default | default keep (suffix: serviceMode) |
| tests/stockMovementToolRegistry.test.js | 115 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/stockMovementUsecases.applicationResult.test.js | 74 | 4 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/storageAndGroupingToolRegistry.test.js | 70 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/storeAuth.dgfyFallback.test.js | 249 | 5 | keep | R5-default | default keep (suffix: dgfyFallback) |
| tests/storeCancelDownpaymentLifecycle.unit.test.js | 174 | 6 | keep | R5-default | default keep (suffix: unit) |
| tests/storeCancelVoucherReversal.unit.test.js | 479 | 11 | keep | R5-default | default keep (suffix: unit) |
| tests/storeCartQuotePreviewNoContactRequired.unit.test.js | 108 | 4 | keep | R5-default | default keep (suffix: unit) |
| tests/storeCashPaymentDisabledEnforcement.usecase.test.js | 178 | 3 | keep | R5-default | default keep (suffix: usecase) |
| tests/storeCatalogPaymentMode.unit.test.js | 139 | 5 | keep | R5-default | default keep (suffix: unit) |
| tests/storeCheckoutAffiliatePricing.unit.test.js | 466 | 13 | keep | R5-default | default keep (suffix: unit) |
| tests/storeCheckoutAutoAppliedDelivery.unit.test.js | 571 | 11 | keep | R5-default | default keep (suffix: unit) |
| tests/storeCheckoutCalculatedDeliveryFee.unit.test.js | 380 | 10 | keep | R5-default | default keep (suffix: unit) |
| tests/storeCheckoutDeliveryFeePin.unit.test.js | 719 | 12 | keep | R5-default | default keep (suffix: unit) |
| tests/storeCheckoutDeliveryFeeThreeEntryPointConsistency.unit.test.js | 252 | 1 | consolidate | R4-thin-file | thin-file (1 cases in 252 lines) |
| tests/storeCheckoutDeliveryWaiverDualAxis.unit.test.js | 662 | 15 | keep | R5-default | default keep (suffix: unit) |
| tests/storeCheckoutDownpaymentResolution.unit.test.js | 1016 | 18 | keep | R5-default | default keep (suffix: unit) |
| tests/storeCheckoutInventoryReservation.unit.test.js | 142 | 2 | keep | R5-default | default keep (suffix: unit) |
| tests/storeCheckoutRoadDistanceCapture.unit.test.js | 253 | 7 | keep | R5-default | default keep (suffix: unit) |
| tests/storeCheckoutVoucherPromoStacking.unit.test.js | 128 | 3 | keep | R5-default | default keep (suffix: unit) |
| tests/storeConfigurationTemplateHandlers.test.js | 81 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/storeConfigurationTemplateRepository.canonical.test.js | 93 | 2 | keep | R5-default | default keep (suffix: canonical) |
| tests/storeConfigurationTemplateUseCases.test.js | 317 | 14 | keep | R5-default | default keep (suffix: (none)) |
| tests/storeDirectGcash.usecase.test.js | 355 | 3 | keep | R5-default | default keep (suffix: usecase) |
| tests/storeFnbModifiers.usecases.test.js | 1061 | 24 | keep | R1-pin | hardcoded reference: .github/workflows/promotion-quality-gate.yml, scripts/run-fnb-readiness-gate.js |
| tests/storeGuestCheckoutOtp.unit.test.js | 105 | 5 | keep | R5-default | default keep (suffix: unit) |
| tests/storeGuestCheckoutProof.test.js | 46 | 5 | keep | R5-default | default keep (suffix: (none)) |
| tests/storeHandlers.transport.test.js | 239 | 5 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/storeJwtToken.tenantIdentifier.test.js | 13 | 2 | keep | R5-default | default keep (suffix: tenantIdentifier) |
| tests/storePaymentTruth.unit.test.js | 84 | 4 | keep | R5-default | default keep (suffix: unit) |
| tests/storeProfile.equivalence.contract.test.js | 230 | 16 | keep | R1-pin | snapshot guard |
| tests/storeRepository.locationStockFallback.test.js | 392 | 11 | keep | R5-default | default keep (suffix: locationStockFallback) |
| tests/storeRepositoryPromoPersistence.test.js | 158 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/storeRouteTenantContext.integration.test.js | 155 | 5 | keep | R5-default | default keep (suffix: integration) |
| tests/storeSandboxQrphConfirmation.usecase.test.js | 117 | 4 | keep | R5-default | default keep (suffix: usecase) |
| tests/storeUsecases.applicationResult.test.js | 2535 | 58 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/storeValidator.fnbModifiers.test.js | 47 | 2 | keep | R1-pin | hardcoded reference: .github/workflows/promotion-quality-gate.yml, scripts/run-fnb-readiness-gate.js |
| tests/storeValidator.follow.test.js | 69 | 3 | keep | R5-default | default keep (suffix: follow) |
| tests/storefrontBusinessHours.test.js | 103 | 7 | keep | R5-default | default keep (suffix: (none)) |
| tests/storefrontCatalogGenerateImageUseCases.disabled.test.js | 32 | 2 | keep | R5-default | default keep (suffix: disabled) |
| tests/storefrontCatalogGenerateImageUseCases.test.js | 105 | 8 | keep | R5-default | default keep (suffix: (none)) |
| tests/storefrontCatalogImagePersistence.integration.test.js | 145 | 1 | keep | R5-default | default keep (suffix: integration) |
| tests/storefrontCatalogUseCases.test.js | 1254 | 26 | keep | R5-default | default keep (suffix: (none)) |
| tests/storefrontDiscoveryFreshnessService.test.js | 57 | 1 | keep | R5-default | default keep (suffix: (none)) |
| tests/storefrontDiscoveryIndexService.catalogVisibility.test.js | 601 | 7 | keep | R5-default | default keep (suffix: catalogVisibility) |
| tests/storefrontDiscoveryMapPins.usecase.test.js | 207 | 4 | keep | R5-default | default keep (suffix: usecase) |
| tests/storefrontDiscoveryRepository.test.js | 1036 | 30 | keep | R5-default | default keep (suffix: (none)) |
| tests/storefrontDiscoverySyncReliabilityService.test.js | 107 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/storefrontDiscoveryValidator.test.js | 125 | 6 | keep | R5-default | default keep (suffix: (none)) |
| tests/storefrontDomain.controllerAuth.test.js | 96 | 3 | keep | R5-default | default keep (suffix: controllerAuth) |
| tests/storefrontDomain.dnsVerification.test.js | 97 | 5 | keep | R5-default | default keep (suffix: dnsVerification) |
| tests/storefrontDomain.handlers.test.js | 98 | 4 | keep | R5-default | default keep (suffix: handlers) |
| tests/storefrontDomain.hostnamePolicy.test.js | 29 | 3 | keep | R5-default | default keep (suffix: hostnamePolicy) |
| tests/storefrontDomain.operations.test.js | 118 | 3 | keep | R5-default | default keep (suffix: operations) |
| tests/storefrontDomain.usecases.test.js | 202 | 5 | keep | R5-default | default keep (suffix: usecases) |
| tests/storefrontFollowUseCases.slugAlignment.test.js | 52 | 1 | keep | R5-default | default keep (suffix: slugAlignment) |
| tests/storefrontPrimaryLocation.discovery.integration.test.js | 297 | 1 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/storefrontPublicVisibilityAuditService.test.js | 314 | 9 | keep | R5-default | default keep (suffix: (none)) |
| tests/storefrontTenantResolver.test.js | 158 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/storefrontVouchersDiscoveryIndexPersistence.contract.test.js | 33 | 2 | consolidate | R4-source-text-mixed | source-text-mixed (text_ratio=0.75) |
| tests/subscriptionIntegration.test.js | 52 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/supertest_security.test.js | 171 | 4 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/supplierHandlers.transport.test.js | 160 | 3 | consolidate | R4-transport-responder-only | transport-responder-only (>=90% call/res assertions, <=6 cases) |
| tests/supplierSoftDeletePolicy.test.js | 76 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/supplierToolRegistry.test.js | 94 | 4 | keep | R5-default | default keep (suffix: (none)) |
| tests/supplierUsecases.applicationResult.test.js | 78 | 4 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/tempFileService.local.test.js | 71 | 2 | keep | R1-pin | hardcoded reference: apps/dgfy-api/package.json |
| tests/tenantAdminAuditLogActions.contract.test.js | 28 | 1 | delete | R3-source-text-only | source-text-only (text_ratio=1) |
| tests/tenantAffiliateSlotsAdminUseCase.unit.test.js | 208 | 10 | keep | R5-default | default keep (suffix: unit) |
| tests/tenantAffiliateSlotsValidator.test.js | 50 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/tenantBootstrapManifest.test.js | 56 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/tenantCapabilityReadiness.schemaCompatibility.test.js | 84 | 1 | keep | R5-default | default keep (suffix: schemaCompatibility) |
| tests/tenantCapabilityRouteGates.test.js | 74 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/tenantCapabilitySettings.test.js | 136 | 8 | keep | R5-default | default keep (suffix: (none)) |
| tests/tenantConnector.evictionSafety.unit.test.js | 301 | 9 | keep | R5-default | default keep (suffix: evictionSafety.unit) |
| tests/tenantCredentialSurface.security.test.js | 33 | 2 | demote | R0-override | import-only; no real query issued |
| tests/tenantHandler.emailOtp.test.js | 532 | 13 | keep | R5-default | default keep (suffix: emailOtp) |
| tests/tenantHandler.storefrontDomain.test.js | 156 | 7 | keep | R5-default | default keep (suffix: storefrontDomain) |
| tests/tenantIndexHeadroomScripts.test.js | 80 | 2 | keep | R5-default | default keep (suffix: (none)) |
| tests/tenantLocationDeliveryTimingPolicy.usecases.test.js | 411 | 11 | keep | R5-default | default keep (suffix: usecases) |
| tests/tenantLocationFulfillmentMethodGuard.usecases.test.js | 282 | 7 | keep | R5-default | default keep (suffix: usecases) |
| tests/tenantLocationReferenceSources.coverage.test.js | 82 | 2 | keep | R5-default | default keep (suffix: coverage) |
| tests/tenantLocationRepository.referenceGuard.test.js | 81 | 3 | keep | R5-default | default keep (suffix: referenceGuard) |
| tests/tenantLocationUsecases.applicationResult.test.js | 445 | 11 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/tenantLocationValidator.deliveryTimingPolicy.test.js | 143 | 8 | keep | R5-default | default keep (suffix: deliveryTimingPolicy) |
| tests/tenantModelFactory.contract.test.js | 133 | 3 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/tenantOrderPaymentLedgerRepository.unit.test.js | 303 | 16 | keep | R5-default | default keep (suffix: unit) |
| tests/tenantProvisioning.storefrontBootstrap.test.js | 123 | 1 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/tenantProvisioning.test.js | 334 | 7 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/tenantProvisioningAdminUserId.test.js | 44 | 2 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/tenantProvisioningStoreProfileProvenance.test.js | 280 | 9 | keep | R5-default | default keep (suffix: (none)) |
| tests/tenantRevenue.money.test.js | 117 | 9 | keep | R5-default | default keep (suffix: money) |
| tests/tenantRevenue.security.contract.test.js | 73 | 5 | delete | R3-source-text-only | source-text-only (text_ratio=0.85) |
| tests/tenantRevenue.usecases.test.js | 677 | 14 | keep | R5-default | default keep (suffix: usecases) |
| tests/tenantRevenueMigration.contract.test.js | 52 | 4 | delete | R3-source-text-only | source-text-only (text_ratio=1) |
| tests/tenantRevenueRepository.schemaCompatibility.test.js | 22 | 1 | delete | R3-source-text-only | source-text-only (text_ratio=1) |
| tests/tenantSchemaBootstrap.integration.test.js | 80 | 2 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/tenantSchemaRegistryCoverageScript.unit.test.js | 245 | 17 | keep | R5-default | default keep (suffix: unit) |
| tests/tenantSchemaSyncScripts.test.js | 571 | 27 | keep | R5-default | default keep (suffix: (none)) |
| tests/toctou_integration.test.js | 224 | 2 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/token_refresh_race.test.js | 194 | 4 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/updateTenantCapabilitiesFulfillmentGuard.usecases.test.js | 172 | 3 | keep | R5-default | default keep (suffix: usecases) |
| tests/updateTenantCapabilitiesUseCase.rollback.test.js | 163 | 2 | keep | R5-default | default keep (suffix: rollback) |
| tests/uploadCachePolicy.test.js | 31 | 3 | keep | R5-default | default keep (suffix: (none)) |
| tests/uploadConfig.contract.test.js | 91 | 3 | keep | R5-default | default keep (suffix: contract) |
| tests/useCaseResponder.test.js | 177 | 10 | keep | R5-default | default keep (suffix: (none)) |
| tests/userHandlers.transport.test.js | 363 | 7 | keep | R5-default | default keep (suffix: transport) |
| tests/userManagementToolRegistry.test.js | 367 | 10 | keep | R5-default | default keep (suffix: (none)) |
| tests/userService.modeRbac.test.js | 212 | 3 | keep | R5-default | default keep (suffix: modeRbac) |
| tests/userSoftDeletePolicy.test.js | 217 | 7 | keep | R5-default | default keep (suffix: (none)) |
| tests/userUsecases.applicationResult.test.js | 135 | 8 | keep | R5-default | default keep (suffix: applicationResult) |
| tests/userValidator.posDayClosePin.test.js | 43 | 3 | keep | R5-default | default keep (suffix: posDayClosePin) |
| tests/voidMovement.supertest.test.js | 666 | 15 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/voidMovement.test.js | 475 | 10 | keep | R1-pin | hardcoded reference: scripts/backend-db-dependent-tests.js |
| tests/voucherBenefitPolicy.unit.test.js | 174 | 14 | keep | R5-default | default keep (suffix: unit) |
| tests/voucherBenefitPolicyDeliveryTarget.unit.test.js | 306 | 15 | keep | R5-default | default keep (suffix: unit) |
| tests/voucherDisplayUseCases.usecases.test.js | 337 | 16 | keep | R5-default | default keep (suffix: usecases) |
| tests/voucherEligibilityPolicy.unit.test.js | 474 | 43 | keep | R5-default | default keep (suffix: unit) |
| tests/voucherFolderScope.unit.test.js | 107 | 9 | keep | R5-default | default keep (suffix: unit) |
| tests/voucherRedemptionUseCases.usecases.test.js | 730 | 32 | keep | R5-default | default keep (suffix: usecases) |
| tests/voucherReversalUseCases.usecases.test.js | 226 | 6 | keep | R5-default | default keep (suffix: usecases) |
| tests/voucherUseCases.usecases.test.js | 994 | 52 | keep | R5-default | default keep (suffix: usecases) |
| tests/voucherValidator.test.js | 572 | 63 | keep | R5-default | default keep (suffix: (none)) |
| tests/workflowCapabilities.enforcement.contract.test.js | 47 | 2 | keep | R5-default | default keep (suffix: enforcement.contract) |
| tests/workflowCapabilitySettingsCache.test.js | 106 | 7 | keep | R5-default | default keep (suffix: (none)) |
| tests/workflowModeAuditLog.usecase.test.js | 222 | 11 | keep | R5-default | default keep (suffix: usecase) |
| tests/workflowModeCapability.middleware.test.js | 164 | 7 | keep | R5-default | default keep (suffix: middleware) |
| tests/workflowModes.crossLayer.contract.test.js | 243 | 22 | keep | R5-default | default keep (suffix: crossLayer.contract) |

Generated by `npm run audit:backend-tests`. Do not edit by hand.

<!-- backend-test-inventory:end -->

## 5. Before/after

**File/case/line counts — measured, deterministic** (via `git show HEAD:apps/dgfy-api/tests/<f>`
for each removed/trimmed file's pre-cut content, cross-checked against the generated inventory's
post-cut sums):

| Metric | Before (`c16cc6b50`) | After (this PR) | Delta |
|---|---|---|---|
| Active test files | 652 | 637 | −15 (11 deleted + 4 folded into siblings) |
| Total cases | 4,536 | 4,520 | −16 (14 from the 11 deletions, 2 from the `employeeCreditMigration` trim; the 4 consolidations moved 7 cases with zero net loss) |
| Total lines | 138,704 | 137,883 | −821 |
| db-manifest members | 36 | 30 | −6 (1 removed with its file, 5 demoted to the fast tier — see below) |

**Wall-clock and peak-memory — could not be completed in this session's environment**, despite
three separate attempts, and that is itself a finding worth recording rather than glossing over:

1. **The host-forwarded `127.0.0.1:3306`/`6379` this task's brief assumed were the
   `dgfy-mysql-test`/`dgfy-redis-test` containers were not** — see the environment note in section
   2. Redirected to the documented containerized path per the coordinator's explicit direction.
2. **A full fast-tier run (608 files, `--maxWorkers=4`, `DB_PORT=1`) did not complete within 600s,
   then did not complete within 900s** on the second attempt (`BACKEND_TEST_MATRIX_CHUNK_TIMEOUT_MS`
   raised from the 600000ms default) — both attempts were killed by the timeout with 11
   `jest-worker` children still actively consuming CPU, not hung. The plan's own baseline for this
   same tier is 156–215s; this sandbox ran 4–6× slower with no single identified cause (host has 12
   physical CPUs; likely virtualization/IO overhead specific to this session's sandbox, not
   reproducible evidence of a real regression in the suite itself, since these same files are
   unmodified by this PR).
3. **The containerized db-tier `compliance_pos_fiscal` group also timed out** at the same 600s
   default; the log shows a single file, `tests/posSalesReconciliation.db.integration.test.js`
   (untouched by this PR), took 540.789s and then failed on a `mysql2` "packets out of order"
   protocol-level warning — evidence of connection instability under this session's concurrent
   host+container load, not a defect this PR introduced or one the suite exhibits in a properly
   provisioned environment.

**What was verified instead, reliably:** every file this PR actually touches (all 11 deletions'
replacements, all 4 consolidation targets, all 3 trims, all 5 surviving demotions, and the
`e2e-full-cycle.test.js` fix) was run directly and individually under both fast-tier conditions
(`DB_PORT=1`, unreachable — see the manifest re-proof below) and, for the demoted files, this is
what caught a real error in the plan: `paymentAtomicity.test.js` was planned as a 6th demotion but
failed this re-proof (`jest.spyOn(db.sequelize, 'transaction')` still opens a real transaction
inside `handleWebhook`, so it needs a reachable DB even though the model methods are mocked) — kept
on the manifest, not demoted. The other 5 demotions and every edited file pass:

```
Test Suites: 5 passed, 5 total   (the 5 surviving demoted files, DB_PORT=1)
Tests:       16 passed, 16 total
```

**This section's honest bottom line, matching the Verification section's own stated fallback**: the
file/case/line counts above are load-bearing and correct. Wall-clock and peak-RSS/heap numbers are
not available from this session and should not be fabricated or extrapolated from the plan's
historical numbers as if they were re-measured. The actual proof of the fast-tier/db-tier timing
impact of this PR's cuts is the next `promotion-quality-gate.yml` run's `fast-tier.log` and
`tenant_storefront_modes`/`compliance_pos_fiscal` chunk durations on a properly provisioned
2-worker/7GB CI runner — a different, already-documented envelope from either this session's
sandbox or the plan's original measurement machine. PR-D (Phase 255) is where a repeat of this
attempt, on infrastructure that can actually sustain a 200+s run, matters most — its whole premise
is measuring the db-tier tenant-sync consolidation's wall-clock impact.

## 6. Per-family rationale

- **Transport/responder-only files** (`R4-transport-responder-only`, ~`transport-responder-only`
  tag in the generated inventory above): a `.transport` file whose assertions are ≥90%
  `res.status`/`res.json`/`toHaveBeenCalledWith` checks and has ≤6 cases is proving the
  `sendUseCaseResult` envelope, not the handler's own logic — `tests/useCaseResponder.test.js`
  already covers that envelope once, centrally. None of these are touched in PR-A; they're PR-C's
  scope (trims), left in the generated inventory as candidates.
- **Hand-enumerated barrels** (`R4-hand-enumerated-barrel`): a file whose
  `jest.unstable_mockModule` factory hand-lists ≥40 stubs for a wide barrel (`posHandlers.js`,
  `posController.js`'s `export default {}`) rots the moment the barrel adds an export — exactly
  what happened three times already (#1432's three POS module/controller mock fixes). PR-B replaces
  this with a static-parse helper that derives the stub list from the real module.
- **Source-text-only/mixed** (`R3-source-text-only`, `R4-source-text-mixed`): a `readFileSync` +
  `toContain`/`toMatch` test pins literal source text rather than behavior — it breaks on a harmless
  rename/reformat and passes on a real logic bug. 22 files with this shape were kept anyway (see
  below) because the literal text they pin *is* the guarantee (a negative, an ordering invariant, an
  incident-driven regression guard, or a compliance-cited case) — the rule engine's ratio signal
  alone can't distinguish "pins an incidental implementation detail" from "pins the actual
  contract," which is exactly why the overrides file exists.
- **DB-tier tenant syncs**: the actual gate-seconds cost is concentrated in `createTestTenant()`'s
  139-table `sync({force:true})`, not file count — 12 calls across 8 files. PR-A's 6 demotions save
  memory/maintenance (files, per-file heap) without touching a single sync call; PR-D is where the
  matrix's wall-clock actually moves.
- **Duplicate stems**: `posDiscountCalculator.test.js`/`.unit.test.js` looked like a duplicate pair
  by naming convention alone, but a per-file read showed the non-`.unit` file exercises a legacy
  `vat_type` alias and `lines: []` auto-select semantics the `.unit` file never covers — folded, not
  deleted, and the two folded cases are why the file count drops by more than the delete count.

**What was *not* cut, and why:**

| Category | Example | Why kept |
|---|---|---|
| Compliance-cited transport cases | `posHandlers.transport.test.js` (`checkout returns 201…`, day-close/reading cases), `reportHandlers.transport.test.js` (compliance books package cases), `complianceActivation*.transport.test.js`, `rbacRouteCoverage.contract.test.js` | Cited by name in `docs/compliance/DGFY Compliance Certification Checklist.md` and the compliance evidence matrices — keep-by-policy regardless of shape |
| ADR-cited store-profile guards | `storeConfigurationTemplateUseCases.test.js`, `tenantProvisioningStoreProfileProvenance.test.js`, `storeProfile.equivalence.contract.test.js` | ADR 0056 cl.2 `[binding]`/cl.4 `[default]` name these as the proof that editing a published template changes zero tenants |
| Hardcoded-gate files | `fnbMode.usecases.test.js`, `fnbModifierCondition.migration.test.js`, `storeValidator.fnbModifiers.test.js`, `effectiveFnbModifierGroups.test.js`, `fnbFolderModifierAssignments.migration.test.js`, `fnbOperationalReadiness.qa.test.js` | Named directly in `scripts/run-fnb-readiness-gate.js` and/or `.github/workflows/promotion-quality-gate.yml` |
| db-manifest members | all 29 (post-demotion) files on `scripts/backend-db-dependent-tests.js` | Need a real MySQL connection; not a value question this audit answers, that's #1015/PR-D's territory |
| `token_refresh_race.test.js` | — | Distinct from the deleted `_integration` sibling: runs against the mocked Redis in the fast/db tier and its 4 cases don't fully overlap with `rtr_verification` |

## 7. Stale/dead correctness findings

Reported here as findings, not all fixed in this PR (only the `e2e-full-cycle.test.js` false-green
is fixed in PR-A — see the "Correctness fix" commit):

1. **`tests/e2e-full-cycle.test.js`'s `itIfRuntimeReady` false-green — fixed in this PR.** L51-60
   returned early and reported PASS for all 20 cases when `auditRuntimeSchemaReadiness` found the
   runtime schema unhealthy. `beforeAll` now throws, naming the audit's issue list, so the suite
   fails loudly instead of silently green.
2. **`tests/token_refresh_race_integration.test.js` — deleted in this PR.** Never executed in any
   gate (`TEST_TYPE=integration` is never set by the matrix). Case 1.6 (sequential RTR, used token
   blacklisted) is covered by `rtr_verification.test.js`'s "RT1 used twice"; case 1.5 (6 concurrent
   refresh calls, no distributed lock, real Redis) has **no equivalent coverage anywhere that
   runs** — flagged for PR-D.
3. **`jest.integration.cjs` dead — deleted in this PR.** Its own `testMatch` only ever pointed at
   `supertest_security.test.js`, but nothing invoked this config file; `test:integration` used
   `jest.config.cjs` directly. Confirmed via a repo-wide grep before deletion.
4. **`test:coverage`/`test:watch` broken.** `apps/dgfy-api/package.json:26-27` invoke bare `jest`
   with no `--config`, so neither resolves `jest.config.cjs`'s `roots`/`moduleNameMapper`. Not
   repaired here — filed as a follow-up (section 9).
5. **`docs/testing/README.md`'s "one file per chunk" sentence — corrected in this PR.** The fast
   tier is one worker-mode Jest invocation with real parallelism, not per-file chunking; only the db
   tier chunks (8 files/chunk).
6. **~21 `npm --prefix backend` commands across live and historical docs cannot run** (`backend/`
   was relocated to `apps/dgfy-api/` — see `docs/architecture/apps-layout-migration.md`). Not
   corrected here: the historical-run-log instances (e.g.
   `docs/testing/pos-readiness-status.md`'s dated `### 3.15` section, which transcribes a real
   command that ran under the old path on 2026-05-05) are deliberately left as history per that
   doc's own leave-alone list; any surviving *live*, non-dated instance is filed as a follow-up
   (section 9) rather than patched ad hoc in this PR, since a full sweep is bigger than PR-A's scope.
7. **No dead tests found beyond the two above.** Every `../src` import in the active suite resolves
   on disk; all remaining `describe.skip`/`it.skip` sites are deliberate env-gated aliases
   (`TEST_TYPE`, `RUN_BROWSER_E2E`) with a real caller, not orphaned code — see the generated
   `always-pending-in-matrix` findings above for the browser-E2E files this applies to.
8. **No export-shape smoke-test file exists** (a hypothesis considered and falsified during
   planning) and **25/29 `.migration.test.js` files run the migration against a real, mocked
   `queryInterface`** rather than merely asserting on source text — the source-text-only rule
   engine hits among the `.migration.` suffix are a real minority, not the norm.

## 8. Frontend/lint statement

**Did not warrant this audit**, for three separate reasons:

1. **Lint gates are ESLint** (`npm run lint` in each workspace) — there's no "does this test earn
   its cost" question to ask of a static-analysis rule set the way there is for a Jest suite full of
   individually-authored test files.
2. **The two Vitest gates that actually run in the release gate are already cheap.** Per the release
   gate's own recorded history (`.tmp/release-gates/*/local_readiness.json` in prior runs, cited in
   this issue's own exploration — not reproducible from this worktree, which carries no gate
   history of its own): `frontend.contracts` ~8.7s, `frontend.storefront.contracts` ~12.8s, versus
   `backend.test_matrix` at 216–369s. A 9–13s gate isn't where a subtraction-by-audit exercise pays
   for itself the way a 200+s gate does.
3. **The full frontend suites are not in any release gate at all.** `packages/web-core` (319 files /
   ~1,930 cases), `apps/dgfy-storefront` (180 / ~942), `apps/dgfy-ims` (19), `apps/dgfy-pos` (11) —
   ~530 files / ~2,900 cases total — never run as part of `gate:release:local` or CI; only the
   `contract.test`/`integration.test` Vitest subsets do (`scripts/gate-release-local.js:13-33`, root
   `package.json`). Auditing tests that never gate anything is a different, lower-priority question
   than this issue asks; explicitly out of scope here, not silently skipped.

## 9. Follow-ups

Filed via `pm` after this PR (Refs #1441; not implemented here):

- Repair `test:coverage`/`test:watch` (`apps/dgfy-api/package.json:26-27`) — missing `--config`.
- Wire `audit:backend-tests:check` into `scripts/pr-checks.js`'s dgfy-api block, conditioned on
  `apps/dgfy-api/tests/**` changing — gate placement is #1147/#1431 territory, not decided here.
- A full sweep of live (non-historical) `npm --prefix backend` references outside this PR's own
  touched files (section 7, finding 6).
- PR-B (Phase 253) — static-parse POS barrel-mock helper.
- PR-C (Phase 254) — transport/source-text trims across the ~20 remaining files this audit's rule
  engine flags as `consolidate` (compliance-cited cases untouched).
- PR-D (Phase 255) — db-tier tenant-sync consolidation (`token_refresh_race`,
  `supertest_security`, `voidMovement.supertest`); this is where matrix wall-clock actually moves,
  and where case 1.5's uncovered scenario (finding 2 above) should be re-evaluated.

## 10. Generated inventory

The full per-file classification table is generated by `npm run audit:backend-tests` between the
`<!-- backend-test-inventory:start -->`/`<!-- backend-test-inventory:end -->` markers above this
section. Do not edit that region by hand — regenerate it instead.
