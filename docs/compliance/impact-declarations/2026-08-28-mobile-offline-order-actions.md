---
status: reference
owner: engineering
last_reviewed: 2026-08-28
related_adr: 0076-standalone-mobile-offline-order-actions.md
declaration_id: 2026-08-28-mobile-offline-order-actions
classification: regulatory
surfaces: pos,terminal,payments,orders
reason_codes_impacted: MOBILE_ORDER_VERSION_CONFLICT
policy_version: 2026.08.28
verification_evidence: "API mobile order-action sync and POS lifecycle tests,legacy web replay-hash compatibility tests,JavaScript syntax checks; dgfy-mobile PR 19 at merge SHA 0f44d42e5755fdb352cff708cfd0aad956512f27 is baseline context only and does not implement the Phase 180 offline replay client"
rollback_note: Disable the platform mobile order-action route while preserving submitted operation replays for reconciliation; no mobile-client rollback is claimed by this platform-only PR.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-28T00:00:00Z
preflight_request_ref: NOT-EXECUTED-PHASE-180-LOCAL-IMPLEMENTATION
---

# Mobile Offline Order Actions

## Compliance Impact Classification

Regulatory because the change records cash tender intent and controls when a
provisional pickup payment may become a server-settled payment.

## Affected Surfaces

- Mobile POS order-action replay API and existing locked POS lifecycle mutations.
- Expected-state validation and idempotent replay compatibility for both the
  versioned mobile envelope and legacy web POS callers.

## Compliance Preconditions

- Cash remains unpaid locally until acknowledgement.
- Every mutation is idempotent and expected-state/version guarded.
- The server retains open-shift, terminal, permission, lifecycle, and audit rules.
- The client remains responsible for preserving conflicts and dead letters;
  that client implementation is not included in this repository or claimed as
  versioned evidence by this PR.

## Verification Evidence

Focused platform API tests cover mixed accepted/rejected batches, stale
cash/status rejection before mutation, validator constraints, and legacy web
replay-hash compatibility. No mobile TypeScript check, native SQLite test, or
Android UAT result is claimed by this platform PR. The existing native order
queue baseline is [dgfy-mobile PR #19](https://github.com/Sieitzz/dgfy-mobile/pull/19)
at merge commit `0f44d42e5755fdb352cff708cfd0aad956512f27`; it predates and does not prove
the Phase 180 offline order-action client. That client still requires its own
versioned dgfy-mobile PR/commit and validation evidence.

## Preflight Reconciliation

No live environment preflight was executed. The local static declaration is not
a staging or production claim and must be replaced during promotion.
