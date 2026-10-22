---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-22
related_adr: docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-10-22-pos-background-refresh-branch-dialog
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.16
verification_evidence: 21 focused POS hydration tests,POS production build,app-version floor check,compliance and architecture gates,docs lint
rollback_note: Revert the POS hydration and same-shift navigation changes with this declaration. No API, schema, migration, payment, tenant permission, or persisted shift data changes are included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-22T12:23:56.314Z
preflight_request_ref: PREFLIGHT-39776720585-2026-10-22-POS-BACKGROUND-REFRESH-BRANCH-DIALOG
---

# POS background refresh and same-shift navigation (#2688)

## Compliance Impact Classification

Major because the shared POS terminal and checkout surface is classified under the
`pos` and `terminal` compliance surfaces. The change prevents background permission
refreshes from reopening branch selection and preserves the active view when the
same terminal shift is resumed. It does not change authentication, permissions,
shift ownership, payments, stored transactions, or tenant data.

## Affected Surfaces

- POS terminal: background user hydration no longer opens the branch directory or
  clears its active lock, unlock, and drawer state through the branch-directory
  entry path.
- Terminal navigation: resuming the already-active shift leaves the selected view
  mounted; resuming a different shift retains its existing transition to Sell.

## Compliance Preconditions

- The initial login and explicit branch-view exit still open the branch directory
  for users with `pos:branch_view`.
- The `NOT-EXECUTED-*` request reference is a `develop` PR placeholder. No live
  request-time preflight is claimed; the continuous compliance sweep must reconcile
  it before production promotion.
- No API, schema, migration, payment, permission, or persisted shift behavior changes.

## Verification Evidence

Focused helper and source-contract tests, the POS production build, app-version
floor validation, and compliance and architecture checks are recorded in the PR
testing evidence. STAGING alt-tab verification remains outstanding after merge.
