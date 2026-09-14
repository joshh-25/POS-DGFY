---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-09-13
last_reviewed: 2026-09-13
review_by: 2027-03-13
applies_to: pos_delivery_cash_custody
topic: courier_cash_custody_remittance
---

# ADR 0083: Courier Cash Custody and Remittance for COD Deliveries

## Status

Accepted (2026-09-13). Decides issue #838's seven-question slate (Pat, confirmed final
2026-09-13, via `.tmp/plan-838.md`).

> Strictness tiers per [ADR 0039](0039-adr-lifecycle-strictness-tiers-and-amendment-path.md):
> Clauses below are tagged `[binding]`, `[default]`, or `[snapshot]`. `binding` is a system
> invariant and needs a superseding ADR to change; `default` is amendable in place; `snapshot`
> records a point-in-time fact. Untagged clauses are `default`.

## Context

#838 names a pure money gap: once a courier physically holds COD cash — a Retail
downpayment balance, a plain Retail COD amount, or an F&B COD amount — DGFY has no concept of
"a courier is currently holding ₱X of the business's money" and no event for the courier handing
it back. Verified against the tree, not assumed:

- [ADR 0034](0034-manual-delivery-job-foundation.md) (manual delivery foundation, `amended`,
  authoritative) models assignment, run membership, and lifecycle, and keeps provider-owned jobs
  read-only in POS. It defines no expected-collection, custody, remittance, or variance concept.
- [ADR 0063](0063-pos-split-tender-and-manual-walk-in-payment-recording.md) (`amended`,
  authoritative) already settles the adjacent attestation rule this ADR extends to couriers: a
  cashier attestation is operational evidence and must never claim provider verification
  (clause 5, `[binding]`); reconciliation records are operational review evidence only and never
  mutate transactions, allocations, receipts, or settlement rows (2026-08-13 amendment, `[binding]`).
- [ADR 0070](0070-downpayment-authorization-across-workflow-modes.md) (`amended`, authoritative,
  supersedes ADR 0069) governs downpayment authorization and carries forward the fiscal/BIR
  treatment deferral. It does not decide the courier custody leg. (ADR 0069 is `superseded` and is
  cited here only as history, never as authority.)
- `pos_order_payments` kinds are `downpayment`, `balance`, `refund`, `forfeiture` only — an order
  payment-event ledger with no courier, run, custody, remittance, or variance dimensions. The
  plain-COD `Collect Cash` and downpayment `Settle Balance` use cases record payment events, not
  custody; the delivery-run serializer's expected/paid totals are order-level values, not
  cash-in-hand. None of them may serve as custody/remittance proof (Decision 2 and 7 below).
- #870 is the inverse prepaid case: a balance or full COD amount paid online before dispatch. There
  is nothing for the courier to collect and no remittance leg exists for it.

This ADR is a decision record only. It authorizes no schema, migration, model, endpoint,
permission, serializer, or UI change — that is follow-up implementation scope (see Consequences).

## Decision

1. **System boundary — DGFY owns courier-held cash custody and remittance.** `[binding]`
   Courier-held cash and the later courier-to-business hand-back are DGFY's operational/audit
   responsibility, not just the customer-payment-collected event. DGFY stops at recording custody
   and remittance as operational truth; it does not become a courier logistics or payroll system.
2. **Collection event — the courier's delivery-completion/handover action.** `[binding]`
   The authoritative collection event is the courier's handover action at delivery completion,
   attributed to the courier (registered person or typed third-party name, per ADR 0034's
   assignment contract) or to the staff member recording on their behalf. Collection is distinct
   from order payment recognition: `payment_status`, `amount_paid`, and run summary totals must
   never be treated as proof of custody or hand-back.
3. **Remittance event — per-run settlement with order-level allocations.** `[default]`
   A courier typically carries multiple orders per run and settles cash once at run end. A
   remittance is therefore one run-level settlement allocating amounts to one or more member
   orders, confirmed by the receiving location and the receiving actor at hand-back, with amount,
   timestamp, and custody evidence recorded per allocation.
4. **Variance policy — explicit, append-only, supervisor-resolved.** `[binding]`
   Shortage and overage are recorded as explicit append-only variance records. Resolving a
   variance requires supervisor/manager authority. A duplicate remittance attempt is rejected.
   Corrections are new append-only reversal entries — history is never edited.
