---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-23
related_adr: docs/architecture/adr/0067-frontend-browser-support-baseline-and-es-compat-guardrail.md
declaration_id: 2026-10-23-pos-refund-dialog-swallow-rejection
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.10.16
verification_evidence: POS refund dialog regression test (red before, green after), POS and IMS production builds, targeted ESLint, app version check, compliance check
rollback_note: Revert the dialog rejection catch, its regression test, and this declaration together. No endpoint, permission, payment, tax, or persisted-data behavior changes.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-23T11:25:41.975Z
preflight_request_ref: PREFLIGHT-39945412063-2026-10-23-POS-REFUND-DIALOG-SWALLOW-REJECTION
---

# POS refund dialog rejection handling (#2724)

## Compliance Impact Classification

The path-based floor is major because the changed dialog and regression test are under
packages/web-core/src/features/pos/, which maps to the pos,terminal surfaces. The change
contains a rejected client-side action at the dialog boundary. The hook remains responsible for
showing the server error toast and deliberately rethrowing the error.

## Affected Surfaces

- POS and terminal: POSRefundWorkflowDialog no longer lets a rejected submit escape as an
  unhandled promise rejection. The dialog stays open so the operator can correct and retry.

## Compliance Preconditions

This is client-side rejection handling only. It changes no endpoint, authorization rule, payment
processing, tax calculation, compliance policy, schema, or persisted record. The hook's toast and
finally reset remain unchanged.

The NOT-EXECUTED-* reference records that request-time preflight was not run. The no_breach
front matter satisfies declaration shape only; it is not evidence of a live policy evaluation.
The timestamp is declaration metadata. Reconciliation through the normal compliance preflight
sweep remains required after merge.

## Verification Evidence

The new regression test failed against the unfixed dialog because its unhandledRejection listener
fired for the Axios-shaped 409. After the fix, the focused dialog, hook, and transaction-history
contract suites passed (3 files, 32 tests). Targeted ESLint completed with no errors; it emitted
only the existing React-version detection warning. The POS production build passed with existing
Vite dynamic-import warnings, and the SKUpervisor build passed. Compliance, docs lint, architecture,
and app version checks passed; no app version-floor bump is required for this develop change.

## Residual Risks

The dialog now contains all rejected submit errors. The existing API interceptor continues to
capture 5xx and network failures, while rejected 4xx responses no longer create an accidental
unhandled-rejection Sentry event. The hook's user-facing toast remains unchanged.

## Rollback

Revert the dialog's try/catch and the regression test. This restores the prior event behavior
without a data migration or server change.
