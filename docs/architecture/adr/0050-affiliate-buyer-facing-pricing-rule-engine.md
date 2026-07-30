---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-07-29
last_reviewed: 2026-07-29
review_by: 2027-01-29
applies_to: affiliates_program, storefront, commerce_payments, backend
topic: affiliate_buyer_facing_pricing_rule_engine
---

# ADR 0050: Affiliate Buyer-Facing Pricing Rule Engine (Phase 1)

## Status
Accepted (2026-07-29)

## Context
[ADR 0036](0036-affiliates-program-commission-and-cashout.md) shipped a commission ledger,
attribution, and cashout, but an affiliate never changes what the buyer pays — commission is
computed after the fact from the order subtotal. A recorded product discussion, reconciled with
this codebase in
[docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md](../../proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md),
asks for affiliate identity to become an input to the buyer-facing price itself: an owner can set an
affiliate to sell at a markup, a discount, or an exact price, and separately earn commission on top.
This is a new cross-boundary decision — no existing ADR covers a feature changing the buyer-facing
price — and per ADR 0039 it is written to record the decision, not the specification; column lists,
phasing, and the full decision log with every settled question live in the scope doc above and are
linked, not restated.

## Decision

1. **Storefront checkout only in Phase 1.** In-store POS is deliberately deferred — an affiliate's
   QR scanned at the counter interacts with the barcode scanner, offline terminals, and refunds in
   ways that need their own design pass. `backend/src/modules/pos/usecases/posUseCases.js:2548` is
   untouched, which is what makes this boundary provable rather than aspirational. `[binding]`
2. **The selling-price rule is tenant/enrollment-scoped, not a new price column.** Six modes
   (`BASE_PRICE`, `PERCENTAGE_MARKUP`, `FIXED_MARKUP`, `PERCENTAGE_DISCOUNT`, `FIXED_DISCOUNT`,
   `EXACT_AFFILIATE_PRICE`) resolve against the tenant's existing catalog price — a second price
   field would drift from it immediately. `[default]`
3. **Commission modes are NONE, PERCENTAGE_OF_BASE, and RESELLER_MARGIN.** Fixed-amount commission
   is not implemented — not demonstrated in the source recording, and redundant while commission is
   percentage-of-base. `[default]`
4. **Settlement policy is explicit, not assumed.** `MERCHANT_FUNDED`,
   `COMMISSION_ADDED_TO_BUYER_PRICE`, `RESELLER_MARGIN` — merchant-funded is the default, but when a
   buyer price adjustment and a commission are simultaneously active with no policy set, the
   calculation service (`backend/src/modules/shared/utils/affiliatePricingPolicy.js`) throws
   `UNRESOLVED_SETTLEMENT_POLICY` rather than inventing a merchant net. `[binding]`
5. **Pricing is pre-commit and blocking; accrual stays post-commit and non-blocking.** A deliberate
   departure from ADR 0036's convention: a bookkeeping failure must never fail a sale that already
   committed, but silently charging the buyer the wrong price is the worse failure mode, so an
   unresolvable or negative affiliate price fails checkout closed
   (`AFFILIATE_PRICE_UNRESOLVED`/`AFFILIATE_NEGATIVE_PRICE`). Catalog *display* (browsing, not yet
   committed) fails open to the plain catalog price instead — the asymmetry is intentional: checkout
   is the point that matters, and failing the whole catalog listing over a misconfigured rule is a
   worse outcome than a stale preview price. `[binding]`
6. **A below-cost floor guard is enforced per item at resolution time, not at rule-save time.** A
   Phase 1 rule applies to every product a tenant sells, at widely varying costs, so there is no
   single representative cost to validate when the owner configures it. The guard instead runs
   against each item's own `cost_per_unit` at checkout (blocking,
   `AFFILIATE_BELOW_COST_FLOOR`) and at catalog display (fails open, same convention as item 5).
   `[default]`
7. **Commission accrual reuses ADR 0036's ledger and lifecycle unchanged; only the base and amount
   computation change.** `dgfy_affiliate_commissions` gains nullable snapshot columns
   (`base_subtotal_centavos`, `buyer_subtotal_centavos`, `reseller_margin_centavos`,
   `price_rule_type_snapshot`, `settlement_policy_snapshot`) — all `NULL` for any row with no
   affiliate price rule attached, including every row that predates this ADR. `[default]`