5. **Courier scope — in-house personnel and typed third-party couriers only.** `[binding]`
   The model applies to registered in-house personnel and typed third-party courier names only, on
   ADR 0034's existing assignment terms. Provider-owned delivery jobs are explicitly excluded —
   they are read-only in POS and offer no reliable collection/remittance signal. Revisit this
   exclusion only once real courier-provider integration exists (ADR 0034's boundary).
6. **Vertical and timing scope — Retail downpayment-balance, plain COD, and F&B COD,
   uniformly.** `[default]` All three end with the courier physically holding cash and share one
   custody model. #870's pre-dispatch/prepaid case is excluded as "nothing to collect," not merged
   into this model.
7. **Financial boundary — operational/audit only; payment and fiscal records
   untouched.** `[binding]` Custody, remittance, and variance records never modify
   `pos_order_payments`, order `payment_status`, POS cash-drawer reconciliation, tenant revenue
   settlement, or fiscal receipts. Those stay governed exactly as today under ADR 0063 and ADR
   0070's existing deferrals. `pos_order_payments` remains the order payment-event ledger; custody
   transfers and variances belong to a separate append-only, actor-attributed ledger (the design
   direction a follow-up implementation issue will specify — this clause fixes the boundary, not
   the schema).

## Amendments

### 2026-09-14 — Courier custody/remittance ledger implementation (#1887, Phase 334)

The deferred implementation now provides a tenant-local, append-only ledger for
delivery-run remittances, per-order allocations, and shortage/overage variance
entries. A single idempotent POS action confirms a remittance and derives each
expected amount from the delivery-handover cash evidence; list/detail reads are
location-scoped. Variance resolution requires
`pos:delivery_run_variance_resolve` and inserts a reversal entry rather than
editing the original row. Provider-owned jobs and orders without physical cash
remain excluded, and no collection endpoint or UI is introduced.

This amendment implements the schema/API follow-up without changing the binding
financial boundary in clause 7: `pos_order_payments`, order payment status,
cash-drawer reconciliation, revenue settlement, and fiscal receipts remain
untouched. `[default]`

## Consequences

- **Positive.** The till-reconciliation question "does the business physically have the cash" gets
  an owned, auditable answer instead of conflating payment recognition with custody.
- **Negative / deferred.** The custody/remittance/variance ledger is operational evidence only;
  deployed tenant-schema and endpoint QA, UI, and any accounting/reconciliation integration remain
  separately governed work.
- **Reversible.** Widening or narrowing the scope (e.g. provider-owned jobs once integration
  exists, or additional verticals) is a tier-matched change per ADR 0039: `[binding]` clauses need
  a superseding ADR with tech-lead approval; `[default]` clauses take a dated amendment.
- **Guardrail preserved.** ADR 0069/0070's fiscal deferral is not widened: this ADR adds a parallel
  operational ledger, never a second accounting or receipting path.

## Validation

- `npm run lint:docs`
- `npm run check:adr --strict`
- `npm run check:architecture` (cross-boundary documentation references)

## Related

- #838 — the decided scoping issue (closed as a decision record by this ADR's implementing PR).
- #870 — the inverse prepaid case, excluded here as "nothing to collect."
- [ADR 0034](0034-manual-delivery-job-foundation.md) — manual delivery jobs, assignment contract,
  run grouping; provider-owned jobs read-only.
- [ADR 0063](0063-pos-split-tender-and-manual-walk-in-payment-recording.md) — merchant-owned
  attestation and reconciliation-evidence-only rules this ADR's custody model follows.
- [ADR 0070](0070-downpayment-authorization-across-workflow-modes.md) — downpayment authorization
  and fiscal deferral, unchanged by this ADR.
- [ADR 0039](0039-adr-lifecycle-strictness-tiers-and-amendment-path.md) — tier and amendment rules
  applied above.
- `docs/features/POS_MANUAL_DELIVERY_WORKFLOW.md` — collection, remittance, and variance semantics
  for operators.
- `docs/features/DOWNPAYMENT.md` — balance-settlement payment event, now explicitly distinct from
  custody hand-back.
