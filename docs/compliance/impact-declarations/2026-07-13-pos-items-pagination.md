---
status: reference
owner: engineering
last_reviewed: 2026-07-13
related_adr: docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md
declaration_id: 2026-07-13-pos-items-pagination
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.13
verification_evidence: npm --prefix frontend test,npm --prefix frontend run build:pos,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the POS_ITEMS_PAGE_SIZE, itemsPage, paginatedItems, and pagination controls in TerminalOperationsWorkspace.jsx; catalog data, item edits, barcode behavior, stock, checkout, payments, and fiscal calculations are unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-13T18:00:00+08:00
preflight_request_ref: POS-ITEMS-PAGINATION-2026-07-13
---

# POS Items Pagination and Save Progress

## Compliance Impact Classification

Major because this changes a POS terminal user interface. It is a local display-only pagination change and does not alter item authorization, visibility policy, pricing, inventory, checkout, payment, or fiscal behavior.

## Affected Surfaces

1. POS Item Management renders up to 15 filtered records per page.
2. Previous and Next controls navigate the already-authorized, already-loaded result set.
3. Search and category/stock filters reset navigation to page 1, and page state clamps when the result set shrinks.
4. POS item create and edit requests display a blocking, animated blue-droplet save-progress surface until the complete backend save and catalog refresh flow finishes. The existing success or error feedback remains the final outcome.

## Compliance Preconditions

1. The existing `GET /pos/catalog` authorization and visibility filtering remain the only source of item records.
2. Pagination never mutates item data or changes which records the backend authorizes.
3. Checkout, stock, payments, discounts, receipts, and fiscal records are untouched.
4. The progress surface does not change the item payload, authorization, or save result; it only prevents duplicate interaction while the existing request is pending.

## Verification Evidence

1. Frontend contract test verifies the 15-record page size, sliced list rendering, and navigation controls.
2. POS build and architecture/compliance gates validate the modified terminal surface.
3. Frontend contract test verifies the shared in-flight state and visible save-progress copy.
