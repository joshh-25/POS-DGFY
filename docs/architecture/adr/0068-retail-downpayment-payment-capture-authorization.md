---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-08-21
last_reviewed: 2026-08-21
review_by: 2027-02-21
applies_to: retail_storefront, payments, checkout
topic: retail_downpayment_payment_capture_authorization
---

# ADR 0068: Retail Downpayment / Payment-Capture Authorization

## Status

Accepted (2026-08-21).

## Context

#273 ("Downpayment: Retail (Surebiz) storefront checkout") proposes a Retail-mode downpayment
flow: a small online payment captured at checkout, with the remaining balance collected in person
at delivery. Its spec requires new DB columns/enum values, a new per-order payments-ledger table,
an extended shared checkout API payload (`buildFnbCheckoutPayload.js`, shared with F&B), and a new
per-store `payment_mode` config surface — a database column, an API contract, and a config surface,
exactly the class of change ADR 0057 (Services) clause 3 and ADR 0041 (Hospitality) each gate
behind a future decision for their own verticals. Neither ADR covers Retail, and no equivalent ADR
exists for it — per `docs/architecture/ARCHITECTURE_GOVERNANCE.md` step 3, that is a "new
cross-boundary decision with no ADR covering it," so the correct path is a new ADR, not a
supersession of either analog. Tech-lead approval is a governance requirement only for the
supersede-a-binding-clause path (step 3, first bullet); since this decision introduces a new topic
rather than changing ADR 0057 clause 3 or ADR 0041's own clauses, that requirement isn't triggered
here — ordinary PR review applies, though a reviewer may still choose to loop in a tech lead given
the domain.

