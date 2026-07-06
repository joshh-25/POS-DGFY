---
status: reference
owner: engineering
last_reviewed: 2026-07-06
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-06-pos-multi-image-storefront-gallery-unification
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.06
verification_evidence: npm --prefix backend run test -- --runInBand tests/posRepository.catalogImages.test.js tests/posRepository.locationStockFallback.test.js tests/posTerminalReadiness.usecase.test.js,npx eslint src/features/pos/components/TerminalOperationsWorkspace.jsx src/features/pos/components/POSCheckoutTerminal.jsx src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx,node --check backend/src/modules/pos/repositories/posRepository.js,npm run check:architecture,npm run check:compliance
rollback_note: Revert TerminalOperationsWorkspace.jsx's item-image UI/handlers back to the single-file uploadPosCatalogImage/uploadStorefrontCatalogImage(singular) calls, revert the pos_image_url render-site edits in POSCheckoutTerminal.jsx/SkupervisorPOSCheckoutTerminal.jsx/TerminalOperationsWorkspace.jsx, and revert the posRepository.js applyCatalogOverrides/getCatalogReadinessByItemId precedence change. No checkout, fiscal receipt, payment, tax, discount, or shift/terminal-pairing logic is touched, so rollback carries no calculation or data risk beyond POS item images reverting to the old single-image behavior.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-06T00:00:00+08:00
preflight_request_ref: DGFY-104-MULTI-IMAGE-STOREFRONT-GALLERY-2026-07-06
---

# POS Multi-Image Storefront Gallery Unification

## Compliance Impact Classification

Major (per the `pos`/`terminal` surface floor). This change replaces POS's own single-image upload path in the Terminal Operations item editor with the same multi-image storefront gallery flow already used by the IMS product wizard, and fixes a read-path bug where the POS catalog read (`posRepository.applyCatalogOverrides` / `getCatalogReadinessByItemId`) could keep showing a stale, independently-set POS-only image even after the storefront gallery was updated or cleared in IMS. No checkout, pricing, tax, payment, discount, shift, or terminal-pairing logic is touched — this is scoped entirely to product/item image display and management.

## Affected Surfaces

1. `backend/src/modules/pos/repositories/posRepository.js` — `applyCatalogOverrides` now sources `pos_image_url` only from the storefront catalog override (`storefront_image_url`), no longer preferring a separate, independently-writable `pos_catalog_overrides.pos_image_url` value. `getCatalogReadinessByItemId` now merges storefront image data the same way, for parity, and also returns `storefront_image_path`/`storefront_image_url`/`storefront_image_gallery`.
2. `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx` — the create-item and edit-item image UI now uses `StorefrontImageCarousel`/`SelectedItemImageCarousel` and the storefront gallery upload/reorder/delete service calls (`uploadStorefrontCatalogImages`, `updateStorefrontCatalogGallery`, `deleteStorefrontCatalogImage`), supporting up to 5 images per item instead of 1. The old `uploadPosCatalogImage` (writes to `pos_catalog_overrides`) and singular `uploadStorefrontCatalogImage` calls (which silently overwrote any existing multi-image gallery) are removed from this flow. The create-item post-create staged upload (`runPostCreateStages`/`pendingCreateRecovery`) is updated to carry an array of files instead of one, preserving its existing no-throw/resumable-retry semantics.
3. `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` and `frontend/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx` — the catalog grid card image now reads `item.storefront_image_url` directly instead of the (now-unreliable) merged `item.pos_image_url` field. Existing fallback behavior (name-keyword mapped image, placeholder logo) is unchanged.

## Compliance Preconditions

1. No checkout calculation, cart total, VAT/tax breakdown, discount, payment method handling, fiscal receipt, shift-opening/closing, or terminal-pairing behavior is modified by any file in this change.
2. Item visibility/availability toggles (`pos_visible`, `pos_always_available`, `storefront_visible`) and their update calls (`updatePosCatalogOverride`, `updateStorefrontCatalogOverride`) are unchanged — only image fields are affected.
3. The backend continues to enforce the 5-image-per-item gallery cap server-side (`STOREFRONT_CATALOG_GALLERY_MAX_IMAGES` in `storefrontCatalogUseCases.js`), so a frontend cap-check gap cannot bypass the limit.
4. The `pos_catalog_overrides` table, its endpoints, and the existing IMS "Bulk POS Image Upload" panel (`ItemsPage.jsx`, `surface: 'pos'`) are left in place and untouched; their writes simply stop being read for image display, which is an intentional, scoped decision (not an unintended regression) to unify on the storefront gallery as the single source of truth.
5. No tenant data is deleted or migrated — existing (now unread) `pos_catalog_overrides.pos_image_url` values are left in place with no functional effect.

## Verification Evidence

The commands listed in front matter must pass before deployment: the updated/added `posRepository.catalogImages.test.js` suite (including a new regression test asserting a stale `pos_catalog_overrides.pos_image_url` no longer wins over a current storefront image), the related `posRepository.locationStockFallback.test.js` and `posTerminalReadiness.usecase.test.js` suites, ESLint on all three modified frontend files (no new errors), a Node syntax check on the modified backend repository file, and the architecture/compliance guardrails. Manual verification recommended before merge: in the running POS Terminal Operations workspace, create an item with 3+ photos and confirm the gallery persists; edit an existing item's gallery (add/reorder/remove); and confirm that editing an item's images from the IMS product wizard is reflected on POS checkout terminals without any stale image lingering.
