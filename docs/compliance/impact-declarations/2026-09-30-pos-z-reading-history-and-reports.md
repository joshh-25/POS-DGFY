---
status: draft_pr
owner: DGFY POS/reports
last_reviewed: 2026-09-30
declaration_id: 2026-09-30-pos-z-reading-history-and-reports
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.04.07
verification_evidence: npm run check:compliance against sieitzz/develop...HEAD plus staged declaration (55 sensitive files checked); git diff --cached --check; PR #2156 functional test and build evidence
rollback_note: Revert the Z-reading history and Reports UI/API changes together with this declaration; no schema migration or transaction writes are introduced.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-30T12:59:30.161Z
preflight_request_ref: PREFLIGHT-36717925034-2026-09-30-POS-Z-READING-HISTORY-AND-REPORTS
---

# POS Z-reading history and Reports UI changes

## Compliance Impact Classification

Major. The changed POS API module/routes and shared POS frontend paths have a `major`
classification floor for the `pos` and `terminal` surfaces. This work adds read-only access to
saved Z-reading history and details and refines Reports and responsive POS interfaces; it does
not change fiscal calculations, payment settlement, transaction writes, or compliance policy.

## Affected Surfaces

- `pos` — Reports reconciliation/history, shared POS tables, filters, dialogs, and exports.
- `terminal` — POS terminal views and responsive shared components used by terminal workflows.

## Compliance Preconditions

- Existing authentication, branch/location scope, and `pos:view` / `reports:view` permission
  checks remain authoritative.
- Z-reading history and details are read-only views of saved data; viewing, filtering, printing,
  or exporting does not create or modify readings or transactions.
- Existing sales, tax, discount, payment, and tender calculations remain unchanged.
- No database migration or schema change is included.
- The preflight front-matter values are validator-required PR-open placeholders, not a live result;
  no request-time preflight was run. `NOT-EXECUTED-*` is accepted for a `develop` PR, and the
  continuous compliance sweep is expected to reconcile it after merge.

## Verification Evidence

- `npm run check:compliance` passed against the `develop` base after this declaration was added.
- `git diff --check` passed for the declaration and PR changes.
- PR #2156 records the focused POS/API tests and POS production build; the latest review reported
  all nine GitHub Actions checks passing on the pre-fix head.
