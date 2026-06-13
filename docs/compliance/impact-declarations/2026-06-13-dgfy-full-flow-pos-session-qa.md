---
status: reference
owner: engineering
last_reviewed: 2026-06-13
related_adr: docs/architecture/adr/0023-front-facing-dgfy-customer-account.md
declaration_id: 2026-06-13-dgfy-full-flow-pos-session-qa
classification: regulatory
surfaces: pos,terminal,storefront,dgfy_account,tenant_registration,inventory
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,UNAUTHORIZED,RESOURCE_NOT_FOUND,CONFLICT
policy_version: 2026.06.13
verification_evidence: npm run check:architecture,npm run lint:docs,npm --prefix backend test -- --runTestsByPath focused-dgfy-pos-storefront-matrix,npm --prefix frontend test -- focused-dgfy-pos-storefront-matrix,npm --prefix frontend run build:skupervisor,npm --prefix frontend run build:pos,npm --prefix frontend run build:store
rollback_note: Revert the DGFY browser-session hardening, POS terminal UI contract restorations, and QA matrix/documentation slice together if account handoff, POS terminal operation, or compliance gate behavior regresses.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-13T00:00:00+08:00
preflight_request_ref: DGFY-FULL-FLOW-POS-SESSION-QA-2026-06-13
---

# DGFY Full-Flow POS Session QA

## Compliance Impact Classification

Regulatory.

This update touches POS terminal UI components while validating the full DGFY account to checkout to POS fulfillment path. The changed POS frontend files are compliance-sensitive because they affect terminal identity propagation, shift controls, scanner behavior, receipt/history actions, and terminal workspace controls. The DGFY session changes are included because they affect how tenant sessions and DGFY account sessions are restored without browser-readable privileged token storage.

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

## Verification Evidence

Local validation recorded for this update set:

1. `npm run check:architecture` passed.
2. `npm run lint:docs` passed.
3. `npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js tests/authEmailOtpTenantScope.test.js tests/tenantHandler.emailOtp.test.js tests/emailOtpService.test.js tests/dgfyTenantSession.transport.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js tests/dgfyCustomerUseCases.test.js tests/dgfyCustomerHandlers.transport.test.js tests/customerActivityRecorder.test.js tests/browserSessionCookies.test.js` passed.
4. `npm --prefix backend test -- --runTestsByPath tests/onboardingHandlers.transport.test.js tests/onboardingUsecases.applicationResult.test.js tests/onboardingRepository.schemaCompatibility.test.js tests/itemHandlers.transport.test.js tests/inventoryItemRepository.test.js tests/storefrontCatalogUseCases.test.js tests/storefrontDiscoveryRepository.test.js tests/storefrontDiscoveryMapPins.usecase.test.js tests/customerAccessPolicy.test.js tests/storeHandlers.transport.test.js tests/storeUsecases.applicationResult.test.js tests/posHandlers.transport.test.js tests/posCheckout.db.integration.test.js tests/posRepository.locationStockFallback.test.js tests/posSalesReconciliation.db.integration.test.js` passed after aligning the POS transport mock with the current device use-case exports.
5. `npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx apps/store/src/__tests__/profileLauncher.integration.test.jsx src/services/__tests__/dgfyAuthService.cookieSession.test.js src/services/__tests__/browserTokenStorage.guard.test.js src/services/__tests__/api.interceptor.test.js --testTimeout 20000` passed.
6. `npm --prefix frontend test -- apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/checkoutRules.test.js apps/store/src/__tests__/customerAccess.test.js apps/store/src/__tests__/storefrontErrorMessages.test.js src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx src/features/inventory/__tests__/ProductCreateWizard.behavior.test.jsx src/features/inventory/__tests__/itemProductWizard.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/receiptContractConformance.contract.test.js src/features/pos/__tests__/terminalLocationScope.integration.test.jsx --testTimeout 20000` passed.
7. `npm --prefix frontend run build:skupervisor`, `npm --prefix frontend run build:pos`, and `npm --prefix frontend run build:store` passed. `build:skupervisor` emitted existing import-undefined warnings for admin payment/capability service calls that are outside this DGFY account/POS terminal restoration scope and are tracked as QA findings.

