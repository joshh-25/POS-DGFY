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
verification_evidence: focused mobile order and sync tests,mobile TypeScript check,API mobile sync and POS lifecycle tests,JavaScript syntax checks,Android staging UAT deferred by user
rollback_note: Disable the mobile order-action route and client replay together; preserve local order requests, conflicts, and dead letters for reconciliation rather than deleting them.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-28T00:00:00Z
preflight_request_ref: NOT-EXECUTED-PHASE-178-LOCAL-IMPLEMENTATION
---

# Mobile Offline Order Actions

## Compliance Impact Classification

Regulatory because the change records cash tender intent and controls when a
provisional pickup payment may become a server-settled payment.

## Affected Surfaces

- Native cashier online-order queue, status actions, and pickup cash dialog.
- Mobile POS order-action replay API and existing locked POS lifecycle mutations.
- Local encrypted order projections, conflict journal, and dead-letter evidence.

## Compliance Preconditions

- Cash remains unpaid locally until acknowledgement.
- Every mutation is idempotent and expected-state/version guarded.
- The server retains open-shift, terminal, permission, lifecycle, and audit rules.
- Permanent rejection preserves conflict and dead-letter evidence.

## Verification Evidence

Focused mobile tests cover atomic staging, cache retention, transport, and
reconciliation. Focused API tests cover mixed accepted/rejected batches and
stale cash/status rejection before mutation. Android staging UAT remains
deferred to the user-requested emulator test session.

## Preflight Reconciliation

No live environment preflight was executed. The local static declaration is not
a staging or production claim and must be replaced during promotion.
