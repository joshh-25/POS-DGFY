---
status: reference
owner: engineering
last_reviewed: 2026-05-15
related_adr: 0017-customer-access-modes-and-inventory-display.md
declaration_id: 2026-05-15-customer-access-default-enforcement
classification: regulatory
surfaces: settings,storefront,compliance
reason_codes_impacted: ALLOWED,CUSTOMER_ACCESS_MODE_BLOCKED
policy_version: 2026.05.15
verification_evidence: npm --prefix backend test -- --runInBand tests/settingsUsecases.applicationResult.test.js tests/settingsHandlers.transport.test.js tests/customerAccessPolicy.test.js tests/storeUsecases.applicationResult.test.js tests/servicesMode.usecases.test.js,npm exec vitest run apps/store/src/__tests__/customerAccess.test.js apps/store/src/__tests__/checkoutRules.test.js --pool=threads,npm exec vitest run src/pages/__tests__/Settings.deepLinking.integration.test.jsx --pool=threads,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Set CUSTOMER_ACCESS_MODES_ENABLED=false or revert this patch, refresh storefront discovery rows, and verify non-transaction tenants before restoring default enforcement.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-15T12:25:00+08:00
preflight_request_ref: CUSTOMER-ACCESS-DEFAULT-ENFORCEMENT-2026-05-15
---

# Customer Access Default Enforcement

## Compliance Impact Classification

Regulatory.

This declaration covers changing Customer Access Mode from an opt-in rollout flag to the default public Storefront enforcement behavior. It affects public catalog, quote, checkout, booking, and waitlist access decisions, but it does not change compliance lifecycle state, fiscal receipt issuance, tax calculation, payment authorization, POS visibility, or Storefront item visibility override semantics.

## Affected Surfaces

- Backend Customer Access policy defaults to active enforcement unless `CUSTOMER_ACCESS_MODES_ENABLED=false` is explicitly configured.
- Public Storefront quote, checkout, service booking, booking hold, batch booking, and waitlist mutations continue to fail closed with `CUSTOMER_ACCESS_MODE_BLOCKED` when the effective mode is not `transaction`.
- IMS Settings receives read-only runtime flag `customer_access_modes_enabled` from `GET /settings` and renders enforced versus rollback status instead of inferring it locally.
- PM2/env examples and setup docs now use `CUSTOMER_ACCESS_MODES_ENABLED=true` as the normal value.
- `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS` remains available to re-enable selected tenants while the global rollback switch is false.

## Compliance Preconditions

1. Existing tenant defaults remain `customer_access_mode=catalog` and `inventory_display_mode=availability`.
2. Storefront checkout, quote, booking, and waitlist mutations must use the effective Customer Access Mode, not only the requested setting.
3. Storefront discovery/profile/catalog payloads must keep exposing additive access metadata so clients can hide blocked actions before mutation attempts.
4. Payment capability remains controlled by existing payment readiness and compliance gates; Customer Access Mode must not grant payment authority by itself.
5. POS catalog visibility and Storefront catalog visibility remain independent override contracts.

## Verification Evidence

- `npm --prefix backend test -- --runInBand tests/settingsUsecases.applicationResult.test.js tests/settingsHandlers.transport.test.js tests/customerAccessPolicy.test.js tests/storeUsecases.applicationResult.test.js tests/servicesMode.usecases.test.js`
- `npm exec vitest run apps/store/src/__tests__/customerAccess.test.js apps/store/src/__tests__/checkoutRules.test.js --pool=threads` from `frontend/`
- `npm exec vitest run src/pages/__tests__/Settings.deepLinking.integration.test.jsx --pool=threads` from `frontend/`
- `npm run lint:docs`
- `npm run check:architecture`
- `npm run check:compliance`
- `git diff --check`
