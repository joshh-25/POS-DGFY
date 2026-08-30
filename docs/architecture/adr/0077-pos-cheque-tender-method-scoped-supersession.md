---
status: accepted
authority_level: authoritative
owner: pos
date: 2026-08-30
last_reviewed: 2026-08-30
review_by: 2027-02-28
applies_to: architecture_decision
topic: pos_cheque_tender_method
---

# ADR 0077: POS Cheque Tender Method (Scoped Supersession of ADR 0063 Clause 4)

## Status

Accepted (2026-08-30).

## Context

Issue #1085 (tracked under #1183, Surebiz Wave 1, Phase 202) adds `cheque` as a tender method for
Settle Balance (`POST /pos/orders/:id/record-payment`, Phase 148 / #825) and, in scope for this same
phase, for split-tender allocation. Today a cashier taking a cheque has to mis-record it as
`bank_transfer` and stuff the cheque number into the free-text `payment_reference` field — a false
tender classification in the ledger, and invisible to any per-method reconciliation
(`pos_merchant_tender_reconciliations`, ADR 0063 Amendments item 1).

`docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md` clause 4 is
`[binding]`:

> 4. V1 methods are `cash`, `gcash`, `maya`, `card`, and `bank_transfer`. Store-owned GCash/Maya QR,
>    card terminal, and bank-account tenders are classified as `merchant_owned`; they are separate
>    from PayMongo and Storefront commerce payments. `[binding]`

ADR 0063 is `status: amended`, `authority_level: authoritative`, `review_by: 2027-02-13` — not
decayed. Adding `cheque` as a sixth tender directly contradicts this enumerated `[binding]` clause.
Per ADR 0039's strictness tiers, a `[binding]` clause change takes the most expensive path: a new
superseding ADR plus tech-lead approval — a dated `## Amendments` block (the route ADR 0063 already
used once, on 2026-08-13) is sanctioned only for `[default]`/untagged clauses.

Three routes were presented (`PHASE_202_PLAN.md` §0, Checkpoint B): a full superseding ADR replacing
the whole V1 tender set (B1); a **scoped-supersession ADR**, narrow to clause 4 only, leaving the
rest of ADR 0063 intact (B2) — the same shape ADR 0064 already used to scoped-supersede ADR 0057
clause 3 when widening a different enumerated set; or treating clause 4 as a non-exhaustive snapshot
and amending in place (B3, not defensible given the `[binding]` tag). **Pat approved route B2 via the
coordinator on 2026-08-30**, in response to that plan's Checkpoint B — this ADR is that approved
route, not a self-certified one. See "Approval" below for the record.

## Decision

1. **Scoped supersession of ADR 0063 clause 4, and only clause 4.** `[binding]` Clause 4's V1
   five-tender enumeration (`cash`, `gcash`, `maya`, `card`, `bank_transfer`) is replaced by a
   six-tender set adding `cheque`: `cash`, `gcash`, `maya`, `card`, `bank_transfer`, `cheque`. ADR
   0063 clauses 1, 2, 3, and 5 through 14 remain in force verbatim and unamended by this ADR.
2. **Cheque is classified `merchant_owned`, identically to the other four non-cash V1 tenders.**
   `[binding]` No new classification is introduced. Clauses 5 (attestation persistence), 6 (explicit
   confirmation, fail-closed), 7 (optional reference number as audit aid), 9 (paid/remaining
   arithmetic), 12 (never a PayMongo checkout, fee, or settlement row), and 13 (no credential
   storage) govern cheque exactly as they already govern GCash, Maya, card, and bank transfer — none
   of them needed a new branch to cover it.
3. **The cheque number is carried in the existing optional `payment_reference` field.** `[default]`
   No new column is added on `pos_order_payments`, `pos_transactions`, or `pos_payment_allocations`.
   This is a direct application of ADR 0063 clause 7 `[default]`: a merchant-owned reference is an
   audit aid, never proof of anything beyond presentation — for a cheque specifically, the number
   proves a cheque was presented bearing it, not that it will clear, and not that DGFY verified
   anything. The dialog and its copy must say so plainly rather than implying a stronger claim.
4. **Split tender is in scope for this widening.** `[binding]` `cheque` is added to
   `SPLIT_PAYMENT_METHODS` (`apps/dgfy-api/src/validators/posValidator.js`) and to the
   `payment_method`/`payment_type` ENUMs on all three tables the tender set reaches:
   `pos_order_payments.payment_method`, `pos_transactions.payment_type` (copied onto the parent
   transaction from a split allocation — `splitPaymentUseCases.js`), and
   `pos_payment_allocations.payment_method`. Widening only `SPLIT_PAYMENT_METHODS` without widening
   both dependent ENUMs would produce a runtime ENUM-truncation write failure on the first cheque
   split allocation; all three widen together, in one migration, one commit.
5. **No dedicated split-tender picker UI ships in this phase.** `[default]` Cheque becomes
   selectable through the split-tender allocation API once the schema and validator widen, but
   `packages/web-core`'s split-tender picker component is not updated to offer it in this phase. This
   is a stated, accepted gap for Phase 202 — not a blocker — tracked as a UI follow-up rather than
   silently left undiscoverable.

## Consequences

- **Positive.** Cheque becomes a fully modeled tender across both Settle Balance and split-tender
  allocation, with zero new schema fields and zero new attestation/confirmation mechanism — it
  inherits ADR 0063's existing merchant-owned machinery in full.
- **Negative / deferred.** The split-tender picker UI gap (Decision 5) means the API accepts a
  method the POS split-tender screen cannot yet select; a cashier taking a split cheque payment
  today would need a workaround outside this phase's scope, or the Settle Balance path instead (which
  does get a picker).
- **Reversible, with a caveat.** The ENUM widening is additive; reverting the code while the ENUM
  stays widened is harmless. Rolling the migration itself back is refused outright once any `cheque`
  row exists on a given tenant database — loud failure over silent financial-data mutation, matching
  the precedent migration's own posture (`20260817000001-expand-storefront-paymongo-payment-methods.cjs`).

## Related

- ADR 0063 (POS Split Tender and Manual Walk-in Payment Recording) — clause 4 is scoped-superseded by
  this ADR's Decision 1, for the six-tender enumeration only; clauses 1, 2, 3, and 5 through 14 are
  unaffected. Cross-reference added to ADR 0063's own `## References` section.
- ADR 0039 (ADR Lifecycle, Strictness Tiers, and Amendment Path) — the process this ADR follows for
  changing a `[binding]` clause.
- ADR 0064 (Services Handoff Legs and Round-Trip Persistence) — the in-repo precedent for this exact
  shape of scoped supersession (widening an enumerated set via a narrow ADR rather than an amendment),
  used here as the chosen route (B2).
- Issues #1085 (POS cheque tender method, this decision's tracking issue), #1183 (Surebiz Wave 1,
  parent tracking issue).

## Approval

Per ADR 0039's binding-clause change process (new superseding ADR + tech-lead approval): Pat, acting
as tech lead, approved route B2 (this scoped-supersession ADR) via the coordinator on 2026-08-30, in
direct response to the three routes presented in `PHASE_202_PLAN.md` §0 Checkpoint B. That approval
is the authorization this ADR proceeds under; it is recorded here rather than treated as still
pending.
