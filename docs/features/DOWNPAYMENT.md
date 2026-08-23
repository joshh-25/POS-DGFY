---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-08-23
applies_to: downpayment_checkout
topic: downpayment_partial_payment_checkout
---

# Downpayment & Partial-Payment Checkout

Governed feature doc for the downpayment epic (#815 / #273, Phases 136-144, 147-148, 150-151).
Closes Phase 149 (#827), the epic's final phase — Implementation Hardening Contract per
`docs/architecture/ARCHITECTURE_GOVERNANCE.md`.

## 1. What this feature is

A Retail store can require a customer to pay only part of an order online, with the remainder
collected by staff at handover (delivery or pickup), instead of forcing either full prepayment or
plain cash-on-delivery. Three per-store payment modes exist:

- **`full_payment`** — the customer always pays the full total online.
- **`downpayment_required`** — the customer always pays a configured downpayment online; the
  balance is COD, settled by staff at handover.
- **`customer_choice`** (Phase 150, #866) — the customer picks per order, at checkout, between the
  two behaviors above. The store-level setting never introduces a third order shape:
  `resolveDownpaymentForTotal` (`downpaymentPolicy.js`) still only ever returns `full_payment` or
  `downpayment_required`; a `customer_choice` store's `payment_election` request field
  (`'full'` | `'downpayment'`, default `'full'`) collapses to whichever of those two shapes applies
  before anything downstream (capture, serialization, presentation) ever sees it.

Downpayment amount is configured per store as either a percentage of the order total or a fixed
peso amount, with an optional minimum floor (Phase 138/150 settings surface,
`DownpaymentSettingsPanel.jsx` / `downpaymentSettingsUseCases.js`). The minimum-floor field only
applies in percentage mode — in fixed mode it was a structurally redundant no-op and is hidden
(Phase 150, #865).

## 2. Order lifecycle

1. **Quote/checkout** — server-authoritative resolution of downpayment applicability
   (`storeUseCases.js`, `DOWNPAYMENT_POLICY_UNRESOLVED` fail-closed guard). Retail-scoped only
   (ADR 0070, carried from ADR 0069 clause 6 `[binding]`) — F&B/Services/Simple never see this.
2. **Capture** (Phase 141, #822) — the downpayment amount is charged online via any enabled
   method, capped to the downpayment amount. The order persists as `payment_type: 'cash'`
   (the balance is COD by construction), `payment_timing: 'on_pickup'|'on_delivery'`,
   `payment_status: 'partially_paid'`, `amount_paid > 0`, `balance_due > 0`. Ledger row 1:
   `pos_order_payments.kind = 'downpayment'`.
3. **POS accept/reject** (Phase 144, #824) — staff accepts (order proceeds) or rejects. A reject
   refunds exactly the downpayment captured, never the full total; forfeiture is a per-store
   merchant configuration (ADR 0069 clause 8 `[default]`).
4. **Balance settlement** (Phase 148, #825) — at handover (`ready_for_pickup` /
   `out_for_delivery`), staff records the remaining balance via a **separate** `Settle Balance`
   action — never an extension of the plain-COD `Collect Cash` flow, whose own guards
   (`payment_status === 'unpaid'`, `cash_received >= total_amount`) are untouched. Methods are ADR
   0063 clause 4 `[binding]`'s merchant-owned V1 set: `cash`, `gcash`, `maya`, `card` (a store-owned
   terminal, never PayMongo card), `bank_transfer`. A non-cash settlement requires explicit
   confirmation both in the UI (checkbox) and the request (`manual_payment_received: true`) per ADR
   0063 clause 6 `[binding]`, fails closed without it, and must never claim provider verification
   (`payment_provider: 'merchant_owned'`, `provider_event_id: null`) per clause 5. Writes ledger row
   2: `pos_order_payments.kind = 'balance'`, linked to row 1 via `related_pos_order_payment_id`, in
   the same transaction that flips the order to `payment_status: 'paid'`, `balance_due: 0`.
5. **Completion** — both the pickup and delivery completion paths require `balance_due === 0`, not
   merely a `paid` label, so an order can't complete with an unsettled balance
   (`assertDeliveryCompletionReadiness`, and the pickup branch of
   `buildUpdateOnlineOrderStatusUseCase`).
6. **Customer-facing presentation** (Phase 142/151, #823/#826) — checkout, tracking, and
   confirmation screens all render the amount paid and balance due via one shared module,
   `shared/model/storefrontDownpaymentPresentation.js`, rather than five hand-rolled inline copies.
   The order-confirmation email (#532) does not yet exist as a surface at all and is explicitly
   descoped — tracked separately, not part of this epic's definition of done.

## 3. Ledger shape

`pos_order_payments.kind ∈ {'downpayment', 'balance'}` (schema since Phase 137, #819). A downpayment
order carries exactly one `downpayment` row and, once settled, exactly one `balance` row, linked via
`related_pos_order_payment_id`. `amount` on the `balance` row is the balance settled, never the cash
tendered — change is not revenue.

## 4. Implementation Hardening Contract — closure statement

Per `docs/architecture/ARCHITECTURE_GOVERNANCE.md`'s Implementation Hardening Contract, required for
any payment/checkout cross-boundary workflow before it's considered done:

| # | Item | Verdict | Basis |
|---|---|---|---|
| 1 | Replay and reuse risk | **Pass** | Durable operation-replay (`findOperationReplayEntry`/`persistOperationReplay`) with dedicated duplicate-submit tests proving exactly-once ledger writes — Phases 141, 144, 148 |
| 2 | Lifecycle completeness | **N/A** | No new account identity is introduced — this feature operates on orders, not accounts |
| 3 | Deferred verification honesty | **Pass** | Fiscal/BIR treatment (ADR 0069 clause 9 `[default]`) and platform-fee-on-balance (#817) are both named explicitly per-phase and in this doc's Residual Risks, never implied covered |
| 4 | Submit-boundary safety | **Pass** | Collect Cash and Settle Balance are separate dialogs, separate endpoints, and mutually exclusive on the order card by construction (Phase 148); the checkout payment-election control is a distinct component, not nested inside an existing form (Phase 150) |
| 5 | Backend boundary proof | **Pass** | Controllers stay transport-only; business logic in use cases; persistence in repositories; `npm run check:architecture` clean on every phase in scope |
| 6 | Backend behavior proof | **Pass** | Success, validation failure, duplicate/conflict, replay/reuse, and the persistence side effect are all covered per-phase (e.g. `posOrderBalanceSettlement.usecase.test.js`, `posOnlineOrderCompletionBalanceGate.usecase.test.js`) |
| 7 | Frontend behavior proof | **Pass** | State/label/gating coverage exists per-phase, including the explicit negative proof that Collect Cash and Settle Balance never both render for the same order (`terminalBalanceSettlement.behavior.test.jsx`'s first two cases, Phase 148) — re-confirmed by re-reading the test this phase rather than assumed |
| 8 | Rendered UI proof | **Mostly pass, closed this phase** | No prior phase recorded a deliberate rendered-UI check; this phase runs and records one (§5) — page identity, nonblank content, no console errors, one primary interaction, all at desktop viewport. Mobile viewport was attempted but the browser resize didn't take effect in this environment; disclosed as an open gap in §5 rather than claimed |
| 9 | Build-surface proof | **Pass** | `npm run build:pos` / `build:store` run whenever shared code was touched (e.g. Phase 150 ran both for its storefront + POS settings changes) |
| 10 | Documentation closure | **Closed by this phase** | This document |

## 5. Live verification (this phase)

Run against the local-test Docker stack (`do-not-commit/local-test/`, `docker context ch`) via the
`dgfy-pos.nicenature.space` / `dgfy-store.nicenature.space` tunnels — **not actual `staging`**.
`origin/staging` (`6a06a1e6`, 2026-08-20) is behind `origin/develop`'s current head and does not yet
carry Phases 148, 150, or 151; a real staging E2E pass should be re-run once the next `develop →
staging` promotion lands (owned by the Promoter role, not a new issue — implied by the existing
promotion flow).

**Result: PASS.** Run 2026-08-23 against the rebuilt local-test stack (image built from this
branch, i.e. `develop` @ `178255e95` plus this phase's own docs-only changes), via
`dgfy-pos.nicenature.space` / `dgfy-store.nicenature.space`, tenant `Pat Marketing` (Main Store,
`payment_mode: downpayment_required`, fixed PHP 1000).

- **Happy path**: storefront cart (15x Neozep, PHP 1200 subtotal) -> checkout showed "Downpayment
  due now: PHP 1000.00 / Balance due on delivery: PHP 212.00" correctly, both on the checkout
  summary and the PayMongo-test QR step. Payment confirmed via a properly HMAC-signed
  `payment.paid` webhook (constructed against `PAYMONGO_TEST_WEBHOOK_SECRET`, matching
  `paymongoService.verifyWebhookSignature`'s real scheme -- not an unsigned bypass, which this
  stack's `NODE_ENV=production` correctly refuses). Order created `partially_paid`,
  `amount_paid: 1000`, `balance_due: 212`. POS incoming queue rendered the same split on the order
  card. Confirmed -> Preparing -> Out for Delivery: **Settle Balance** button appeared, **Collect
  Cash did not** (item 7's negative proof, live -- matches the two existing assertions in
  `terminalBalanceSettlement.behavior.test.jsx`). Settled PHP 212.00 cash; dialog computed change
  off the balance, not the total. Order flipped to `payment_status: paid`, `balance_due: 0`.
  **Mark Delivered was unavailable before settlement and available immediately after** -- the
  completion gate observed live, not just in tests. Completed. Final DB state: exactly two
  `pos_order_payments` rows (`downpayment` PHP 1000 via `qrph`/`paymongo`, `balance` PHP 212 via
  `cash`/no provider), the second linked to the first via `related_pos_order_payment_id`.
- **Reject/refund path**: a second identical order, rejected at POS instead of accepted. The
  confirmation dialog stated plainly: *"DGFY will request a refund of the PHP 1000.00 downpayment
  collected online... The PHP 212.00 balance was never charged"* -- confirming the refund scope is
  exactly the downpayment, never the untouched balance. The automatic refund itself fell to
  "needs admin review" because the simulated payment id has no real PayMongo-side counterpart to
  refund -- the designed manual-reconciliation fallback firing correctly, not a defect in this
  phase's scope.
- **Rendered-UI proof (item 8)**: page identity, nonblank content, and primary-interaction checks
  passed on both apps at desktop viewport; no console errors surfaced across the full flow
  (`read_console_messages`, both tabs). **Not completed**: a genuine mobile-viewport pass -- the
  browser resize did not take effect in this environment and was not pursued further rather than
  faked. Disclosed as a gap, not silently dropped; desktop coverage across every changed screen in
  this epic is otherwise complete.
- **Not staging**: as stated above, this ran against the local-test stack, not `origin/staging`.

## 6. Residual risks

- **#668 — QRPh voucher-redemption race — resolved, not open.** Re-verified fresh rather than
  copied from the issue's original framing: **#668 was closed 2026-08-20 as `COMPLETED`.** The race
  (a QRPh payment succeeding, then voucher-redemption finalization failing because another order
  exhausted the same limit first) is **accepted as-is, not eliminated** — reserving the redemption
  earlier, at session-creation, was considered and rejected, since this flow has no session-expiry
  release mechanism and would hold a redemption slot hostage for a session the customer never pays.
  What shipped instead: `finalizePaidCommerceSession.js` tags this specific finalization failure as
  `VOUCHER_REDEMPTION_UNAVAILABLE` (rather than a generic error), so the existing
  `paid_manual_resolution_required` operator queue (`commercePaymentAdminUseCases.js`) can route it
  correctly. Documented in ADR 0066's 2026-08-19 amendment. Carried here only because this epic's
  downpayment capture uses the same QRPh session-creation-to-webhook-finalization shape, not because
  anything downpayment-specific remains unresolved.
- **Fiscal/BIR treatment of a downpayment or balance-settlement event** — deferred throughout, ADR
  0069 clause 9 `[default]`, carried forward by ADR 0070. Neither a capture nor a balance settlement
  produces a fiscal receipting event today.
- **Platform fee on the balance leg** — computed only on the captured downpayment amount today
  (ADR 0069 clause 10 `[default]`); #817 tracks whether the balance leg should separately generate
  one. Open.
- **Order-confirmation email (#532)** — does not yet show (or exist to show) the downpayment split;
  descoped from Phase 151, tracked as its own greenfield surface.

## 7. References

- ADR 0070 (`docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md`,
  authoritative) — supersedes and carries forward ADR 0069's Decision clauses, amended in Phase 150
  to lift `customer_choice`.
- ADR 0063 (`docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md`)
  — merchant-owned method set, attestation shape, explicit-confirmation fail-closed rule.
- `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` — Phases 136-144, 147, 148, 150, 151 (each phase's
  own entry is the detailed record; this doc summarizes, it does not restate).
