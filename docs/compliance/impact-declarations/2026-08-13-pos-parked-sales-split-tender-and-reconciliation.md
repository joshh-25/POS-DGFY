---
status: reference
owner: engineering
last_reviewed: 2026-08-13
declaration_id: 2026-08-13-pos-parked-sales-split-tender-and-reconciliation
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.13
verification_evidence: changed-file forbidden-marker scan,git diff whitespace check,tenant schema registry coverage,repository pre-commit guardrails
rollback_note: Revert the POS application commits in reverse dependency order; do not reverse additive tenant migrations until dependent code is removed and retained payment and parked-sale data is assessed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-13T00:00:00+08:00
preflight_request_ref: DGFY-POS-20260813
---

# POS Parked Sales, Split Tender, and Reconciliation

## Compliance Impact Classification

Major. This change extends the POS terminal with parked-sale lifecycle support,
split-tender collection and payment allocation, provider confirmation details,
merchant tender reconciliation, order-history visibility, and related receipt
presentation. It does not change the compliance lifecycle or lower existing
tenant, location, terminal, cashier, or fiscal-document boundaries.

## Affected Surfaces

1. POS parked-sale creation, revision-safe resume, and completion behavior.
2. Split-tender sessions, allocations, payment confirmation, and receipt output.
3. PayMongo reconciliation and merchant tender reconciliation records.
4. POS order-history queries, delivery-assignment details, and mode-aware terminal presentation.
5. Tenant schema synchronization and runtime schema audit coverage for the new additive records.

## Compliance Preconditions

1. POS mutations remain tenant-, location-, terminal-, and authenticated-user-scoped.
2. Parked sales do not become completed transactions until checkout succeeds.
3. Payment allocations remain traceable to their session and transaction, and recorded totals must reconcile before completion.
4. Provider confirmation and refund reconciliation remain idempotent and retain provider references without storing secrets.
5. Receipt payment breakdowns are derived from persisted transaction data and do not alter fiscal classification or tax computation.
6. Additive migrations must remain registered in tenant schema synchronization and must not be rolled back while dependent records remain.
7. This declaration covers local development commits only; it does not authorize deployment or promotion to `main`.

## Verification Evidence

1. The changed-file forbidden-marker scan passed before staging.
2. `git diff --check` reported no whitespace errors before staging.
3. The tenant schema registry coverage pre-commit check passed for all seven new migrations.
4. Repository pre-commit compliance and architecture guardrails must pass for the committed change set.
5. Post-rebase frontend validation passed 321 test files and 1,807 tests, including the time-independent service Calendar lifecycle test.
6. Final reconciliation also covers the whitespace-only cleanup in `posCurrentSaleActions.behavior.test.jsx` and `PosCheckoutDetailsSlot.jsx`; neither cleanup changes runtime behavior.
