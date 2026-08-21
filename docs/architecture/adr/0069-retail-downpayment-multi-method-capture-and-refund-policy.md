---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-08-21
last_reviewed: 2026-08-21
review_by: 2027-02-21
applies_to: retail_storefront, payments, checkout
topic: retail_downpayment_payment_capture_authorization
supersedes: 0068-retail-downpayment-payment-capture-authorization.md
---

# ADR 0069: Retail Downpayment — Multi-Method Capture, Refund Policy, and Fee Basis

## Status

Accepted (2026-08-21). This ADR supersedes ADR 0068.

## Context

> **Strictness tiers (ADR 0039).** Clauses below are tagged `[binding]`, `[default]`,
> or `[snapshot]`. `binding` needs a superseding ADR to change; `default` needs an
> amendment block in the implementing PR; `snapshot` is documentation and may be
> updated by ordinary work. Untagged clauses elsewhere in this document are `default`.

ADR 0068 (accepted 2026-08-21, same day as this ADR) authorized Retail downpayment capture, capped
to PayMongo QRPh only (clause 1, `[binding]`). Hours later, during the #273 planning/consolidation
session, the product owner reversed that constraint: capture should support any online method the
store has enabled, configurable per store and optionally narrowed for downpayment specifically
(#816), with card once constructible. Two further deltas from the same session: the
refundable/non-refundable forfeiture policy (ADR 0068 clause 8, recorded as a fixed `[snapshot]`)
becomes a per-store toggle instead of a fixed policy; and the platform-fee basis for a partial
capture (previously undecided) is recorded as the captured amount, pending revisit (#817).

Changing a `[binding]` clause has exactly one lawful path under ADR 0039 and
`ARCHITECTURE_GOVERNANCE.md`: a new ADR that supersedes it, plus tech-lead approval. Amendment is
not available — a prior fix to ADR 0068 itself (clause 2) specifically removed "or amending
decision" language from a binding clause for this exact reason. The decay exception (a binding
clause whose `review_by` has passed reverts to `[default]`) does not apply either: ADR 0068's
`review_by` is 2027-02-21, six months out, fully in force. This ADR is therefore the correct and
only path, not a stylistic preference.

Editing ADR 0068 in place was considered and rejected: the governance system has no "revise in
place" path for an `accepted` ADR, and doing so would erase the fact that the QRPh-only cap was a
real decision, genuinely reversed within the same day. Superseding preserves that record instead of
hiding it. The same-day date on both ADRs is intentional, not a clerical error.

This ADR restates ADR 0068's clauses 2–9 unchanged except where explicitly noted, and does not
reopen anything ADR 0068 already settled beyond those three deltas. In particular it does **not**
revisit ADR 0068's own Context argument about why tech-lead approval wasn't triggered for *that*
ADR (a new topic, no binding clause changed) — that reasoning does not carry over here, since this
ADR does change binding clauses, and its own approval requirement is unconditional.

## Decision

1. **Online capture is authorized for any enabled method, capped to the downpayment amount.**
   - a. `[default]` A Retail order under `payment_mode = downpayment_required` may capture an
     online payment through the existing commerce payment adapter surface (ADR 0016) using any
     method that is both provider-available (the store's resolved `payment_capabilities`) and
     merchant-enabled via a configurable per-store allow-list — a business-wide set, optionally
     narrowed by a downpayment-specific set (#816's scope). Card is authorized by this clause but
     not yet constructible: #477 records that PayMongo card enablement on the DGFY live account is
     an unresolved external dependency, `createQrphPaymentIntent` currently hardcodes
     `paymentMethodAllowed: ['qrph']`, and the repository contains no 3DS implementation. Authorized
     does not mean available; each method still requires its own capability wiring before use.
   - b. `[binding]` The authorized/captured amount is the downpayment amount only, never the order
     total, for such an order, regardless of which method is used. The commerce-payment-session
     (ADR 0052) backing it stores and authorizes the downpayment amount, not the order total.
2. **Balance settlement stays staff-recorded, never a second automatic online charge.** `[binding]`
   The remaining balance is collected out-of-band (cash or manually-recorded GCash) by staff at
   delivery. No automatic second PayMongo charge may be initiated against the customer for the
   balance without a further superseding ADR. The balance-settlement recording action must carry
   its own single-use/idempotent confirmation guard, following ADR 0063 clause 6's
   explicit-confirmation pattern — a distinct concern from the PayMongo webhook-event dedupe that
   #476 (fixed, PR #784) already guards: that fix prevents webhook-replay double-processing; this
   guards against staff double-recording the same walk-in payment.
3. **This is a deliberately separate mechanism from ADR 0063, not an extension of it.** `[binding]`
   ADR 0063's split-tender session/allocation ledger governs cashier/shift/terminal-scoped,
   in-person tender attestation at one POS checkout. This decision governs unattended online
   capture at storefront checkout time, followed by a later, separate staff-recorded balance event
   — a different shape, not a variant of ADR 0063's flow. ADR 0063 clause 11 ("exactly zero
   remaining balance" to complete) governs split-tender session completion specifically; it does
   not constrain a downpayment `PosTransaction`'s own lifecycle, which may legitimately sit at a
   nonzero `balance_due` between order creation and delivery.
4. **New DB surface is authorized, scoped to Retail's own domain.** `[default]` A `partially_paid`
   `payment_status` value (already precedented on `PosPaymentSession.status`/`FnbCheck.status`),
   `amount_paid`/`balance_due` tracking, and a new per-order payments-ledger table may be added.
   Three sub-rules:
   - a. Any column added directly to `PosTransaction` (e.g. `amount_paid`, `balance_due`) is peso
     `DECIMAL(14,4)`, matching every existing `pos_transaction_*` money column and ADR 0066 clause
     2 — not integer centavos.
   - b. A standalone ledger table may use integer centavos internally, but must name exactly one
     conversion boundary back to `PosTransaction`'s `DECIMAL(14,4)` columns, and should follow ADR
     0063's tenant-DB allocation-row shape as its structural reference, not `platform_invoice_payments`.
   - c. No existing `payment_timing` enum — including `PosTransaction`'s own
     (`'upfront'`/`'on_pickup'`/`'on_delivery'`) and `ServiceBooking`'s distinct
     (`'prepaid'`/`'postpaid'`/`'deposit'`) — gains a `downpayment` literal. Downpayment is a
     payment-structure split, not a timing value; it is represented on the
     `payment_mode`/`payment_status` axis instead.
5. **Config-surface storage is a steer, not a mandate.** `[default]` Implementation should prefer a
   typed per-tenant/per-store settings table (modeled on `TenantAffiliateSettings.js`'s
   one-row-per-tenant, typed-column shape) over an untyped `system_settings` KV row. The exact
   schema is left to implementation and `docs/database`, not fixed here.
6. **Authorization is Retail-scoped only.** `[binding]` This decision does not extend to F&B,
   Services, or Hospitality. Their own payment-collection deferrals — ADR 0041 for Hospitality,
   and Services' identical, still-open gap (tracked at #812) — are unchanged and require their own
   authorizing decision before any of this applies to them.
7. **Extending the shared checkout payload must not leak downpayment capability to other
   verticals.** `[binding]` `buildFnbCheckoutPayload.js` may gain additive, optional
   downpayment-related fields, shared with F&B as today. The existing
   `resolveStorefrontPaymentCapabilities` mechanism governs PayMongo provider/method availability
   only — it has no concept of `payment_mode` or `workflow_mode` and does not, by itself, prevent a
   non-Retail store from having a `downpayment_required`-shaped field honored. The backend must
   independently enforce that `payment_mode = downpayment_required` and the capture cap (clause 1b)
   apply only to stores whose `workflow_mode` is Retail; a non-Retail store presenting downpayment
   fields must be rejected or ignored server-side, never silently honored.
8. **Refund vs. forfeiture is per-store merchant configuration.** `[default]` Whether a customer
   cancellation forfeits the collected downpayment or refunds it is a per-store toggle, defaulting
   to refundable. This replaces ADR 0068's fixed `[snapshot]` recording of the 2026-08-16 product
   decision (non-refundable, credited toward the final payment if the order proceeds) as a single
   universal policy; that decision is retained here as the *default merchant intent when the toggle
   is set to non-refundable*, not as the only allowed configuration. The schema from clause 4 must
   represent a forfeited-vs-applied distinction on the ledger regardless of the toggle's setting.
9. **VAT/BIR/fiscal receipting is explicitly out of scope.** `[default]` The fiscal treatment of a
   downpayment or balance-settlement event is deferred to ADR 0042 or a future amending/superseding
   fiscal decision — implementation must not silently invent one. Implementation is bound by
   `ARCHITECTURE_GOVERNANCE.md`'s Implementation Hardening Contract for the payment/checkout
   surfaces it touches, and its PR must state which hardening items passed, were intentionally
   deferred, and which residual risks remain.
10. **Platform-fee basis for a partial capture is the captured amount.** `[default]` DGFY's
    platform fee on a downpayment-mode order is computed on the amount actually captured online
    (the downpayment), using the existing `platformFeeCentavos` formula unchanged — no fee-code
    change is required as a consequence of this decision. This is recorded as current policy, not a
    permanent one: #817 tracks the open question of whether fee-on-captured-only should remain
    permanent policy or whether the balance leg (which never routes through PayMongo per clause 2)
    should generate a fee through a separate mechanism. Tiered `[default]` deliberately, so that
    revisit can proceed as a dated amendment on this ADR rather than requiring a further
    supersession.

## Consequences

- **Positive.** Unblocks #273's actual product requirement (configurable multi-method capture)
  under the same amount and vertical caps ADR 0068 already established. Preserves ADR 0068's
  ledger/audit/idempotency design (clauses 2–5) without rework. Makes the refund/forfeiture policy
  and the fee-basis question explicit, dated decisions instead of leaving them implicit or
  unresolved.
- **Negative / deferred.** An automatic second online charge for the balance remains unauthorized.
  Services' identical checkout gap remains open and unaddressed (#812). VAT/BIR/fiscal treatment of
  downpayment/balance events is undecided. The config-surface's exact schema is finalized only at
  implementation time. The `customer_choice` `payment_mode` value remains reserved, not built. Card
  capture is authorized but not constructible until #477 resolves. The fee-basis clause is
  deliberately provisional and expected to be revisited (#817).
- **Reversible.** Every authorized change is additive — new columns, a new table, a new enum
  value, a per-store configuration toggle — scoped to one enum value on one vertical; nothing here
  requires a destructive migration or rewrites an existing `payment_timing`/`payment_status`
  vocabulary.

## Related

- ADR 0068 (Retail Downpayment / Payment-Capture Authorization) — superseded by this ADR. Its
  clauses 2–7, 9 are carried over unchanged; clause 1 is split and widened (clause 1); clause 8 is
  changed from a fixed snapshot to a per-store toggle (clause 8); a new clause 10 is added.
- ADR 0057 (Services Fulfillment Profiles) clause 3, ADR 0041 (Hospitality PMS) Consequences — the
  gating analogs this decision's structure follows (clause 6).
- ADR 0063 (POS Split Tender and Manual Walk-in Payment Recording) — the in-domain ledger/attestation
  precedent this decision is deliberately distinguished from (clause 3).
- ADR 0066 (Voucher Sale-Time Price Resolution) clause 2 — the binding `pos_transaction_*`
  `DECIMAL(14,4)` convention (clause 4a).
- ADR 0052 (Tenant Revenue Collection Ledger and Settlement, supersedes ADR 0027) — the
  commerce-payment-session finalize-on-`payment.paid` behavior this decision's capture is scoped
  within (clause 1b).
- ADR 0016 (Services Mode) — the commerce payment adapter surface / PayMongo-as-first-adapter
  vocabulary this decision reuses (clause 1a).
- ADR 0042 (BIR RMO 24-2023 Fiscal Document and Accreditation Closure) — fiscal/VAT treatment
  deferred there (clause 9).
- `docs/features/SERVICES_FULFILLMENT_PROFILES.md` — Services' identical, still-open checkout gap
  (clause 6).
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — the Implementation Hardening Contract binding
  implementation (clause 9).
- #273 — the feature this ADR unblocks. #816 — the configurable payment-method allow-list this
  ADR's clause 1a authorizes. #817 — the fee-basis revisit this ADR's clause 10 anticipates. #477 —
  the external PayMongo card-enablement dependency clause 1a names. #812 — Services' own downpayment
  authorization, not covered by this ADR (clause 6). #476 (fixed, PR #784) — the webhook idempotency
  fix clause 2 builds on.
