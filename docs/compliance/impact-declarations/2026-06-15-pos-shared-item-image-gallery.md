---
status: reference
owner: engineering
last_reviewed: 2026-06-15
related_adr: docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md
declaration_id: 2026-06-15-pos-shared-item-image-gallery
classification: major
surfaces: pos,terminal,inventory,storefront-catalog
reason_codes_impacted: ALLOWED,VALIDATION_FAILED
policy_version: 2026.06.15
verification_evidence: npm exec vitest run src/features/inventory/__tests__/itemProductWizard.contract.test.js src/features/inventory/__tests__/ProductCreateWizard.behavior.test.jsx --pool=threads,npm exec vitest run src/features/inventory/__tests__/itemProductWizard.contract.test.js --pool=threads,npm --prefix backend test -- --runInBand tests/inventoryItemRepository.test.js tests/posRepository.catalogImages.test.js,npm --prefix frontend run build:skupervisor,npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,git diff --check,production deploy summary /var/www/skupervisor/logs/deploy/deploy_20260615_143449.summary.txt
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
- Storefront catalog gallery persistence now reloads override rows with `item_id`, so appending gallery images can update existing override rows without Sequelize rejecting the update for missing primary key.
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
8. Production deploy summary `/var/www/skupervisor/logs/deploy/deploy_20260615_143449.summary.txt`
