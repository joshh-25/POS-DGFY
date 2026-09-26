---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-14
declaration_id: 2026-09-14-pos-device-enrollment-phase-346
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: POS_DEVICE_ENROLLMENT
policy_version: 2026.09.14
verification_evidence: Phase 346 focused Jest suites, API lint, architecture guardrails, documentation checks, node syntax checks, git diff check
rollback_note: Revert the Phase 346 enrollment models, additive migration, device-proof service/routes, settings policy field, tests, and ledger/declaration together; strict enforcement remains disabled unless a tenant explicitly enables it.
preflight_result: no_breach
preflight_reason_code: POS_DEVICE_ENROLLMENT
preflight_run_at: 2026-09-14T19:15:00+08:00
preflight_request_ref: PHASE-346-LOCAL-IMPLEMENTATION
---

# Durable POS device enrollment and backend enforcement

## Compliance Impact Classification

Major because the change adds tenant-scoped POS device enrollment, signed
session/request proofs, revocation, and strict terminal policy handling. The
policy is opt-in and remains compatible with existing policy-off terminals.

## Affected Surfaces

- POS session establishment, cashier login, protected terminal operations, and
  native/mobile synchronization gates.
- Terminal registry settings, device-enforcement policy, enrollment lifecycle,
  administrator recovery actions, and audit records.
- Tenant-local schema, one-use activation/challenge state, replay protection,
  and cross-tenant/terminal/location binding.

## Compliance Preconditions

- The migration is additive and creates tenant-local tables; it does not rewrite
  shifts, transactions, payments, or historical records.
- Activation codes and challenges are stored as hashes and are consumed only
  once inside database transactions. Private keys and raw proofs are not stored,
  returned in settings, or written to logs.
- Strict enforcement is disabled by default. Enabling it requires an explicit
  terminal registry setting and an approved client enrollment; unsupported
  browser, Electron, and bridge clients fail closed on strict terminals.
- Revocation, replacement, and policy checks preserve existing membership,
  permission, location-grant, operator, shift, CSRF, and audit controls.

## Verification Evidence

- Fourteen focused API Jest suites passed (148 tests), covering migration
  fanout/idempotency, tenant isolation, binding and replay failures, revocation,
  policy-off behavior, DGFY challenge authorization, strict-client handling,
  copied-session denial, bootstrap route coverage, POS cashier-login route
  ordering, and mobile POS handler/bootstrap contracts. The declaration passes
  the compliance checker against its isolated Phase 346 changed-file set.
- API lint passed with zero errors; architecture guardrails, documentation/ADR
  checks, node syntax checks for all changed backend/migration files, and
  `git diff --check` passed.
- No database migration or production deployment was executed in this local
  implementation session.

This declaration covers the authorized local Phase 346 implementation only.
