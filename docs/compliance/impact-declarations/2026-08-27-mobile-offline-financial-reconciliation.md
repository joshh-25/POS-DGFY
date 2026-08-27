---
status: reference
owner: engineering
last_reviewed: 2026-08-27
related_adr: 0075-standalone-mobile-offline-financial-reconciliation.md
declaration_id: 2026-08-27-mobile-offline-financial-reconciliation
classification: regulatory
surfaces: pos,terminal,payments,compliance
reason_codes_impacted: MOBILE_STATUTORY_POLICY_STALE,POS_VOID_VERSION_CONFLICT,POS_VOID_STATUS_CONFLICT
policy_version: 2026.08.27
verification_evidence: focused mobile POS financial sync tests,mobile TypeScript check,mobile architecture and test guards,API mobile POS transport and use-case tests,API lint and compliance checks,Android staging UAT deferred by user
rollback_note: Revert the Phase 171 API routes and native Phase 3 schema/use cases together; preserve already-recorded local ledgers and disable replay rather than deleting financial records.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-27T00:00:00Z
preflight_request_ref: NOT-EXECUTED-PHASE-171-LOCAL-IMPLEMENTATION
---

# Mobile Offline Financial Reconciliation

## Compliance Impact Classification

Regulatory because this change governs statutory discount evidence, provisional
payment state, immutable receipt snapshots, void reversals, cash-shift totals,
and financial sync conflict handling.

## Affected Surfaces

- Native cashier checkout, receipts, reprints, history, voids, drawer actions,
  and shift summaries.
- Mobile POS device-policy, checkout replay, void replay, and transaction
  checkpoint API contracts.
- POS statutory-discount authorization audit behavior for the narrow signed
  native-offline exception in ADR 0075.

## Compliance Preconditions

- Only server-signed, unexpired, current Senior/PWD policy evidence qualifies;
  all other governed discounts retain online PIN authorization.
- Non-cash and statutory transactions remain visibly provisional until accepted.
- Void requests are append-only, idempotent, and version/status guarded.
- Receipt and sale history are immutable snapshots; no sync operation deletes
  or rewrites completed local financial evidence silently.
- Fiscal document issuance remains outside this phase.

## Verification Evidence

- Focused API tests cover signed policy issue/verification, tamper rejection,
  transaction checkpoint cursoring, and per-entry void conflict results.
- POS checkout dialog regression tests and their render-count contract pass under
  the shared frontend test and ESLint configuration.
- Focused mobile tests cover schema migration, settlement policy, checkpoint DTO,
  sync transport/reconciliation, sale atomicity, and shift-summary provenance.
- TypeScript, architecture, adjacent-test, documentation, lint, controller, and
  compliance gates are run before handoff.
- Android staging UAT is intentionally deferred until the user opens Android
  Studio; no emulator pass is claimed in this implementation turn.

## Preflight Reconciliation

No live environment preflight was executed during this local Phase 171 build.
The `NOT-EXECUTED-*` reference is explicit and must be replaced by the normal
promotion preflight before staging/production rollout. `no_breach/ALLOWED` here
records the local static policy result only and is not a live-host claim.
