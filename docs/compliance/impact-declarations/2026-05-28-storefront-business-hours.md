---
status: reference
owner: engineering
last_reviewed: 2026-05-29
related_adr: docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md
declaration_id: 2026-05-28-storefront-business-hours
classification: regulatory
surfaces: settings,onboarding,storefront,checkout,services,compliance
reason_codes_impacted: OUTSIDE_STOREFRONT_BUSINESS_HOURS
policy_version: 2026.05.28
verification_evidence: npm run lint:docs,npm run check:compliance,npm --prefix backend test -- --runTestsByPath tests/storefrontBusinessHours.test.js tests/storeRepository.locationStockFallback.test.js,npm --prefix frontend test -- --run apps/store/src/__tests__/checkoutRules.test.js apps/store/src/__tests__/discoveryFlow.integration.test.jsx,npm --prefix frontend run build:store
rollback_note: Hide the structured Settings/onboarding controls and stop writing structured storefront_hours. Legacy free-text storefront_hours remains display-compatible.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-28T00:00:00+08:00
preflight_request_ref: STOREFRONT-BUSINESS-HOURS-2026-05-28
---

# Storefront Business Hours

## Compliance Impact Classification

Regulatory.

This declaration covers structured Storefront business hours that display on public Storefront surfaces and gate Storefront product checkout plus public service booking availability. It does not change fiscal receipt, tax, settlement, or inventory valuation rules.

## Affected Surfaces

- Settings > Storefront business-hours controls.
- Tenant onboarding `primary_location` setup.
- Storefront discovery/profile hours display.
- Public Storefront checkout validation.
- Public service booking, booking-hold, and batch-booking validation.

## Compliance Preconditions

1. Existing legacy free-text `storefront_hours` values remain display-compatible.
2. Malformed or unparsable legacy hours must not unexpectedly block checkout.
3. Valid weekly schedules must fail closed for immediate/scheduled checkout and service booking schedules outside all configured intervals.
4. Settings and onboarding must write the same `storefront_hours` contract, including compatibility `open`/`close` fields and `intervals[]` for each weekly day.
5. Storefront discovery sync must publish a customer-readable hours label and safe open/closed status, not raw internal schedule JSON.

## Addendum (2026-06-21): Multi-Interval Daily Hours

Settings and onboarding now support multiple ordered intervals per day, such as `06:00-12:00` and `13:00-20:00`. Legacy structured `{ enabled, open, close }` values normalize to a single interval. The public Storefront display groups matching multi-interval day schedules into compact labels, and checkout/service booking gates evaluate every interval while preserving the existing `00:00-00:00` 24-hour convention.

## Verification Evidence

- `npm run lint:docs`
- `npm run check:compliance`
- `npm --prefix backend test -- --runTestsByPath tests/storefrontBusinessHours.test.js tests/storeFnbModifiers.usecases.test.js tests/servicesMode.usecases.test.js`
- `npm --prefix frontend test -- --run apps/store/src/__tests__/checkoutRules.test.js src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx`
- `npm --prefix frontend run build`

## Reconciliation Evidence

The 2026-05-29 PR #10 reconciliation preserved the existing structured Storefront business-hours enforcement while adding fulfilled guest review invites and the revised Storefront UI. The reconciliation kept the compliance preconditions above: malformed legacy hours remain display-compatible and do not unexpectedly block checkout, while valid structured weekly schedules continue gating immediate/scheduled checkout and Storefront service booking paths.

Additional validation from the reconciliation:

- `npm run check:architecture`
- `npm run lint:docs`
- `npm run check:compliance`
- `npm --prefix backend test -- --runTestsByPath tests/dgfyCustomerUseCases.test.js tests/dgfyCustomerHandlers.transport.test.js tests/storefrontBusinessHours.test.js tests/storeRepository.locationStockFallback.test.js`
- `npm --prefix frontend test -- --run apps/store/src/__tests__/fnbOrderTracking.contract.test.js apps/store/src/__tests__/fnbStorefront.contract.test.js apps/store/src/__tests__/profileLauncher.integration.test.jsx apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx apps/store/src/__tests__/checkoutRules.test.js apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/storefrontFollow.integration.test.jsx apps/store/src/__tests__/storefrontErrorMessages.test.js apps/store/src/__tests__/normalizeStorefrontPageModel.test.js --testTimeout 20000`
- `npm --prefix frontend run build:store`

## Production Build Import Evidence

The 2026-05-29 production deployment exposed Windows-only import casing in `frontend/Pages/Settings.jsx`. The Settings page now imports shared UI controls through the existing `@/components/ui/*` alias, which resolves to `frontend/Components/ui` in the SKUpervisor Vite config and preserves the same Storefront business-hours behavior.

Validation for the import repair:

- `npm --prefix frontend run build:skupervisor`
- `npm --prefix frontend run build:store`
- `npm run check:architecture`
- `npm run check:compliance`
