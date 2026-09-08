---
status: reference
owner: engineering
last_reviewed: 2026-09-08
declaration_id: 2026-09-08-safe-temporary-download-cleanup
classification: major
surfaces: pos,terminal,inventory
reason_codes_impacted: ALLOWED
policy_version: 2026.09.08
verification_evidence: POS IMS and Storefront production builds,git diff --check
rollback_note: Revert the three element self-removal substitutions; no database or persisted-data rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-08T05:50:00.000Z
preflight_request_ref: NOT-EXECUTED-SAFE-TEMPORARY-DOWNLOAD-CLEANUP
---

# Safe temporary download element cleanup

## Compliance Impact Classification

Major by the mechanically computed POS surface floor. The change only replaces parent-specific `removeChild` calls with idempotent element `remove()` calls after temporary QR, report, and stock-movement download links are clicked. It does not change generated content, authorization, reporting calculations, inventory state, payments, or persistence.

## Affected Surfaces

- POS report PDF download cleanup.
- Item QR image download cleanup.
- Inventory stock-movement CSV download cleanup.

## Compliance Preconditions

- Existing authorization and export generation remain unchanged.
- Cleanup runs only after the temporary anchor has been clicked.
- No transaction, report value, or inventory record is modified.

## Verification Evidence

POS, IMS, and Storefront production builds passed. No database migration or API contract change is included.
