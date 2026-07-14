---
status: reference
owner: engineering
last_reviewed: 2026-07-14
related_adr: 0009-multi-location-inventory-ledger-and-safety-first-rollout.md
declaration_id: 2026-07-11-pos-category-management
classification: major
surfaces: pos,terminal,inventory,tenant-schema
reason_codes_impacted: ALLOWED
policy_version: 2026.07.11
verification_evidence: focused inventory repository tests,POS category contract test,tenant schema coverage,architecture and compliance guardrails
rollback_note: Revert the POS category UI and category lifecycle API changes together. The migration is additive; run its rollback before restoring the legacy unique-name constraint if required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-11T19:25:00+08:00
preflight_request_ref: POS-CATEGORY-MANAGEMENT-2026-07-11
---

# POS Category Management

## Compliance Impact Classification

Major. This changes POS catalog administration and tenant schema readiness, but does not alter fiscal, payment, tax, receipt, Storefront, or inventory-movement contracts.

## Affected Surfaces

- POS Settings category administration and POS Add/Edit Item category selection.
- Tenant inventory category API and `item_folders` lifecycle state.
- Tenant-schema repair and runtime readiness reporting.

## Compliance Preconditions

## Controls

- Only tenant admins and master admins can create, edit, activate, deactivate, or delete categories through the API.
- Category names are validated server-side and duplicate names are rejected case-insensitively within the same tenant.
- Admin Add Item may explicitly create a category while saving a new item; the category and item are persisted together. Edit Item uses active managed categories only; inactive categories remain attached to existing items but cannot be newly selected.
- The POS catalog projection returns each item's persisted `folder_id`, legacy `product_folder`, and folder relation so Edit Item can preselect the saved active category by ID.
- Deletion immediately soft-deletes categories without assigned active items. Categories with assigned items require an active replacement and move those items atomically.
- Soft-deleted categories are excluded from selection and duplicate-name checks. Recreating a deleted name is permitted only when no active category has the same normalized name.
- `item_folders.is_active`, `deleted_at`, and `deleted_by` are additive and included in tenant-schema repair and runtime readiness checks.

## Contract Preservation

No Storefront route, payload, response, receipt, payment, tax, or inventory movement contract changes. Existing item assignments are preserved on category deactivation, rename, and reassignment before deletion.

## Verification Evidence

- Focused inventory repository lifecycle tests.
- POS category-management contract test and POS production build.
- Backend lint, architecture/controller-boundary checks, documentation lint, compliance checks, and tenant-schema coverage checks.
