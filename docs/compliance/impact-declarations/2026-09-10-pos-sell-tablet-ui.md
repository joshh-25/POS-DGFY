---
status: reference
owner: engineering
last_reviewed: 2026-09-10
declaration_id: 2026-09-10-pos-sell-tablet-ui
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.09.10
verification_evidence: focused POS tablet-sell contract suite (98 tests),POS lint,POS production build,tablet shell smoke at 1024x600,docs and ADR lint,git diff check
rollback_note: Revert the atomic tablet-sell UI commits and this declaration. The changes are presentation, layout, focus, and test coverage only; no API, database, migration, payment calculation, checkout payload, permission, or hardware-command behavior is changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-10T17:50:00+08:00
preflight_request_ref: NOT-EXECUTED-POS-SELL-TABLET-UI-20260910
---

# POS Sell Tablet UI

## Compliance Impact Classification

Major by repository classification floor. The affected implementation and
contract-test files are under `packages/web-core/src/features/pos/`, which the
compliance guardrail classifies as `major` for the `pos` and `terminal`
surfaces. This is a path-based classification; the implementation itself is a
tablet presentation-only change.

## Affected Surfaces

- `pos` — tablet catalog, current-sale action layout, takeout order-notes
  layout, and post-checkout Order Preview focus behavior.
- `terminal` — tablet drawer-authorization button sizing, current-sale touch
  targets, collapsed terminal-sidebar logo crop, and catalog pagination.

## Compliance Preconditions

- No API route, request payload, database table, migration, payment amount,
  checkout calculation, permission decision, fiscal output, audit event, or
  hardware command is changed.
- Existing checkout, drawer authorization, printer availability, receipt
  preview, and POS operator semantics remain in place.
- The changes are gated to the existing standalone POS tablet viewport where
  behavior differs from the PC layout. Mobile and desktop behavior remain
  separate unless the shared PC presentation is intentionally reused by the
  tablet path.
- The unrelated worktree changes outside the tablet POS Sell scope are not
  included in the planned commits.

## Verification Evidence

- Seven focused POS/web-core test files passed: 98 tests.
- Atomic catalog/pagination batch is limited to the catalog source, catalog
  contract tests, and the compact tablet pagination/drawer layout contracts.
- Atomic controls/layout batch is limited to the current-sale controls, tablet
  takeout notes, sidebar logo crop, and their focused contracts.
- Atomic focus batch is limited to the Order Preview title focus and
  keyboard-visible close-button focus contract.
- `npm run lint` passed in `apps/dgfy-pos`.
- `npm run build` passed in `apps/dgfy-pos`.
- Local tablet shell smoke at `1024x600` found the `DGFY POS` page, nonblank
  content, a `<main>` element, and zero alert elements.
- `npm run lint:docs` and the strict ADR check passed.
- `git diff --check` passed.
- The authenticated browser flow was login-gated in the local smoke session;
  the affected authenticated render states are covered by the static and
  component contract tests.

## Preflight Reconciliation

The declaration is created for the local branch and must be reconciled through
the repository's local ephemeral compliance fixture before delivery. No
staging or production operation is authorized or performed by this change.
