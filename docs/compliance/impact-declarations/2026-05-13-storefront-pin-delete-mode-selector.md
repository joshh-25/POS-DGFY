---
status: reference
owner: engineering
last_reviewed: 2026-05-13
related_adr: 0017-customer-access-modes-and-inventory-display.md
declaration_id: 2026-05-13-storefront-pin-delete-mode-selector
classification: regulatory
surfaces: settings,storefront,tenant_locations,workflow_mode,compliance
reason_codes_impacted: ALLOWED,CONFLICT,SERVICE_UNAVAILABLE
policy_version: 2026.05.13
verification_evidence: npm --prefix backend test -- tenantLocationUsecases.applicationResult.test.js tenantLocationReferenceSources.coverage.test.js tenantLocationRepository.referenceGuard.test.js --runInBand,npm --prefix backend test -- storeUsecases.applicationResult.test.js --runInBand,npm --prefix frontend test -- --config vite.config.js Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx src/features/settings/__tests__/workflowMode.services.test.js,npm run lint:docs,npm run check:architecture,npm --prefix frontend run build:skupervisor,git diff --check
rollback_note: Revert the tenant-location permanent delete route/use-case/repository/UI changes and leave location removal on deactivate-only behavior; revert the workflow selector alias hiding if legacy manufacturing must temporarily remain selectable.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-13T13:20:00+08:00
preflight_request_ref: STOREFRONT-PIN-DELETE-MODE-SELECTOR-2026-05-13
---

# Storefront Pin Delete And Mode Selector Hardening

## Compliance Impact Classification

Regulatory.

This declaration covers Settings and Storefront changes that affect tenant public-location behavior and workflow-mode selection:

- Settings > Storefront now exposes permanent tenant location pin deletion only for inactive pins.
- Permanent delete is guarded by tenant-local operational reference counts and fails closed with `503 SERVICE_UNAVAILABLE` when the guard cannot inspect a named tenant-local reference model.
- Known operational history still blocks deletion with `409 CONFLICT` and `reference_counts`.
- Business Mode selectors hide the legacy `manufacturing` alias from new selections while persisted legacy values continue to normalize to Food Manufacturing.

## Affected Surfaces

- IMS Settings > Storefront location pin management.
- Tenant location API routes and use cases.
- Storefront discovery refresh after successful location mutation.
- Company/business mode selectors in registration, Settings, and platform tenant management.

## Compliance Preconditions

1. Permanent delete must never treat unknown tenant-reference state as zero usage.
2. Historical POS, inventory, service, booking, and user-location references must keep the location row protected from hard delete.
3. Deactivation remains the safe fallback for locations with history.
4. Hiding the legacy `manufacturing` alias must not break persisted `manufacturing` rows or integrations; normalization must continue mapping them to Food Manufacturing.

## Verification Evidence

- `npm --prefix backend test -- tenantLocationUsecases.applicationResult.test.js tenantLocationReferenceSources.coverage.test.js tenantLocationRepository.referenceGuard.test.js --runInBand`
- `npm --prefix backend test -- storeUsecases.applicationResult.test.js --runInBand`
- `npm --prefix frontend test -- --config vite.config.js Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx src/features/settings/__tests__/workflowMode.services.test.js`
- `npm run lint:docs`
- `npm run check:architecture`
- `npm --prefix frontend run build:skupervisor`
- `git diff --check`
