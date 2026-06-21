---
status: reference
owner: engineering
last_reviewed: 2026-06-16
related_adr: docs/architecture/adr/0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md,docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md
declaration_id: 2026-06-16-no-location-storefront-business-hours
classification: regulatory
surfaces: settings,onboarding,storefront,api,testing,docs,compliance
reason_codes_impacted: ALLOWED,CUSTOMER_ACCESS_MODE_BLOCKED,VALIDATION_FAILED
policy_version: 2026.06.16
verification_evidence: npm run check:architecture,npm run lint:docs,npm run audit:storefront-public-visibility -- --json,npm --prefix backend test -- --runInBand tests/onboardingUsecases.applicationResult.test.js tests/storefrontDiscoveryRepository.test.js tests/storefrontDiscoveryMapPins.usecase.test.js tests/storefrontDiscoveryIndexService.catalogVisibility.test.js tests/storeUsecases.applicationResult.test.js tests/storefrontPublicVisibilityAuditService.test.js,npm exec vitest run src/features/settings/__tests__/storefrontBusinessHours.test.js src/features/settings/__tests__/StorefrontBusinessHoursScheduler.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx --pool=threads,npm --prefix frontend exec vitest run apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/discoveryMapLayers.test.js --pool=threads,npm exec vitest run src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx --pool=threads,npm --prefix frontend run build:skupervisor,npm --prefix frontend run build:store,git diff --check
rollback_note: Revert no-location storefront settings/profile/discovery/audit changes, F&B onboarding preset normalization, business-hours scheduler changes, tests, and docs together so public Storefront semantics remain aligned.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-16T00:00:00+08:00
preflight_request_ref: NO-LOCATION-STOREFRONT-BUSINESS-HOURS-2026-06-16
snapshot_commit: pending-local
---

# No-Location Storefront And Business-Hours Hardening

## Compliance Impact Classification
Regulatory

This declaration covers the no-location Storefront contract, F&B onboarding item preset normalization, and Store Setup business-hours scheduler hardening. The change is compliance-sensitive because Settings is a governed surface and Storefront public visibility affects customer-facing catalog and checkout availability. It does not change fiscal receipt behavior, tenant compliance lifecycle state, payment authorization rules, stock deduction rules, or the ADR 0017 customer access-mode enforcement model.

## Affected Surfaces
- Tenant onboarding accepts F&B `ingredient` starter rows and legacy raw-material labels at the onboarding boundary.
- Settings and onboarding expose `This Store Has No Location` as a reversible public Storefront setting.
- Storefront discovery, profile, public locations, map pins, directions, and audit behavior now respect no-location stores.
- Storefront business hours use the weekly apply/grid scheduler while preserving legacy one-window payload compatibility and supporting multiple intervals per day.
- ADR/API/testing/feature docs were updated to align public visibility, no-location, and audit semantics.

## Compliance Preconditions
1. `store_is_visible=true` still means the Storefront is public/searchable.
2. `store_has_no_location=true` only disables public map publication; it does not downgrade Customer Access Mode.
3. Catalog, contact, quote, checkout, stock, payment, branch, business-hours, and compliance gates remain governed by existing backend runtime policy.
4. Preserved tenant locations stay editable in IMS and are not exposed publicly while no-location is true.
5. Public no-location profiles must not expose coordinates, map embeds, directions buttons, or map-pin feeds.
6. The business-hours scheduler serializes the same `storefront_hours` setting contract, keeps the existing 24-hour convention, and may include multiple ordered `intervals[]` entries per enabled day.

## Verification Evidence
- `npm run check:architecture`
- `npm run lint:docs`
- `npm run audit:storefront-public-visibility -- --json`
- `npm --prefix backend test -- --runInBand tests/onboardingUsecases.applicationResult.test.js tests/storefrontDiscoveryRepository.test.js tests/storefrontDiscoveryMapPins.usecase.test.js tests/storefrontDiscoveryIndexService.catalogVisibility.test.js tests/storeUsecases.applicationResult.test.js tests/storefrontPublicVisibilityAuditService.test.js`
- `npm exec vitest run src/features/settings/__tests__/storefrontBusinessHours.test.js src/features/settings/__tests__/StorefrontBusinessHoursScheduler.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx --pool=threads`
- `npm --prefix frontend exec vitest run apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/discoveryMapLayers.test.js --pool=threads`
- `npm exec vitest run src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx --pool=threads`
- `npm --prefix frontend run build:skupervisor`
- `npm --prefix frontend run build:store`
- `git diff --check`
