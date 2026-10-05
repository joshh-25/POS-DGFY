---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-05
declaration_id: 2026-10-05-pos-parked-sale-cancellation
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.05
verification_evidence: apps/dgfy-api focused parked-sale tests (25 passed), shared POS contracts (20 passed), POS lint and production build passed, npm run check:architecture, npm run check:docs
rollback_note: Revert the parked-sale cancellation workflow, UI reconciliation changes, version bumps, and this declaration; no schema migration or tenant data repair is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-05T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-2026-10-05-POS-PARKED-SALE-CANCELLATION
---

# POS parked-sale cancellation hotfix

## Compliance Impact Classification

Major because the changed API parked-sale use case and shared POS terminal components are
classified as `pos` and `terminal` surfaces. The hotfix restores the cashier checkout after a
cancellation request, preserves Back Office approval as the control that finalizes cancellation
and inventory reversal, and retains an audit trail for the request and approval lifecycle.

## Affected Surfaces

- `pos` — parked-sale cancellation request and shared parked-sale queue behavior.
- `terminal` — clearing the stuck active cart and reconciling approved parked-sale cards.

## Compliance Preconditions

- Cancellation still requires an explicit reason and an authorized open shift at the same location.
- Cashiers may request cancellation for another same-location cashier's parked sale, but cannot
  finalize cancellation or reverse inventory directly.
- Back Office approval remains responsible for final cancellation, stock restoration, and audit
  completion; pending requests leave stock deducted.
- No database schema, payment, fiscal calculation, or tenant-data migration is included.
- The `NOT-EXECUTED-*` request reference is a PR-open placeholder and must be reconciled before
  this main hotfix is merged.

## Verification Evidence

- `apps/dgfy-api` parked-sale and approval tests passed: 25 tests.
- Shared POS parked-sale contracts passed: 20 tests.
- POS lint and production build passed.
- `npm run check:architecture`, `npm run check:docs`, and `git diff --check` passed.
