---
status: reference
owner: engineering
last_reviewed: 2026-09-07
declaration_id: 2026-09-07-pos-item-image-upload-gallery
related_adr: docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md
classification: major
surfaces: pos,terminal,inventory
reason_codes_impacted: ALLOWED
policy_version: 2026.09.07
verification_evidence: inventory repository suite 71 passing,shared POS image suites 15 passing,POS IMS and Storefront production builds
rollback_note: No database migration or backfill is introduced; rollback is a code revert.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-07T14:45:00.000Z
preflight_request_ref: ISSUE-1728-POS-IMAGE-UPLOAD
---

# POS item image upload responsiveness and gallery integrity

## Compliance Impact Classification

Major. This changes authenticated POS item-image creation and the inventory repository path that persists an already-optimized gallery. It does not change tax, payments, receipts, discounts, customer identity, or reporting.

## Affected Surfaces

- POS Add Item drag-and-drop image selection and immediate local previews.
- Silent background image optimization after the item record is created.
- POS catalog preview reconciliation when the optimized server image becomes available.
- Inventory persistence of an already-optimized multi-image gallery without reprocessing its primary image.

## Compliance Preconditions

- Existing authentication, tenant scope, and `items:edit` authorization remain unchanged.
- Existing image type, size, and five-image limits remain authoritative.
- The saved item remains recoverable if a later image stage fails.
- No database migration, schema change, or backfill is included.

## Verification Evidence

- `inventoryItemRepository.test.js`: 71 tests passed, including the three-image gallery regression.
- Shared POS image preview, reconciliation, pending-preview store, and rendering suites: 5 files and 15 tests passed.
- POS, IMS, and Storefront production builds passed. Existing bundle-size warnings remain unchanged.
- `node --check` passed for the modified repository module.
