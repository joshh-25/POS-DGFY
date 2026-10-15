---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-10
declaration_id: 2026-10-10-pos-incoming-order-count
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.10.07
verification_evidence: incoming-order-count Vitest tests,git diff --check,repository compliance gate
rollback_note: Revert the incoming-order count utility, its contract tests, and this declaration; no backend route, database schema, migration, or tenant data change is included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-13T03:16:12.473Z
preflight_request_ref: PREFLIGHT-38340478717-2026-10-10-POS-INCOMING-ORDER-COUNT
---

# POS incoming-order count utility

## Compliance Impact Classification

Major because the shared POS utility controls the visibility count presented in the terminal
navigation and therefore affects the cashier-facing `pos` and `terminal` surfaces. The utility
only selects an already-loaded online-order list according to the operator's existing access,
active-shift, and branch-monitor state; it does not create, authorize, persist, or mutate orders.

## Affected Surfaces

- `pos` — incoming-order visibility count in the terminal navigation.
- `terminal` — active-shift and branch-monitor queue selection for the count.

## Compliance Preconditions

- Existing POS authorization, shift ownership, branch scope, and server-side order filtering remain
  the source of truth.
- The utility returns an empty list when the incoming queue is hidden or the operator cannot view
  POS orders.
- The branch-monitor path is used only when the existing branch-monitor state is authorized and
  available; active-shift operators continue to use their existing shift queue.
- No backend route, database schema, migration, payment, or tenant-data behavior is changed.

## Verification Evidence

- Focused Vitest coverage passes for active-shift selection, branch-monitor selection, and denied or
  hidden queue access.
- Terminal navigation and workspace-sidebar integrations use the same resolver, so the displayed
  count stays aligned with the authorized active-shift or branch-monitor order source.
- `git diff --check` and the repository compliance gate pass for the utility and its tests.
