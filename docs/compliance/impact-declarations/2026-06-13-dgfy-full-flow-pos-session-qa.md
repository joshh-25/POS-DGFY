---
status: reference
owner: engineering
last_reviewed: 2026-06-13
related_adr: docs/architecture/adr/0023-front-facing-dgfy-customer-account.md
declaration_id: 2026-06-13-dgfy-full-flow-pos-session-qa
classification: regulatory
surfaces: pos,terminal,storefront,dgfy_account,tenant_registration,inventory,settings,compliance,admin,commerce_payments
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,UNAUTHORIZED,RESOURCE_NOT_FOUND,CONFLICT
policy_version: 2026.06.13
verification_evidence: npm run check:architecture,npm run lint:docs,npm --prefix backend test -- --runTestsByPath focused-dgfy-pos-storefront-matrix,npm --prefix frontend test -- focused-dgfy-pos-storefront-matrix,npm --prefix frontend run build:skupervisor,npm --prefix frontend run build:pos,npm --prefix frontend run build:store,scripts/deploy-remote.sh --yes production deploy b40f2d96
rollback_note: Revert the DGFY browser-session hardening, POS terminal UI contract restorations, and QA matrix/documentation slice together if account handoff, POS terminal operation, or compliance gate behavior regresses.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-13T00:00:00+08:00
preflight_request_ref: DGFY-FULL-FLOW-POS-SESSION-QA-2026-06-13
---

# DGFY Full-Flow POS Session QA

## Compliance Impact Classification

Regulatory.

This update touches POS terminal UI components while validating the full DGFY account to checkout to POS fulfillment path. The changed POS frontend files are compliance-sensitive because they affect terminal identity propagation, shift controls, scanner behavior, receipt/history actions, and terminal workspace controls. The DGFY session changes are included because they affect how tenant sessions and DGFY account sessions are restored without browser-readable privileged token storage. The admin service and commerce payment route changes are included because platform-admin DGFY account, tenant capability, and PayMongo readiness operations must call mounted backend contracts instead of undefined frontend service methods.

## Affected Surfaces

1. DGFY and SKUpervisor browser session handling.
2. POS terminal barcode scanner keyboard-wedge submission.
3. POS terminal shift-controls workspace and operating location selector.
4. POS transaction history receipt action labels.
5. POS terminal sidebar scroll-zone affordance.
6. IMS item/product wizard modal sizing contract.
7. QA documentation for account, business registration, onboarding, checkout, POS, and inventory verification.

## Compliance Preconditions

1. Access, refresh, company, DGFY account, Storefront, and admin privileged tokens must not be stored in browser-readable storage.
2. DGFY auth and handoff failures must not trigger tenant-session refresh recovery.
3. POS checkout payloads must use a normalized terminal identifier when one is selected.
4. POS scanner keyboard-wedge input must route scanned codes through the scanner service before mutating cart state.
5. Receipt history actions must remain receipt-focused; pending offline rows must not be represented as synced receipts.
6. Shift controls must continue to expose operating-location selection without exposing incoming online queue controls in MSME-only mode.
7. Platform-admin DGFY account, tenant capability, and commerce payment operations must resolve to mounted authenticated backend routes.
8. Production deployment must use lockfiles and dependency declarations that pass deterministic `npm ci`; runtime builds must not depend on undeclared local `node_modules` packages.

## Verification Evidence

Local validation recorded for this update set:

