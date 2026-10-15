---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-15
declaration_id: 2026-10-14-pos-global-pin-void-reports
classification: major
surfaces: pos,terminal,payments,database,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.10.14
verification_evidence: API architecture guardrails, tenant schema coverage for the item-void migration, focused POS/API tests, X/Z report printer tests, POS production build, and git diff --check
rollback_note: Revert the global PIN, cashier authorization, duplicate-shift recovery guidance, item-level void/refund, X/Z report, printer, and item-void migration changes together with this declaration. Existing transaction and payment records remain authoritative.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-14T16:41:01+08:00
preflight_request_ref: NOT-EXECUTED-2026-10-14-POS-GLOBAL-PIN-VOID-REPORTS
---

# POS global PIN, duplicate-shift recovery, item void/refund, and X/Z report workflows

## Compliance Impact Classification

**Major.** The affected POS authorization, payment, terminal, and report paths are
classified at the major floor by the compliance matrix. The implementation centralizes
cashier authorization behind the existing server-side permission checks, explains an existing
open shift without creating a duplicate, adds item-level void/refund accounting, and aligns X/Z
report output with the saved report data and printer paper-width contracts.

## Affected Surfaces

- POS global cashier PIN and terminal authorization flows.
- Existing-cashier shift conflict handling and explicit resume guidance.
- Item-level void and proportional refund behavior with audit/history records.
- Cash drawer and day-close/Z-reading access controls.
- X-reading, Z-reading, report breakdown, and printer output paths.
- Additive tenant item-void state migration.

## Compliance Preconditions

- Server-side tenant, branch/location, terminal, shift, and cashier capability checks remain
  authoritative; the PIN is not a replacement for permissions.
- A cashier with an open shift is shown the authoritative existing terminal/location/shift
  details and may resume that shift; a second shift and duplicate opening cash are never created.
- Voiding an item affects only the selected line and recalculates the remaining transaction;
  payment/refund amounts are derived server-side and recorded in audit/history.
- Whole-transaction void and existing refund paths remain available and are not weakened.
- X-reading remains read-only; Z-reading remains the close/finalization workflow and requires
  the existing authorization path.
- Report and printer changes are presentation/reconciliation changes and do not rewrite settled
  transaction or payment totals.
- The migration is additive and does not delete existing transaction data.
- The preflight values are PR-stage placeholders; no live production preflight or deployment was
  performed in this local commit.

## Verification Evidence

- API architecture guardrails and controller-boundary checks passed.
- Tenant schema registry coverage passed for the item-void migration.
- Focused POS/API tests and X/Z report/printer tests passed during implementation.
- Duplicate-shift recovery tests passed: 12 backend tests and 31 focused frontend tests.
- POS production build passed; existing Vite warnings did not fail the build.
- `git diff --check` and the staged forbidden-marker scan passed.