8. **Commission base is gated behind an explicit tenant opt-in, not a blanket behavior change.**
   `tenant_affiliate_settings.commission_base_mode` defaults to `discounted_subtotal` — ADR 0036's
   existing `subtotal − discount` formula, generalized and byte-identical when no affiliate price
   rule is active. `base_price_subtotal` computes commission on the catalog subtotal regardless of
   any discount, matching the recording's "affiliate earns the same whether or not a discount is
   running" example. See ADR 0036's Amendments for the tie back to its Decision 3. `[default]`
9. **Attribution moves from a 30-day cookie to session-scoped.** `sku_aff_attr` no longer sets
   `Max-Age`/`Expires`. A live behavior change: attributions that would have converted on a later
   visit no longer will. The now-unenforced `attribution_window_days` setting is removed from the
   owner panel in the same change, since it would otherwise misrepresent this cookie's real
   lifetime. `[default]`

## Consequences

1. **VAT moves with the affiliate price.** `vatableSales` derives from `line_subtotal`, so a
   discount reduces the tenant's output VAT and a markup increases it. Correct per BIR — VAT is
   computed on the price actually paid — but a tax-visible consequence of a pricing feature, stated
   here so it is not rediscovered as a surprise.
2. **The DGFY 1% convenience fee (ADR 0012) moves too.** `computeDgfyConvenienceFee` runs on the
   affiliate-adjusted subtotal, consistent with ADR 0012's "computed on gross subtotal." A markup
   increases platform fee revenue on that sale; a discount decreases it.
3. **Reseller margin settles through the existing PayMongo split path (ADR 0027), not a new money
   movement.** Under `RESELLER_MARGIN` the buyer pays more than the merchant's base price; the gap
   is booked as an ordinary commission row (`reason: 'reseller_margin'`, no enum migration needed —
   `reason` is a free `STRING(120)`) and reaches the affiliate through ADR 0036's existing manual
   cashout flow. This ADR does not touch PayMongo split-settlement itself.
4. **Refunds on a reseller-margin sale are flagged, not solved.** ADR 0036's reversal path
   (`reverseAffiliateCommissionForOrder`) handles today's flat commission correctly. A refund where
   the margin is already reserved in — or paid out through — a cashout is a real gap this ADR does
   not close. Left for a future ADR before reseller-margin sees production volume.
5. **Promo codes stack with affiliate discounts.** Commission computes on the base price (item 3),
   so affiliate earnings are unaffected either way; the exposure is entirely merchant margin, surfaced
   as a warning in the owner config UI rather than blocked.

## Hardening Contract Status
Checkout is named explicitly in `ARCHITECTURE_GOVERNANCE.md`'s Implementation Hardening Contract.
Status of the 10 items for this Phase 1 change:
- **Satisfied:** replay/reuse (idempotent via ADR 0036's existing `(tenant_id, order_reference)`
  index, unchanged), backend boundary proof (controllers/use cases/repositories unchanged in
  shape), backend behavior proof (characterization tests pin pre-existing accrual behavior before
  the base change; new tests cover success, validation failure, and the fail-closed paths),
  frontend behavior proof (new vitest coverage for the owner config UI and the ported preview
  module), documentation closure (this ADR plus the scope doc).
- **Deferred to the owner's machine, and named here rather than left implicit:** the migration has
  not run against a live MySQL database (no MySQL is reachable in the environment this phase was
  built in); rendered-UI proof (desktop + mobile viewport screenshots) has not been captured, since
  it requires the running app; build-surface proof covered `build:pos` and `build:store` (the two
  surfaces this change touches) but not a live-server smoke test. None of this is silently skipped —
  it is recorded in
  [the scope doc's environment-readiness section](../../proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md)
  as the explicit remaining work before production.

## References
1. [ADR 0036](0036-affiliates-program-commission-and-cashout.md) — commission ledger, attribution,
   cashout this phase extends
2. [ADR 0012](0012-dgfy-global-convenience-fee-and-ui-brand-separation.md) — DGFY convenience fee basis
3. [ADR 0027](0027-paymongo-commerce-qrph-platform-split-settlement.md) —
   PayMongo split-settlement, unmodified by reseller margin
4. [ADR 0039](0039-adr-lifecycle-strictness-tiers-and-amendment-path.md) — strictness tiers and
   amendment path this ADR follows
5. `docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md` — full decision log, phasing,
   and measured environment readiness
6. `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — Implementation Hardening Contract
