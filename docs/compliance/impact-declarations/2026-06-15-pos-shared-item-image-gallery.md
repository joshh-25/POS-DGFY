---
status: reference
owner: engineering
last_reviewed: 2026-08-24
related_adr: docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md
declaration_id: 2026-06-15-pos-shared-item-image-gallery
classification: major
surfaces: pos,terminal,inventory,storefront-catalog
reason_codes_impacted: ALLOWED,VALIDATION_FAILED
policy_version: 2026.06.15
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/inventoryItemRepository.test.js tests/storefrontCatalogUseCases.test.js tests/posRepository.catalogImages.test.js tests/runtimeSchemaAuditService.test.js tests/posCheckoutFnbContracts.usecase.test.js,npm --prefix frontend exec vitest run src/features/inventory/__tests__/itemProductWizard.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js --pool=threads,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check,production deploy summary /var/www/skupervisor/logs/deploy/deploy_20260615_153953.summary.txt,2026-08-24 fix (#871): npm --prefix apps/dgfy-api test -- tests/posRepository.catalogImages.test.js tests/posRepository.locationStockFallback.test.js tests/posCatalogCategory.contract.test.js tests/posCatalogBarcodeScope.contract.test.js tests/posTerminalReadiness.usecase.test.js tests/posUsecases.applicationResult.test.js (68 passed, 0 failed)
rollback_note: Revert the Storefront-only wizard item-image upload wiring, POS catalog image fallback, and gallery primary-key repository fix together; POS visibility and Storefront visibility remain independently controlled.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-15T14:15:00+08:00
preflight_request_ref: POS-SHARED-ITEM-IMAGE-GALLERY-2026-06-15
---

# POS Shared Item Image Gallery

## Compliance Impact Classification

Major.

This declaration covers the inventory wizard and POS catalog image handling change that removes the POS-side wizard image uploader, keeps Storefront Catalog as the single wizard item-image upload surface, and makes POS catalog rows fall back to the shared Storefront catalog primary item image when no legacy POS-only image is configured.

The change is compliance-sensitive only because it touches the POS catalog repository. It does not alter POS visibility, Storefront visibility, customer access mode, branch availability, checkout eligibility, price/tax calculation, stock deduction, payment authorization, receipt classification, fiscal numbering, fiscal document evidence, terminal shift policy, or compliance activation gates.

## Affected Surfaces

- Inventory item and product setup modals still expose separate `Show in POS` and `Show in Storefront` controls.
- POS Controls no longer exposes an image upload action; Storefront Catalog `Add Item Images` is the single wizard gallery upload path.
- Storefront catalog gallery persistence now reloads override rows with `storefront_catalog_override_id`, so appending gallery images can update existing override rows without Sequelize rejecting the update for missing primary key.
- POS terminal catalog payloads use `pos_catalog_overrides.pos_image_url` first, then the shared Storefront catalog primary item image as a display fallback.
- Legacy POS-only image data remains compatible and remains preferred when present.

## Compliance Preconditions

1. Uploading, promoting, or removing item images must not mutate POS visibility or Storefront visibility.
2. Storefront gallery append limits remain capped at five images per item.
3. POS terminal display fallback must not make Storefront-hidden items POS-visible; POS visibility still comes from POS catalog policy only.
4. Rollback can restore the previous independent POS image upload behavior without schema rollback, but doing so reintroduces a second wizard image surface.

## Verification Evidence

Required validation for this branch:

1. `npm exec vitest run src/features/inventory/__tests__/itemProductWizard.contract.test.js src/features/inventory/__tests__/ProductCreateWizard.behavior.test.jsx --pool=threads` from `frontend/`
2. `npm --prefix backend test -- --runInBand tests/inventoryItemRepository.test.js tests/posRepository.catalogImages.test.js`
3. `npm --prefix frontend run build:skupervisor`
4. `npm --prefix frontend run build:pos`
5. `npm run lint:docs`
6. `npm run check:architecture`
7. `git diff --check`
8. Production deploy summary `/var/www/skupervisor/logs/deploy/deploy_20260615_153953.summary.txt`
9. Space Bar tenant schema verification showed `buyer_tin`, `buyer_business_style`, `buyer_address`, and `fiscal_lifecycle_state` present after targeted remediation.


## Amendment, 2026-08-24 (bugfix, #871)

Live production investigation of #871 (POS catalog images 404ing) found `applyCatalogOverrides()`
(used by `listCatalog()`, the actual POS terminal catalog grid) and `getCatalogReadinessByItemId()`
never actually implemented the fallback order this declaration documents above -- both always used
the Storefront catalog image unconditionally and silently ignored a present, working
`pos_catalog_overrides.pos_image_url`. Confirmed live against production tenant
`sku_tenant_eaterynidoe_2e561dbb`: items 7 and 10 each had a working POS-specific image on disk
while the Storefront-linked image the grid actually displayed was missing, producing the reported
404s. `resolveBarcode`'s barcode-scan flow and `listCatalogOverrides` (the admin/setup screen)
already used the POS-specific image correctly -- only the two functions above had the bug.

Fixed by introducing one shared `resolvePosDisplayImage()` helper (POS-specific image first,
Storefront image as fallback when absent) and routing both `applyCatalogOverrides()` and
`getCatalogReadinessByItemId()` through it. No POS/Storefront visibility change, no schema change,
no new endpoint -- this restores the already-declared fallback-order contract to what the code
actually does; it does not change the contract itself. Classification and affected surfaces are
unchanged from the original declaration above.

**Affected surfaces (already covered by `surfaces:` above, restated for clarity):**
`apps/dgfy-api/src/modules/pos/repositories/posRepository.js`.

**Not covered by this amendment:** the still-missing production image file behind item 5 (no
`pos_catalog_overrides` fallback exists for it either -- a genuine missing-asset data gap, not a
code bug) is addressed operationally via `apps/dgfy-api/scripts/backfill-optimized-catalog-images.js
--clear-missing-only`, run separately against production with explicit sign-off, not part of this
code change.
