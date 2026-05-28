---
status: reference
owner: engineering
last_reviewed: 2026-05-28
related_adr: docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md
declaration_id: 2026-05-28-storefront-business-hours
classification: regulatory
surfaces: settings,onboarding,storefront,checkout,services,compliance
reason_codes_impacted: OUTSIDE_STOREFRONT_BUSINESS_HOURS
policy_version: 2026.05.28
verification_evidence: npm run lint:docs,npm run check:compliance,npm --prefix backend test -- --runTestsByPath tests/storeFnbModifiers.usecases.test.js,npm --prefix frontend test -- --run src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx,npm --prefix frontend run build
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
3. Valid weekly schedules must fail closed for immediate/scheduled checkout and service booking schedules outside configured hours.
4. Settings and onboarding must write the same `storefront_hours` contract.
5. Storefront discovery sync must publish a customer-readable hours label and safe open/closed status, not raw internal schedule JSON.

## Verification Evidence

- `npm run lint:docs`
- `npm run check:compliance`
- `npm --prefix backend test -- --runTestsByPath tests/storefrontBusinessHours.test.js tests/storeFnbModifiers.usecases.test.js tests/servicesMode.usecases.test.js`
- `npm --prefix frontend test -- --run apps/store/src/__tests__/checkoutRules.test.js src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx`
- `npm --prefix frontend run build`
