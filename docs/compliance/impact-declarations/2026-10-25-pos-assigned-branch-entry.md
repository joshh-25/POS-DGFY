---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-25
related_adr: docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-10-25-pos-assigned-branch-entry
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.10.16
verification_evidence: POS frontend contracts passed (132 files, 837 tests); focused suites passed (15 files, 255 tests); POS sales E2E passed; Storefront suite passed (252 files, 1,418 tests); POS and SKUpervisor builds, architecture, docs, app-version, fixture syntax, and whitespace checks passed; full frontend aggregate interrupted after IMS failures and a CPU-bound worker
rollback_note: Revert the assigned-branch eligibility helper and POS branch entry changes with their E2E and contract updates; no API, schema, or persisted-data rollback is needed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-24T17:41:29Z
preflight_request_ref: NOT-EXECUTED-2767-POS-ASSIGNED-BRANCH-ENTRY
---

# POS assigned branch entry and sales journey (#2767, Phase 548)

## Compliance Impact Classification

Major classification approved by Pat on 2026-10-25 in the implementation session (reply:
`approved`). The changed shared POS paths map to the `pos` and `terminal` surfaces, whose
classification floor is major. This change makes assigned-branch open and resume eligibility use
the selected tenant user's effective action permissions and location grant while preserving the
existing server-authoritative shift checks.

## Affected Surfaces

- POS: the branch directory offers shift operations only for active locations and terminals when
  the selected operator has the effective permission and location scope for that action.
- Terminal: opening a shift continues to require POS view and transaction permissions; resuming
  continues to require POS view and attendance view/operate permissions, plus existing shift
  ownership, occupancy, terminal binding, and server revalidation.
- Read-only branch review through `pos:branch_view` remains separate from shift operation, and
  explicit master-admin authority remains tenant-wide.

## Compliance Preconditions

- These are client-side eligibility checks. Existing API authentication, authorization, terminal
  occupancy, shift ownership, audit, and financial controls remain authoritative.
- No API, schema, permission catalog, payment, or persisted transaction behavior changes are
  included.
- No live request-time compliance preflight was run. `preflight_result: no_breach` and the
  `NOT-EXECUTED-*` reference are declaration-shape metadata only; the normal compliance sweep
  must reconcile the reference before production promotion.
- No deployed environment was changed or verified.

## Verification Evidence

The POS frontend contracts passed (132 files, 837 tests), focused suites passed (15 files, 255
tests), and the POS sales E2E passed through assigned branch selection, shift opening, checkout,
stock decrement, receipt detail, CSV export, and cleanup. The Storefront suite passed (252 files,
1,418 tests). POS and SKUpervisor builds, architecture checks, docs lint, app-version check,
fixture syntax check, and whitespace check passed. The full `npm run test:frontend` aggregate did
not complete: the IMS run reported multiple unrelated suite failures, and the category-placement
behavior suite also reported one failure in the aggregate run. That category suite passed in
isolation immediately afterward (21/21 tests). The aggregate then remained in one CPU-bound worker
for five minutes before interruption. Full details are recorded in Phase 548 of the implementation
phase ledger.
