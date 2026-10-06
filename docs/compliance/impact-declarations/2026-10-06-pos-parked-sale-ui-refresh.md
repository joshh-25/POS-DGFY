---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-06
declaration_id: 2026-10-06-pos-parked-sale-ui-refresh
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.06
verification_evidence: focused parked-sale contract test,git diff --check
rollback_note: Revert the parked-sale background refresh and this declaration; no database schema, migration, or tenant-data change is included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-06T07:47:59.601Z
preflight_request_ref: PREFLIGHT-37431484571-2026-10-06-POS-PARKED-SALE-UI-REFRESH
---

# POS parked-sale UI refresh

## Compliance Impact Classification

Major because the shared POS parked-sale dialog is classified under the `pos` and `terminal`
surfaces. The change refreshes the visible parked-sale list in the background while the dialog is
open, prevents overlapping requests, and keeps cancellation state aligned with the server result.
It does not change cancellation approval authority, inventory reversal, payment processing, or
persisted tenant data.

## Affected Surfaces

- `pos` — parked-sale queue refresh and cancellation-request presentation.
- `terminal` — the cashier-facing parked-sale dialog used to resume or cancel a sale.

## Compliance Preconditions

- Back Office approval remains responsible for final cancellation and inventory restoration.
- Cashier permissions, location scope, cancellation reasons, and audit logging remain unchanged.
- Background refresh is read-only and does not create, claim, cancel, or mutate a parked sale.
- No database schema, migration, payment, fiscal, or tenant-data change is included.
- The `NOT-EXECUTED-*` preflight reference is a validator-required PR-open placeholder; no live
  request-time preflight is claimed here, and the continuous compliance sweep must reconcile it.

## Verification Evidence

- Focused parked-sale contract tests and `git diff --check` are required before PR submission.
- The repository compliance gate validates this declaration against the changed POS/terminal files.
