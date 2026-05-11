---
status: reference
owner: engineering
last_reviewed: 2026-05-11
related_adr: 0017-customer-access-modes-and-inventory-display.md
declaration_id: 2026-05-11-bulk-catalog-setup-hardening
classification: major
surfaces: pos,terminal,storefront,onboarding,inventory
reason_codes_impacted: ALLOWED,POS_READINESS_INCOMPLETE,STOREFRONT_READINESS_INCOMPLETE
policy_version: 2026.05.11
verification_evidence: node --check backend/src/config/uploadConfig.js,npm --prefix backend test -- --runInBand tests/posUsecases.applicationResult.test.js tests/storefrontCatalogUseCases.test.js tests/catalogVisibilityPolicy.test.js,npm --prefix frontend exec vitest run src/features/inventory/__tests__/itemFinancialPolicy.test.js,npm --prefix frontend run build:skupervisor,npm run check:architecture,npm run lint:docs,git diff --check
rollback_note: Revert the bulk Catalog Setup backend, frontend, and docs commits; then verify POS and Storefront single-item visibility/image controls still preserve their independent override tables.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-11T00:00:00+08:00
preflight_request_ref: BULK-CATALOG-SETUP-2026-05-11
---

# Bulk Catalog Setup Hardening

## Compliance Impact Classification

Major.

This declaration covers the bulk POS and Storefront catalog setup hardening pass. It changes setup and readiness behavior but does not alter fiscal receipt issuance, tax calculation, payment authorization, compliance status, or public exposure of item cost.

## Affected Surfaces

- POS catalog override readiness, bulk visibility, and SKU-filename image upload.
- Storefront catalog override readiness, bulk visibility, and SKU-filename image upload.
- Inventory Catalog Setup UI for batch POS and Storefront setup decisions.
- Onboarding `has_sellable_item` readiness evaluation.

## Compliance Preconditions

1. POS and Storefront visibility remain independent override contracts.
2. Storefront catalog setup must expose customer sale price only and must never expose `cost_per_unit`, FIFO cost, weighted cost, or inventory value to public storefront payloads.
3. POS readiness must not allow stock-bearing rows with zero available stock to be marked ready.
4. Service and stock-exempt rows may remain ready without physical stock when the mode/service contract allows it and all other blockers pass.
5. Bulk image uploads must preserve current visibility and must not auto-enable POS or Storefront visibility.
6. Storefront visible/default-visible price-less rows must remain blocked from Storefront image setup.
7. Bulk catalog image transport limits must remain below production ingress limits while the use cases enforce the 5 MB product image policy per file.

## Verification Evidence

- `npm --prefix backend test -- --runInBand tests/posUsecases.applicationResult.test.js tests/storefrontCatalogUseCases.test.js tests/catalogVisibilityPolicy.test.js`
- `node --check backend/src/config/uploadConfig.js`
- `npm --prefix frontend exec vitest run src/features/inventory/__tests__/itemFinancialPolicy.test.js`
- `npm --prefix frontend run build:skupervisor`
- `npm run check:architecture`
- `npm run lint:docs`
- `git diff --check`
