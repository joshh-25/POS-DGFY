---
status: reference
owner: engineering
last_reviewed: 2026-08-25
declaration_id: 2026-08-24-pos-cashier-operator-authority
classification: major
surfaces: pos,terminal,cash_drawer,payments,refunds,online_orders
reason_codes_impacted: ALLOWED
policy_version: 2026.08.24
verification_evidence: pos-operator-authority-usecase-tests,pos-operator-mutation-attribution-contracts,pos-checkout-db-integration-tests,pos-workflow-regressions,migration-and-schema-checks,csrf-cookie-security-checks,all-frontend-production-builds
rollback_note: Disable the tenant/location attendance rollout flag and revoke active operator sessions to restore the legacy cashier path; the additive PIN, authority, and transaction-attribution columns can be rolled back only after no Phase 159 or Phase 160 data remains in use.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-25T00:55:00+08:00
preflight_request_ref: PHASE-157-158
---

# POS Cashier Operator Authority and Cash Custody

## Compliance Impact Classification

Major because the POS terminal now records a dedicated cashier authentication result, a
short-lived server-controlled operator authority, immutable takeover audit events, and counted
cash-custody handoffs. The register shift and opening float remain unchanged.

## Affected Surfaces

- POS terminal operator takeover, return, shared-relief, and counted-custody APIs.
- Tenant-local cashier PIN security state, operator-session authority, handoff events, and audit logs.
- Terminal pairing, CSRF, account disable, attendance break/time-out, and register-close revocation paths.
- Checkout, split payments, parked sales, refunds, voids, online-order cash collection, and drawer
  mutations that now resolve the actual operator on the server.

## Compliance Preconditions

- All operator actions remain disabled unless `pos_cashier_attendance_lifecycle_v1` is enabled for
  the resolved location.
- Cashier PINs are bcrypt hashes only; failed attempts are rate-limited and lockable, and failures
  use a generic response message.
- Authority is a short-lived HttpOnly cookie plus a tenant-local hashed session binding. The cookie
  is never returned in JSON and does not replace tenant identity authentication or terminal pairing.
- Takeover and custody transitions lock the open register shift, validate attendance/location/terminal
  scope on the server, and never open, close, or mutate the register opening float.
- Shared relief records no cash count. Counted custody requires expected cash, actual count, variance,
  notes, and both-party acknowledgement in one transaction boundary.

## Verification Evidence

- Focused use-case security and custody tests pass, including generic PIN failures and feature-off
  fail-closed behavior.
- The fresh-schema database suite proves A, B, A, B sale attribution under one register shift, and
  route contracts prove client-supplied cashier identity cannot override server authority.
- Migration, runtime schema, tenant-schema coverage, architecture, compliance, lint, syntax,
  focused workflow regression, and all three frontend production-build gates pass before activation
  is requested.
- Reporting and reconciliation remain deferred to Phase 161.