This decision must reconcile with five existing ADRs already touching adjacent ground: **ADR
0063** (POS split tender and manual walk-in payment recording) already governs a `paid`/`remaining`
allocation ledger and staff-attested tender recording in the same tenant-DB Retail/POS domain —
the closer structural analog for this decision's ledger and balance-settlement mechanics than
`platform_invoice_payments` (a landlord-DB, DGFY-to-tenant billing table #273's spec cited, unrelated
to Retail commerce). **ADR 0066** clause 2 (`[binding]`) already fixes every `pos_transaction_*`
money column at peso `DECIMAL(14,4)`, unchanged by that ADR — the opposite of #273's own citation of
ADR 0036/0066 as grounds for integer centavos on a `PosTransaction` column. **ADR 0052** (supersedes
ADR 0027) governs when a storefront commerce-payment-session finalizes an order against a
`payment.paid` webhook. **ADR 0016** already establishes a commerce payment adapter surface with
PayMongo as its first adapter. **ADR 0042** governs BIR fiscal/receipting; downpayment's fiscal
treatment is deferred there, not decided here. Services has the identical undocumented gap
(`docs/features/SERVICES_FULFILLMENT_PROFILES.md`'s "Online Checkout" row) — unaddressed by this
ADR, which is Retail-scoped only. `ARCHITECTURE_GOVERNANCE.md`'s Implementation Hardening Contract
applies to #273's eventual implementation as a payment/checkout change.

## Decision

1. **Online capture is authorized, capped to the downpayment amount.** `[binding]` A Retail order
   under `payment_mode = downpayment_required` may capture an online payment through the existing
   commerce payment adapter surface (ADR 0016), PayMongo QRPh only — never card, at this ADR. The
   authorized/captured amount is the downpayment amount only, never the order total, for such an
   order. The commerce-payment-session (ADR 0052) backing it stores and authorizes the downpayment
   amount, not the order total.
2. **Balance settlement stays staff-recorded, never a second automatic online charge.** `[binding]`
   The remaining balance is collected out-of-band (cash or manually-recorded GCash) by staff at
   delivery. No automatic second PayMongo charge may be initiated against the customer for the
   balance without a further superseding ADR. The balance-settlement recording
   action must carry its own single-use/idempotent confirmation guard, following ADR 0063 clause
   6's explicit-confirmation pattern — a distinct concern from the PayMongo webhook-event dedupe
   that #476 (fixed, PR #784) already guards: that fix prevents webhook-replay double-processing;
   this guards against staff double-recording the same walk-in payment.
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
   and Services' identical, still-open gap — are unchanged and require their own authorizing
   decision before any of this applies to them.
7. **Extending the shared checkout payload must not leak downpayment capability to other
   verticals.** `[binding]` `buildFnbCheckoutPayload.js` may gain additive, optional
   downpayment-related fields, shared with F&B as today. The existing
   `resolveStorefrontPaymentCapabilities` mechanism governs PayMongo provider/method availability
   only — it has no concept of `payment_mode` or `workflow_mode` and does not, by itself, prevent a
   non-Retail store from having a `downpayment_required`-shaped field honored. The backend must
   independently enforce that `payment_mode = downpayment_required` and the capture cap (clause 1)
   apply only to stores whose `workflow_mode` is Retail; a non-Retail store presenting downpayment
   fields must be rejected or ignored server-side, never silently honored.
8. **The recorded forfeiture policy is current state, not re-litigated here.** `[snapshot]` The
   2026-08-16 product decision — the Retail downpayment/reservation fee is non-refundable on
   cancellation, credited toward the final payment if the order proceeds — is the policy the
   schema from clause 4 must be able to represent (a forfeited-vs-applied-to-final-payment
   distinction on the ledger). Whether this extends to other verticals is unresolved and out of
   scope here.
9. **VAT/BIR/fiscal receipting is explicitly out of scope.** `[default]` The fiscal treatment of a
   downpayment or balance-settlement event is deferred to ADR 0042 or a future amending/superseding
   fiscal decision — #273's implementation must not silently invent one. #273's implementation is
   bound by `ARCHITECTURE_GOVERNANCE.md`'s Implementation Hardening Contract for the payment/checkout
   surfaces it touches, and its PR must state which hardening items passed, were intentionally
   deferred, and which residual risks remain.

## Consequences

- **Positive.** Unblocks #273 under explicit amount and vertical caps. Reuses ADR 0016's adapter
  vocabulary and ADR 0063's audit/idempotency pattern instead of inventing new ones. Keeps
  `PosTransaction` internally consistent on money-column type, correcting a direction error in
  #273's own money-convention citation before it became schema.
- **Negative / deferred.** An automatic second online charge for the balance remains unauthorized.
  Services' identical checkout gap remains open and unaddressed. VAT/BIR/fiscal treatment of
  downpayment/balance events is undecided. The config-surface's exact schema is finalized only at
  implementation time. The `customer_choice` `payment_mode` value remains reserved, not built.
- **Reversible.** Every authorized change is additive — new columns, a new table, a new enum
  value — scoped to one enum value on one vertical; nothing here requires a destructive migration
  or rewrites an existing `payment_timing`/`payment_status` vocabulary.

## Related

- ADR 0057 (Services Fulfillment Profiles) clause 3, ADR 0041 (Hospitality PMS) Consequences — the
  gating analogs this decision's structure follows.
- ADR 0063 (POS Split Tender and Manual Walk-in Payment Recording) — the in-domain ledger/attestation
  precedent this decision is deliberately distinguished from (clause 3).
- ADR 0066 (Voucher Sale-Time Price Resolution) clause 2 — the binding `pos_transaction_*`
  `DECIMAL(14,4)` convention (clause 4a).
- ADR 0052 (Tenant Revenue Collection Ledger and Settlement, supersedes ADR 0027) — the
  commerce-payment-session finalize-on-`payment.paid` behavior this decision's capture is scoped
  within (clause 1).
- ADR 0016 (Services Mode) — the commerce payment adapter surface / PayMongo-as-first-adapter
  vocabulary this decision reuses (clause 1).
- ADR 0042 (BIR RMO 24-2023 Fiscal Document and Accreditation Closure) — fiscal/VAT treatment
  deferred there (clause 9).
- `docs/features/SERVICES_FULFILLMENT_PROFILES.md` — Services' identical, still-open checkout gap
  (clause 6).
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — the Implementation Hardening Contract binding
  #273's implementation (clause 9).
- #273 — the feature this ADR unblocks. #626 — Retail `payment_capabilities` wiring, parallel and
  not blocked by this ADR. #476 (fixed, PR #784) — the webhook idempotency fix clause 2 builds on.
