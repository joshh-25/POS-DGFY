---
status: reference
owner: engineering
last_reviewed: 2026-06-03
related_adr: docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md,docs/architecture/adr/0022-global-dgfy-account-business-registration.md
declaration_id: 2026-06-03-dgfy-account-storefront-gallery-health
classification: regulatory
surfaces: authentication,browser-sessions,storefront-catalog,customer-account,checkout,inventory,onboarding,health,settings,compliance
reason_codes_impacted: AUTH_BLACKLIST_HEALTH,STOREFRONT_ACCOUNT_ROUTE,STOREFRONT_ITEM_GALLERY
policy_version: 2026.06.03
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/storefrontCatalogUseCases.test.js tests/healthService.test.js,npm --prefix frontend test -- --run apps/store/src/__tests__/profileLauncher.integration.test.jsx apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx apps/store/src/__tests__/fnbStorefront.contract.test.js src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx,npm run build:store,npm run build:skupervisor,npm run build:backend
rollback_note: Revert account route, item gallery column/API, and health diagnostic changes together if customer account routing or item media publication must be paused.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-03T00:00:00+08:00
preflight_request_ref: DGFY-ACCOUNT-STOREFRONT-GALLERY-HEALTH-2026-06-03
---

# DGFY Account, Storefront Gallery, And Auth Health

## Compliance Impact Classification

Regulatory.

This declaration covers customer account routing, stale DGFY session cleanup, POS/storefront checkout-to-account refresh behavior, Storefront item gallery uploads, and token-blacklist health diagnostics. The change does not alter fiscal document classification, tax computation, receipt numbering, payment-provider settlement, or BIR accreditation claims.

## Affected Surfaces

- Storefront **My Account** now renders as a routed `/tenant-store/:slug/account` page instead of an account dashboard modal.
- Discovery **Log in / Sign up** remains an authentication dialog because it has no tenant storefront context.
- DGFY account loading validates `/api/v1/dgfy/auth/me` before dashboard/activity/loyalty fan-out and clears stale browser token state after `401`.
- Successful authenticated storefront checkout or booking sends the DGFY-capable Store auth token, then refreshes account data so current tracking, order history, bookings, saved addresses, and loyalty can update without a full reload.
- Routed account order actions call the existing DGFY cancel/reorder endpoints only when activity `allowed_actions` permits them.
- Storefront item images now support an ordered gallery through `storefront_catalog_overrides.storefront_image_gallery`; the primary image remains `storefront_image_url` for backward compatibility.
- Production health now degrades when `AUTH_BLACKLIST_FAILURE_MODE=fail_closed` requires Redis but Redis is not configured/connected, including shared-hosting profiles accidentally configured to fail closed.

## Compliance Preconditions

1. Storefront gallery uploads must keep POS menu images and POS visibility independent.
2. Uploading or removing Storefront images must preserve `storefront_visible`.
3. Invalid DGFY sessions must not repeatedly call customer dashboard, activity, or loyalty endpoints after `/auth/me` returns `401`.
4. Production health must expose token-blacklist degradation without leaking secret values.
5. Account route changes must keep customer auth separate from business registration.

## Verification Evidence

Targeted validation for this declaration:

1. `npm --prefix backend test -- --runTestsByPath tests/storefrontCatalogUseCases.test.js tests/healthService.test.js`
2. `npm --prefix frontend test -- --run apps/store/src/__tests__/profileLauncher.integration.test.jsx apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx apps/store/src/__tests__/fnbStorefront.contract.test.js src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx`
3. `npm run build:store`
4. `npm run build:skupervisor`
5. `npm run build:backend`