1. `npm run check:architecture` passed.
2. `npm run lint:docs` passed.
3. `npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js tests/authEmailOtpTenantScope.test.js tests/tenantHandler.emailOtp.test.js tests/emailOtpService.test.js tests/dgfyTenantSession.transport.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js tests/dgfyCustomerUseCases.test.js tests/dgfyCustomerHandlers.transport.test.js tests/customerActivityRecorder.test.js tests/browserSessionCookies.test.js` passed.
4. `npm --prefix backend test -- --runTestsByPath tests/onboardingHandlers.transport.test.js tests/onboardingUsecases.applicationResult.test.js tests/onboardingRepository.schemaCompatibility.test.js tests/itemHandlers.transport.test.js tests/inventoryItemRepository.test.js tests/storefrontCatalogUseCases.test.js tests/storefrontDiscoveryRepository.test.js tests/storefrontDiscoveryMapPins.usecase.test.js tests/customerAccessPolicy.test.js tests/storeHandlers.transport.test.js tests/storeUsecases.applicationResult.test.js tests/posHandlers.transport.test.js tests/posCheckout.db.integration.test.js tests/posRepository.locationStockFallback.test.js tests/posSalesReconciliation.db.integration.test.js` passed after aligning the POS transport mock with the current device use-case exports.
5. `npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx apps/store/src/__tests__/profileLauncher.integration.test.jsx src/services/__tests__/dgfyAuthService.cookieSession.test.js src/services/__tests__/browserTokenStorage.guard.test.js src/services/__tests__/api.interceptor.test.js --testTimeout 20000` passed.
6. `npm --prefix frontend test -- apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/checkoutRules.test.js apps/store/src/__tests__/customerAccess.test.js apps/store/src/__tests__/storefrontErrorMessages.test.js src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx src/features/inventory/__tests__/ProductCreateWizard.behavior.test.jsx src/features/inventory/__tests__/itemProductWizard.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/receiptContractConformance.contract.test.js src/features/pos/__tests__/terminalLocationScope.integration.test.jsx --testTimeout 20000` passed.
7. `npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js tests/dgfyCustomerUseCases.test.js tests/dgfyAdminAccountRoutes.contract.test.js tests/dgfyAdminAccountHandlers.transport.test.js tests/dgfyAdminAccountUseCases.test.js tests/adminTenantCapabilities.transport.test.js tests/adminTenantHandlers.transport.test.js tests/listTenantCapabilityAuditLogs.usecase.test.js tests/commercePaymentValidator.test.js tests/commercePaymentSettlement.usecases.test.js tests/commercePaymentRefunds.usecases.test.js tests/commercePaymentReadiness.usecases.test.js tests/commercePaymentRouteMount.contract.test.js` passed.
8. `npm --prefix frontend test -- --run src/services/__tests__/adminService.adminOperations.contract.test.js src/services/__tests__/browserTokenStorage.guard.test.js src/features/pos/__tests__/terminalSessionSource.contract.test.js src/pages/__tests__/DgfyAccountManager.integration.test.jsx src/pages/__tests__/TenantManager.capabilities.integration.test.jsx apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/profileLauncher.integration.test.jsx --testTimeout 20000` passed.
9. `npm --prefix frontend run build:skupervisor`, `npm --prefix frontend run build:pos`, and `npm --prefix frontend run build:store` passed. `build:skupervisor` no longer emits `IMPORT_IS_UNDEFINED` warnings for DGFY account admin, tenant capability, or commerce payment admin service calls.
10. In-app Browser rendered smoke passed for local preview routes `/dgfy/auth`, `/dgfy/reset-password`, `/register-company`, `/map-dgfy`, `/map-dgfy/account`, and POS `/` on desktop; `/dgfy/auth`, `/map-dgfy`, `/map-dgfy/account`, and POS `/` also passed practical mobile-width smoke. Browser interactions verified discovery search input and the DGFY auth sign-in mode toggle without submitting mutations.
11. `npm --prefix backend ci --ignore-scripts` passed after syncing `backend/package-lock.json` with `backend/package.json`.
12. `npm --prefix frontend ci --ignore-scripts` and `npm --prefix frontend run build:skupervisor` passed after declaring `fuse.js` as a frontend dependency.
13. Production deploy completed for runtime code SHA `b40f2d96e513a1a259d423df91d0ccf406521c6c` with deploy summary `/var/www/skupervisor/logs/deploy/deploy_20260613_162435.summary.txt`. Backend health, IMS/POS/Store runtime checks, public endpoint checks, tenant-store asset integrity, frontend asset parity, tenant schema sync, tenant schema regression gate, tenant index headroom, permission backfill, Storefront discovery reconciliation, and PM2 reload passed.
14. Post-deploy read-only rendered smoke passed for `https://skupervisor.dgfy.ph/dgfy/auth`, `https://skupervisor.dgfy.ph/dgfy/reset-password`, `https://skupervisor.dgfy.ph/register-company`, `https://dgfy.ph/map-dgfy`, `https://dgfy.ph/map-dgfy/account`, and `https://pos.dgfy.ph` on desktop where applicable; DGFY auth, Storefront discovery/account, and POS also passed mobile smoke. Guest/locked surfaces emitted expected unauthenticated API responses but no framework overlay.
