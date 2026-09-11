---
status: reference
owner: engineering
last_reviewed: 2026-09-08
declaration_id: 2026-09-08-pos-items-compact-image-viewer
classification: major
surfaces: pos,terminal,inventory,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.08
verification_evidence: focused POS image viewer behavior tests,POS production build,architecture check,compliance check,git diff --check
rollback_note: Revert the viewer size constraints and selling-price display; image and catalog persistence remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-10T09:13:34.309Z
preflight_request_ref: PREFLIGHT-34459098510-2026-09-08-POS-ITEMS-COMPACT-IMAGE-VIEWER
---

# POS Items compact image viewer and price context

## Compliance Impact Classification

Major. The classification floor comes from the POS terminal Items interface.
The change displays an existing selling price and adjusts viewer dimensions; it
does not alter pricing, catalog persistence, inventory, checkout, payments,
taxes, receipts, identity, or authorization.

## Affected Surfaces

- The POS Items image viewer uses a smaller maximum width and height.
- The HD image remains contained within the viewer's scrollable canvas.
- The viewer header displays the selected item's existing selling price.

## Compliance Preconditions

- The displayed price comes from the catalog row already rendered by POS.
- The viewer performs no price calculation or mutation.
- Existing Phase 308 image ownership and no-copy rules remain unchanged.

## Verification Evidence

- Focused viewer behavior tests pass.
- The POS production build passes.
- Architecture, compliance, and diff checks pass.

The request-time compliance preflight was not executed because this is an
authorized local-only implementation with no PR, push, deployment, or production
operation.
