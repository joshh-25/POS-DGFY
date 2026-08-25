---
status: reference
owner: engineering
last_reviewed: 2026-08-25
declaration_id: 2026-08-24-pos-cashier-attendance-lifecycle
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.08.24
verification_evidence: pos-cashier-attendance-lifecycle-tests,pos-cashier-attendance-route-tests,pos-cashier-attendance-frontend-tests,pos-cashier-attendance-settings-tests,tenant-schema-and-architecture-checks,production-build
rollback_note: Disable the default-off attendance feature setting and revert the additive lifecycle migration and handlers; existing register shifts, checkout, and transaction history remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-24T15:30:00+08:00
preflight_request_ref: PHASE-156
---

# POS Cashier Attendance and Break Lifecycle

## Compliance Impact Classification

Major because the POS terminal now exposes authenticated attendance and break state, records
server-owned timestamps and audit events, and adds tenant-scoped lifecycle permissions. The change
does not select a register operator, alter checkout attribution, move money, or calculate payroll.

## Affected Surfaces

- POS attendance and break lifecycle APIs and the gated terminal panel.
- Tenant-admin attendance configuration and active-location selection in POS Setup.
- Tenant-local attendance and break persistence, audit history, and retry constraints.
- POS permission and location-isolation enforcement.

## Compliance Preconditions

- The lifecycle remains disabled unless the tenant setting
  `pos_cashier_attendance_lifecycle_v1` is enabled and explicitly lists the location.
- Server timestamps, authenticated user identity, tenant model resolution, and server-resolved
  location access are authoritative; client timestamps and ownership fields are ignored.
- Corrections are manager-authorized, reasoned, idempotent, and auditable; rows are never silently
  deleted.
- No checkout, payment, fiscal, cashier-summary, payroll, or register-custody behavior changes in
  this phase.

## Verification Evidence

- Focused backend lifecycle, route, repository, schema, and migration tests pass.
- Focused frontend panel tests prove feature gating, active-break display, and duplicate-click
  suppression.
- Existing POS shift and checkout behavior remains covered by the unaffected regression suites.
- Architecture, tenant-schema, documentation, and compliance checks and the POS production build
  must pass before activation is requested.
