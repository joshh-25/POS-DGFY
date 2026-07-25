---
declaration_id: 2026-07-25-external-barcode-product-lookup
classification: major
surfaces: pos,terminal
reason_codes_impacted: BARCODE_EXTERNAL_LOOKUP,POS_ITEM_CREATE
policy_version: 2026.07.25
verification_evidence: architecture_and_controller_checks,targeted_backend_frontend_tests,pos_build
rollback_note: Disable the external barcode lookup route and UI while preserving tenant-local item creation, SKU, stock, and existing barcode behavior.
preflight_result: no_breach
preflight_reason_code: BARCODE_EXTERNAL_LOOKUP_GATED
preflight_run_at: 2026-07-25T00:00:00Z
preflight_request_ref: CODEX-2026-07-25-EXTERNAL-BARCODE-LOOKUP
---

# External Barcode Product Lookup Compliance Impact

## Compliance Impact Classification
This is classified as `major` because it adds an external product-data lookup to the POS item-creation workflow. The lookup only proposes product details. It cannot create a transaction, alter financial records, or bypass the tenant-local item, stock, category, and shift controls.

## Affected Surfaces
- POS terminal item creation can request external GTIN, UPC, or EAN product metadata.
- POS users explicitly choose whether to use a suggested product name or description.
- Categories and product images remain manually selected and are not imported automatically.

## Compliance Preconditions
- A valid GTIN, UPC, or EAN is required before an external lookup is sent.
- The external response is treated as untrusted suggestion data and is normalized before display.
- Existing tenant-local barcode uniqueness and item validation remain authoritative when saving.
- Lookup failure must not prevent manual item entry or expose provider errors to the user.

## Verification Evidence
Verified with architecture and controller-boundary checks, targeted backend barcode and external lookup tests, the frontend external-lookup contract test, and the POS production build.

The POS terminal item modal keeps the external response as a review-only suggestion. The user must still select a category and choose a local item image before saving.
