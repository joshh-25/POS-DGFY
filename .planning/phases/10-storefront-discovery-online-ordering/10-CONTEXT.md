# Phase 10: Storefront Discovery & Online Ordering - Context

**Gathered:** 2026-07-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers **consumer-facing storefront discovery and online ordering**: browsing/searching DGFY stores and Products via a map-based discovery surface, viewing a store's page and building a cart, completing a purchase as a guest (email-OTP-verified) or a logged-in DGFY Account, choosing pickup/delivery (immediate or scheduled) and a payment method, and having that order durably recorded on the Landlord side first, then finalized idempotently into the correct tenant's Availment — safely crossing the Landlord/Tenant database boundary for the first time in this system.

This phase also includes a **real, live PayMongo QR Ph payment integration** (ported from legacy ADR 0027's pattern), a materially larger scope than Phase 9's POS record-only payment approach.

**Requirements in scope:** STF-01 through STF-05.

**In scope:**
- Map-based store/Product discovery and search (backed by `dgfy_core.storefront_discovery_index`, established in Phase 2).
- Store page + cart (backend API; no new frontend app ships this milestone — same pattern as Phases 8-9).
- Guest checkout (email-OTP-verified, lightweight persistent guest identity) and logged-in DGFY Account checkout.
- Pickup/delivery, immediate/scheduled fulfillment mode selection, with business-hours + lead-time + max-advance-window constraints on scheduled orders.
- Real PayMongo QR Ph payment sessions (landlord-owned, per ADR 0027's core pattern), without the 1% platform-fee split and without refunds (both explicitly deferred — see Decisions).
- Stock reservation at order-placement time, tied to the PayMongo QR Ph session's expiry.
- Landlord-first durable order record → idempotent tenant Availment finalization, with an explicit manual-resolution state for unresolved cross-database write failures (no silent failure).

**Out of scope (belongs to other phases or explicitly deferred):**
- Order Fulfillment & Delivery Coordination (staff processing, status pipeline, courier assignment) — Phase 11.
- 1% DGFY platform-fee split/settlement routing (ADR 0027's full pattern) — deferred; design must not preclude adding it later (split routing is provider-side config at PayMongo-intent-creation time, not schema-baked).
- Refunds/reversals on storefront payments — deferred entirely, matching Phase 9's immutable-Availment stance (D-01 in `09-CONTEXT.md`).
- Mobile/SMS OTP for guest verification — no SMS provider exists in the codebase; deferred until one is chosen.
- Booking's branch-capacity slot mechanism is NOT reused for order scheduling — scheduling is independent, no capacity-limiting mechanism in Phase 10.
- New frontend apps (`dgfy-storefront`) — deferred milestone-wide, per PROJECT.md.

**Hard constraint — zero `backend/` writes (same as Phases 8-11):** No file under `backend/` may be edited. Legacy `backend/src/modules/commercePayments` and ADR 0027 are read-only pattern references — Phase 10 re-implements the pattern as new module code under `apps/dgfy-api`, never imports or edits the legacy implementation.

</domain>

<decisions>
## Implementation Decisions

### Payment Integration Depth (User-Confirmed)

- **D-01:** **Real PayMongo QR Ph integration, not record-only.** Unlike Phase 9's POS approach (record payment_method + amount, no live capture), Phase 10 builds a genuine PayMongo QR Ph payment-session flow: dynamic QR Ph via the Payment Intent workflow, webhook-driven confirmation, landlord-owned session records (following the established codebase pattern — `.planning/codebase/ARCHITECTURE.md` line 201: "Landlord-owned payment session records ... resolve tenant context before tenant order finalization"). This is a materially larger scope than a simple method+amount recording and is the single biggest scope commitment in this phase.

- **D-02:** **No 1% DGFY platform-fee split for now.** A single DGFY-controlled PayMongo account collects the full order amount. No per-tenant child-merchant onboarding, no automatic split/settlement routing (ADR 0027's full pattern). Tenant payout/reconciliation is a manual, future concern. **This must remain adjustable later** — split routing is decided at PayMongo intent-creation time (provider-side config), not baked into the order/payment schema, so a future phase can add per-tenant child-merchant + split without re-architecting Phase 10's tables.

- **D-03:** **No refunds/reversals.** Matches Phase 9's stance (D-01 in `09-CONTEXT.md`: finalized Availments are immutable, no cancellation/refund workflow). A cancelled/failed online order is a fulfillment-pipeline concern (Phase 11), not a payment-reversal concern in Phase 10.

- **D-04:** **Async, webhook-driven order finalization is inherent to this choice.** Unlike Phase 9's synchronous POS finalize, PayMongo QR Ph confirmation is asynchronous (customer scans, pays, webhook arrives later) — order finalization into the tenant Availment happens on webhook receipt, not on order-submit. This directly shapes STF-05's idempotency requirement.

### Guest Checkout Identity (User-Confirmed)

- **D-05:** **Guest verification is via email OTP, not phone OTP.** No SMS/phone-OTP provider exists anywhere in the codebase today (only `apps/dgfy-api/src/infra/emailOtp.js`, email-only). Rather than add a new SMS gateway integration now, Phase 10 requires phone (contact/coordination, unverified) + email (OTP-verified via the existing `emailOtp.js` infra, no new provider). Mobile/SMS OTP is deferred (see Deferred Ideas).

- **D-06:** **Guest orders create a lightweight persistent guest identity**, keyed by verified email, that persists across orders (not a fresh anonymous record every time). This enables recognizing a repeat guest and a future "was this you? create an account" upsell, at the cost of a small new identity concept distinct from a full DGFY Account (Phase 4). Lives Landlord-side (accounts/identity concepts are landlord-scoped per existing architecture).

### Stock Reservation Semantics (User-Confirmed)

- **D-07:** **Placing an order reserves stock immediately** (a temporary hold), rather than only validating availability at submit time and decrementing at finalize. This is the decision ADR 0029 explicitly flagged as undefined and deferred to a future ADR — Phase 10 is that decision. Two guests can no longer both "win" the last unit while one is mid-payment.

- **D-08:** **Reservation expiry is tied to the PayMongo QR Ph session's own expiry window** — one shared clock, not two independently-tuned timers that could drift out of sync.

- **D-09:** **Expired reservations auto-release.** An expired/abandoned QR Ph session automatically releases its stock hold back to available inventory; the order record moves to an expired/abandoned status. No manual operator step required.

- **D-10:** **Fail fast if the tenant DB is unreachable at order-placement time.** Since reserving stock requires writing to the tenant database (where Inventory truth lives, per ADR 0029) before payment even starts, if that write can't land, the order attempt is rejected before any payment/QR step is shown — no payment session is ever created for stock that couldn't be reserved. This keeps the failure mode simple and visible, at the cost of not being resilient to transient tenant-DB blips (a deliberate trade against reintroducing the oversell race).

### Scheduling & Delivery/Pickup Rules (User-Confirmed)

- **D-11:** **Scheduled pickup/delivery is independent of Phase 8's Booking mechanism.** Booking's branch-level slot capacity is for bookable Services (e.g. a massage appointment) — a fundamentally different concept from picking a future time for Product order fulfillment. Phase 10 uses a simple `requested_for` timestamp on the order, validated against business hours, with **no capacity-limiting mechanism** — a branch can accept unlimited scheduled orders in one time slot for now.

- **D-12:** **Business-hours + minimum-lead-time constraint required.** A scheduled time outside the branch's declared operating hours is rejected, and some minimum lead time is enforced (so kitchen/staff aren't blindsided by an order landing immediately). Exact lead-time value is planner/research's call.

- **D-13:** **Maximum advance-scheduling window is capped.** Scheduling arbitrarily far in the future is not allowed — matches how legacy Storefront delivery/pickup scheduling realistically works and avoids stale far-future orders sitting unprocessed. Exact cap value is planner/research's call.

### Claude's Discretion

- Exact lead-time minimum and max-advance-scheduling cap values (D-12, D-13) — planner/research's call, informed by legacy precedent if any exists.
- Exact PayMongo QR Ph session table shape, webhook handler design, and idempotency mechanism for order→Availment finalization — planner's call, following the established landlord-owned-session pattern (ARCHITECTURE.md line 201) and Phase 9's finalize-transaction discipline.
- Whether the manual-resolution state (STF-05) needs an operator-facing resolution API in Phase 10, or just the data model/state with resolution tooling deferred to Phase 11 — planner's call; at minimum the state must exist and be reachable, never silent.
- Exact discovery/search mechanics (proximity radius, category filters, "open now" filtering, full-text matching) — planner/research's call, building on the existing `storefront_discovery_index` projection and Redis geo-search caching already present in the codebase (`STOREFRONT_DISCOVERY_REDIS_CACHE_ENABLED`, `GEO_SEARCH_REDIS_CACHE_ENABLED`).
- Reservation table/mechanism shape (new table vs. a status flag pattern) — planner's call, as long as it satisfies D-07 through D-10.

### Folded Todos

- **"Wrap compliance verification and state writes in one transaction"** (`.planning/todos/pending/2026-07-13-wrap-compliance-verification-and-state-writes-in-one-transac.md`) — folded into Phase 10 review per user request, though this todo's actual content is Phase 8/9 compliance-state-write debt, not Storefront/Ordering domain scope. Flagged during discussion as a keyword-match false positive; included at user's explicit choice rather than left as unrelated backlog. Planner should assess whether it's actually actionable within Phase 10 or should be re-deferred.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Requirements
- `.planning/ROADMAP.md` §"Phase 10" — goal, success criteria (STF-01 through STF-05), Phase 8/9 dependencies.
- `.planning/REQUIREMENTS.md` — STF-01 through STF-05; v2.0 milestone scope and Out-of-Scope list (notably excludes "live capture/settlement/webhooks/chargebacks" generally, which this phase's PayMongo decision (D-01) deliberately goes beyond for the QR Ph payment-confirmation path specifically — narrower than full gateway processing, but real).
- `.planning/PROJECT.md` — "v2.0 Commerce Domain zero-touch (Phases 8-11): No writes/edits/migrations to any file under `backend/`"; Out of Scope list.
- `.planning/STATE.md` — session history; flagged "(3) PayMongo storefront payment flow design needs phase-specific research when Phase 10 is planned" as an open concern this discussion resolves.

### Phase 8/9 Context (CRITICAL)
- `.planning/phases/09-pos-checkout-payment/09-CONTEXT.md` — D-01 (immutable Availment, no refund/cancel workflow — informs D-03 here), Payment/Receipt entity shape, `modules/inventory` single-writer contract.
- `.planning/phases/08-commerce-foundation-product-catalog-booking-shift-cash-drawe/08-CONTEXT.md` — D-09 (Booking cancel authorization notes Phase 10's future consumer entry point), Booking's branch-capacity model (informs D-11's contrast).
- `.planning/phases/02-dgfy-database-foundation/02-CONTEXT.md` — D-12/D-13 (`storefront_discovery_index` naming and projection-only scope), ADR 0010 reference.

### Legacy PayMongo Precedent (Read-Only Reference, DO NOT EDIT)
- `docs/architecture/adr/0027-paymongo-commerce-qrph-platform-split-settlement.md` — the authoritative legacy pattern: landlord-owned payment sessions, dynamic QR Ph via Payment Intent, 1% platform-fee split (deferred here per D-02), refund reconciliation (deferred here per D-03), manual-resolution status on reconciliation failure. **Core pattern (sessions, webhook confirmation, manual-resolution) applies; split and refund sections do not apply to Phase 10.**
- `docs/architecture/adr/0012` (DGFY convenience fee definition) — referenced by ADR 0027; relevant only if/when the split (D-02) is revisited.
- `backend/src/modules/commercePayments` — legacy implementation of ADR 0027; read-only pattern reference, must not be imported or edited.
- `backend/src/models/Landlord/CommercePaymentSession.js`, `CommercePaymentRefund.js`, `TenantPaymentAccount.js` — legacy landlord payment models; read-only shape reference for the new `dgfy_core` equivalents.
- `.planning/codebase/INTEGRATIONS.md` §"Payments" and §"Webhooks & Callbacks" — full inventory of the legacy PayMongo integration surface (env vars, feature flags, webhook endpoints, service files).

### Architecture Governance & Ownership Boundaries
- `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — `routes → controllers → usecases → repositories → models` layering.
- ADR `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md` — "Storefront must not directly update stock balances... may request stock effects. Only Inventory records stock effects." Explicitly flags stock-reservation semantics as undefined/deferred — Phase 10's D-07 through D-10 is that deferred decision being made.
- ADR `docs/architecture/adr/0003-migration-facade-strategy.md` — Strangler Fig, no-legacy-mutation constraint.
- `.planning/codebase/ARCHITECTURE.md` line 201 — existing landlord-payment-session-resolves-tenant-context pattern already established in this codebase; Phase 10 follows this, doesn't invent it.

### Domain Specification
- `refactor-do-not-commit/DGFY_Domain_02_Product.md` §9 — Availment schema (this phase's orders finalize into an Availment, same shape as Phase 9's).
- `refactor-do-not-commit/DGFY_Domain_02_Product.md` (fulfillment_mode section, ~line 205-232) — `pickup`/`delivery` fulfillment modes, fulfillment_stage free-form progression (Phase 11 consumes this; Phase 10 sets the initial mode/timing).
- `refactor-do-not-commit/DGFY_Domain_02_Product.md` line 473, 499 — flags `customer_account_id` as a cross-database (Landlord Account → Tenant Availment) reference requiring application-level resolution, not a DB FK; directly relevant to D-06's guest identity and STF-05's cross-database finalization.

### Existing OTP Infrastructure (Read-Only Reference)
- `apps/dgfy-api/src/infra/emailOtp.js` — existing email OTP mechanism (purposes, TTL, max attempts, enforcement flag); Phase 10 reuses this for guest email verification (D-05).

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/STACK.md` — module and coding conventions.

### Folded Todo
- `.planning/todos/pending/2026-07-13-wrap-compliance-verification-and-state-writes-in-one-transac.md` — see Folded Todos note in Decisions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`apps/dgfy-api/src/infra/emailOtp.js`** — existing email OTP mechanism; reused directly for guest email verification (D-05).
- **`dgfy_core.storefront_discovery_index`** (Phase 2) — the public discovery projection table this phase's browse/search reads from.
- **Redis geo-search/discovery caching** — `STOREFRONT_DISCOVERY_REDIS_CACHE_ENABLED`, `GEO_SEARCH_REDIS_CACHE_ENABLED` and related TTL env vars already exist in the legacy config surface (`.planning/codebase/INTEGRATIONS.md`); pattern worth reusing for the new discovery endpoints.
- **`apps/dgfy-api/src/modules/inventory`** (Phase 8) — single writer for stock effects; Phase 10's reservation mechanism (D-07) and eventual finalize step call into this, never write stock directly.
- **`apps/dgfy-api/src/modules/availments`** (Phase 9) — the finalize/Availment-creation usecase this phase's orders ultimately become; Phase 10 likely calls into or closely mirrors this rather than duplicating Availment-creation logic.

### Established Patterns
- **Landlord-owned payment session resolves tenant context before tenant order finalization** (`.planning/codebase/ARCHITECTURE.md` line 201) — the exact pattern Phase 10's PayMongo integration (D-01) and cross-database order finalization (STF-05) should follow; already proven in the legacy codebase via ADR 0027.
- **Single-writer contract (ADR 0029)** — only `modules/inventory` writes stock effects; Phase 10's stock reservation (D-07) must request effects, not write directly, matching Phase 9's precedent.
- **Manual-resolution state for unreconcilable cross-boundary failures** — ADR 0027 decision #8 establishes this pattern for payment/order reconciliation; STF-05 requires the same for Phase 10's Landlord→Tenant order finalization.

### Integration Points
- New PayMongo integration lives entirely under `apps/dgfy-api` (new module, e.g. `modules/commercePayments` or similar) — never imports `backend/src/modules/commercePayments`.
- Guest OTP verification calls `apps/dgfy-api/src/infra/emailOtp.js` directly.
- Order finalization calls into Phase 9's `modules/availments` and Phase 8's `modules/inventory`, following the same call-not-write discipline established there.

</code_context>

<specifics>
## Specific Ideas and Rationale

### Why Real PayMongo Instead of Record-Only (D-01)?

The user explicitly chose the larger-scope real integration over the simpler record-only path that would have mirrored Phase 9's POS approach. This is a deliberate scope commitment — Phase 10 is materially bigger than Phase 9 as a result, and research/planning should size accordingly.

### Why No Split, No Refunds, But Split Stays Adjustable (D-02, D-03)?

The user wants to prove the core checkout → payment → order-finalization path end-to-end with real money movement, without taking on the full ADR 0027 program (per-tenant onboarding, wallet readiness, split settlement, refund reconciliation) in one phase. The explicit ask that the split remain "adjustable in the future" means the schema/design must not hardcode a single-recipient assumption in a way that would require re-architecture later.

### Why Fail-Fast on Tenant-DB-Unreachable at Reservation (D-10)?

The user chose simplicity and visibility over resilience here: reject the order attempt cleanly rather than accept it and risk the exact oversell race that stock reservation (D-07) was introduced to close.

</specifics>

<deferred>
## Deferred Ideas

- **Mobile/SMS OTP for guest checkout** — no SMS/phone-OTP provider exists in the codebase today. Revisit once a provider (e.g. Semaphore for PH numbers, Twilio) is chosen. Until then, guest verification is email-OTP-only (D-05).

- **1% DGFY platform-fee split settlement** (ADR 0027's full pattern) — deferred per D-02; revisit once per-tenant payout needs become real. Design must remain adjustable (provider-side config, not schema-baked).

- **Refunds/reversals on storefront payments** — deferred per D-03, matching Phase 9's immutable-Availment stance. A future phase would need to define refund-triggering conditions (customer-initiated? staff-initiated on cancel? tied to Phase 11's fulfillment pipeline?).

- **Booking-style branch-capacity for scheduled orders** — deferred per D-11; if kitchen/delivery-fleet capacity limits become a real operational problem, a future phase could generalize Booking's capacity mechanism to cover order-fulfillment slots too.

### Reviewed Todos (not folded)

None — the one matched todo was folded per user request (see Folded Todos in Decisions), not reviewed-and-deferred.

</deferred>

---

*Phase: 10-Storefront Discovery & Online Ordering*
*Context gathered: 2026-07-13*
