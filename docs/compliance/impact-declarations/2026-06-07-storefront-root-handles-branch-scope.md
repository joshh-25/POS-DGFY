---
status: reference
owner: engineering
last_reviewed: 2026-06-07
related_adr: docs/architecture/adr/0010-storefront-discovery-item-match-index-and-union-query.md,docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md
declaration_id: 2026-06-07-storefront-root-handles-branch-scope
classification: major
surfaces: settings,storefront-discovery,storefront-catalog,services-mode,inventory-setup
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT,RESOURCE_NOT_FOUND
policy_version: 2026.06.07
verification_evidence: npm run lint:docs,npm run check:architecture,npm --prefix backend test -- --runTestsByPath tests/storefrontCatalogUseCases.test.js tests/settingsUsecases.applicationResult.test.js tests/servicesMode.usecases.test.js tests/storefrontDiscoveryIndexService.catalogVisibility.test.js,npm --prefix backend test -- --runTestsByPath tests/storeRepository.locationStockFallback.test.js tests/storeUsecases.applicationResult.test.js tests/storefrontDiscoveryRepository.test.js tests/storefrontDiscoveryMapPins.usecase.test.js,npm --prefix frontend exec vitest run apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx apps/store/src/__tests__/profileLauncher.integration.test.jsx apps/store/src/__tests__/storefrontFollow.integration.test.jsx src/features/inventory/__tests__/itemProductWizard.contract.test.js --pool=threads,npm --prefix frontend run build:store,npm --prefix frontend run build:skupervisor,git diff --check
rollback_note: Revert the root-handle reservation, branch availability, Storefront routing, IMS branch-toggle, Services branch-scope, and discovery snapshot changes together; then rerun migrations/rollback steps and discovery reconciliation before redeploying the prior Storefront build.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-07T00:00:00+08:00
preflight_request_ref: STOREFRONT-ROOT-HANDLES-BRANCH-SCOPE-2026-06-07
---

# Storefront Root Handles And Branch Scope

## Compliance Impact Classification

Major.

This declaration covers clean root-handle storefront URLs, durable handle reservation, main-branch discovery pinning, and branch-level Storefront availability across product and service catalog flows. It is compliance-sensitive because it changes public discoverability, public URL ownership, branch-specific item/service exposure, and Settings copy for public storefront handles. It does not change fiscal receipt issuance, tax calculation, payment authorization, subscription billing, tenant authentication, admin authorization, or payment settlement.

## Affected Surfaces

- Settings now presents `store_tenant_slug` as the canonical root handle used by `/:store_tenant_slug`.
- Landlord handle reservation prevents duplicate clean URL ownership even when a tenant is hidden from discovery.
- Storefront discovery remains canonical at `/map-dgfy`; tenant pages use root handles, while `/tenant-store/:slug` and `/store/:slug` remain compatibility routes.
- Inventory item/product setup can configure branch availability during create and edit flows.
- Public catalog, quote, checkout, QR, discovery item snapshots, and Services Mode public catalog/availability/booking/waitlist flows respect branch availability for the selected/requested `location_id`.

## Compliance Preconditions

1. Clean URL reservations must reject duplicate handles and reserved DGFY root paths before public routing can rely on root handles.
2. Hidden tenants must not be discoverable, but their existing handle reservation must remain protected from reuse by other tenants.
3. Branch availability must not bypass Storefront visibility, Customer Access Mode, stock, service capacity, pricing, compliance, or payment readiness gates.
4. Compatibility `/tenant-store/:slug` and `/store/:slug` paths must not become the canonical route in docs or deploy defaults.
5. Release evidence must include migrations, discovery sync, and live tenant smoke before this is claimed production-proven.

## Verification Evidence

Local validation recorded on 2026-06-07:

1. Backend targeted suites passed for Storefront catalog overrides, settings handle policy, Services Mode branch scope, and discovery index branch snapshots.
2. Backend Storefront/store suites passed for public Storefront use cases, repository location-stock fallback, discovery repository behavior, and map pins.
3. Frontend targeted suites passed for Storefront discovery/account/profile/follow flows and inventory item/product wizard behavior.
4. Governance/build gates passed: `npm run check:architecture`, `npm run lint:docs`, `git diff --check`, `npm --prefix frontend run build:store`, and `npm --prefix frontend run build:skupervisor`.

## Production Verification

Production verification must include:

1. Applying the additive landlord and tenant migrations.
2. Running Storefront discovery reconciliation after deploy.
3. Confirming a visible tenant root handle resolves at `https://dgfy.ph/<store_tenant_slug>`.
4. Confirming legacy `/tenant-store/:slug` and `/store/:slug` paths canonicalize without breaking account/order child routes.
5. Confirming branch-disabled products/services are hidden or rejected for the selected `location_id` while enabled branches still work.
