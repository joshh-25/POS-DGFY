---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-08-17
last_reviewed: 2026-08-20
review_by: 2027-02-17
applies_to: vouchers, storefront, pos, commerce_payments, backend
topic: voucher_sale_time_price_resolution
---

# ADR 0066: Voucher Sale-Time Price Resolution

> Strictness tiers per [ADR 0039](0039-adr-lifecycle-strictness-tiers-and-amendment-path.md):
> Clauses below are tagged `binding`, `default`, or `snapshot`. `binding` is a system invariant
> and needs a superseding ADR to change; `default` is amendable in place; `snapshot` records a
> point-in-time fact. Untagged clauses are `default`.

## Context

[ADR 0033](0033-commercial-promo-and-statutory-pos-discount-boundaries.md) governs commercial promos,
stored as JSON in `system_settings.storefront_promos` on the explicit premise that "no additional
database table is required." Issue #454 settles that a promo code is **one kind of voucher**, and
#455 replaces that JSON with four real tenant tables carrying a redemption ledger.

That creates a decision no existing ADR covers: a voucher can pin a **final unit price**
(`benefit_class = 'fixed_price'`, the retail-B2B driver in #584), and
[ADR 0029](0029-catalog-inventory-pos-storefront-ownership-boundaries.md) Decision 2 is `binding`
that **Catalog owns base sale price**. A sale-time price layer resolved above Catalog's price needs
its own ADR — the same move [ADR 0050](0050-affiliate-buyer-facing-pricing-rule-engine.md) made for
affiliate pricing.

This ADR records the decision, not the specification. Schema columns, phasing, and the migration
plan live in #455 and the implementation phase ledger, and are linked rather than restated.

## Decision

1. **A voucher never mutates a persisted unit price.** It resolves as an order-level discount with
   per-line allocations, written to `pos_transaction_discounts` and
   `pos_transaction_discount_lines`. `Item.default_sale_price` and
   `pos_transaction_lines.sale_price` are never written by a voucher on either channel. `[binding]`

2. **Money inside the voucher domain is integer centavos; rates are basis points.** Every
   `voucher*` column and every function in `modules/vouchers/domain/` uses integer centavos. Every
   `pos_transaction_*` money column stays peso `DECIMAL(14,4)` and is unchanged by this ADR.
   Conversion happens at exactly one boundary per channel — the discount slot — so reconciliation
   between a fiscal row and its campaign-analytics row is a
   `Math.round(peso * 100) === centavos` assertion. `[binding]`

3. **Checkout fails closed; catalog display fails open.** An unresolvable, negative, or
   limit-exhausted voucher blocks checkout with a 422 and a `reason_code`. The same condition at
   catalog display falls back to the plain catalog price and logs a warning. This inherits ADR 0050
   Decision 5's asymmetry verbatim rather than inventing a second rule. `[binding]`

4. **`voucher_redemptions` is authoritative; `vouchers.redeemed_*` are a derived cache.** The
   counters exist to make the atomic reservation a single conditional `UPDATE`; they are never the
   source of truth for reporting, and a periodic reconciler checks them against the ledger. Where a
   voucher record and a `pos_transaction_discounts` row disagree on money, **POS wins** — ADR 0033
   Decision 10 makes it authoritative for receipts, and this ADR does not weaken that. `[binding]`

5. **`fixed_price` is stored as intent and rendered as a derived delta.** The column is
   `fixed_unit_price_centavos`, never a stored discount amount: `Item.default_sale_price` moves with
   Dispatch Order dispatches, so a stored delta would silently turn "sells at ₱8" into "sells at
   ₱11" with no edit and no audit trail. At resolution the benefit becomes
   `Σ qty × max(0, base_unit − fixed_unit)`, clamped at zero when the base has fallen below the
   pinned price. `[default]`

6. **The resolution seam is the order-level discount slot, not the line-price seam.** Affiliate
   pricing owns the line unit price via `prepareCheckoutLines`; a voucher resolves afterwards
   against the resulting subtotal, in the same slot the promo application occupies today. The two
   compose sequentially and never contend for `pos_transaction_lines.price_override_reason`, which
   is a single scalar with one owner. A consequence worth stating: `posDiscountCalculator.js`
   requires no change for any benefit class. `[default]`

7. **A fixed-price voucher is refused under an active affiliate attribution**
   (`VOUCHER_FIXED_PRICE_AFFILIATE_CONFLICT`). Two parties both claiming the right to set the final
   unit price is undefined, and resolving it silently would make the merchant fund the affiliate's
   markup with no audit trail. `[default]`

8. **POS carries one governed discount per transaction, and a voucher occupies that slot.**
   `payload.governed_discount` is a single object with a single `type`, and
   `pos_transaction_discounts` enforces `UNIQUE (transaction_id)`. A voucher applied to a
   transaction already carrying a statutory, employee, or promo discount is rejected with
   `VOUCHER_DISCOUNT_SLOT_OCCUPIED`. **This is deliberately wider than #454 decision 10**, which
   blocks only fixed-price against statutory: the existing single-slot contract blocks every benefit
   class, including percent-off. Recorded as an inherited constraint rather than a new policy;
   multi-discount POS is a separate epic. Revisit: #605. `[default]`

9. **Eligibility conditions are first-class indexable columns, never JSON.** A condition that must
   appear in a `WHERE` clause — redemption count, peso budget, unit quantity, date window,
   time-of-day, weekday, channel — cannot live in a JSON blob and stay indexable, validatable, and
   auditable. `vouchers.conditions` is reserved and **always empty** in v1. A condition-plugin
   registry is built only when a genuinely unanticipated condition arrives; per-customer limits
   (#606) would be a column, not a registry entry, and do not qualify as the trigger. This is the
   direct lesson of #459, where a JSON-blob promo config silently dropped three eligibility fields.
   `[default]`

10. **Eligibility is `NOT NULL` with explicit defaults, encoded as bitmasks.** Channels,
    fulfillment methods, order timings, and weekday are `TINYINT UNSIGNED` masks
    (`channels_mask`, `fulfillment_methods_mask`, `order_timings_mask`, `weekday_mask`) — not
    MySQL `SET`, which #455 originally specified. `DataTypes.SET` does not exist in Sequelize 6.x,
    and `sequelize.sync()` over these models is how new tenants are provisioned, so a `SET` column
    is not expressible where it has to be. The invariant that matters is unchanged and is what this
    clause binds: none of them may be nullable or default-absent, so "eligible everywhere" cannot
    be produced by omission. That is the structural fix for the #459 class, as distinct from
    #459's own repair of the promo schema. `[default]`

11. **Folder scope includes descendants, resolved at redemption and snapshotted.** `ItemFolder` is a
    tree and folders move, so the resolved item-id set is written into `voucher_redemption_lines`
    with both `base_unit_price_centavos` and `voucher_unit_price_centavos`. A later folder
    reshuffle cannot retroactively change what a completed redemption meant. `[default]`

## Consequences

1. **VAT moves with the voucher discount**, exactly as it does for a promo today — `vatableSales`
   derives from the discounted `line_subtotal`. Correct per BIR, and unchanged in mechanism from
   ADR 0033; noted so it is not rediscovered as a surprise.
2. **`voucher_redemption_lines` partially duplicates `pos_transaction_discount_lines`.** Both are
   written. The POS pair is the fiscal record (ADR 0033 Decision 10); the voucher pair is the
   campaign-analytics record, and it carries the base-price snapshot the POS pair does not.
3. **Storefront has no refund reversal path.** `buildCancelStoreOrderUseCase` keys on
   `fulfillment_status` and never sets `status: 'voided'`; there is no storefront refund flow at
   all. A refunded-but-not-cancelled storefront order will not reverse its redemption and
   permanently burns a slot. A real gap this ADR does not close.
4. **Migrated promos lose channel eligibility.** Per #459 those three fields were never actually
   persisted, so they cannot be carried forward faithfully; every migrated voucher gets
   `channels = 'storefront'` only. Guessing the merchant's intent would be worse than narrowing it.
5. **Per-recipient code issuance is not built.** v1 is shared codes (#454 decision 4). The schema is
   hedged — `voucher_kind` exists and `code` is its own column — so a `voucher_codes` child table
   can be added later without migrating the campaign table.

## Validation

1. Idempotent replay of a checkout key inserts no second ledger row and does not move the counters.
2. Each of `max_redemptions`, `max_total_discount_centavos`, and `max_benefit_quantity` rejects at
   its boundary with a 422 rather than capping at the remainder.
3. A voided POS transaction and a cancelled storefront order each write an `entry_type: 'reversal'`
   row inside the same transaction as the lifecycle change.
4. `npm run check:tenant-schema-coverage` passes with the four new tables registered.
5. A fixed-price voucher whose base price has dropped below the pinned price yields a zero discount,
   never a negative one.

## Amendments

### 2026-08-18 — Below-cost enforcement, correcting an unimplemented inheritance claim

- Clause added: a new Decision, below, recording the below-cost floor. `[default]` tier — no
  existing binding invariant changes.
- Change: `vouchers.allow_below_cost` (column present since #455/Phase 101, along with a merchant
  UI toggle) was write-only — validated, persisted, and displayed, but read by no decision path.
  This amendment makes it real:
  1. **The below-cost comparison is benefit-class-agnostic.** It compares each eligible, discounted
     line's resolved `voucherUnitPriceCentavos` (the same value `lineAllocations` already exposes)
     against that line's `cost_per_unit` — not the raw `fixed_unit_price_centavos` alone. A deep
     `percent_off` or `amount_off` voucher can undercut cost exactly as easily as a mispriced
     `fixed_price` line; a check scoped to `fixed_price` would miss those.
  2. **A line with no recorded cost (`Item.cost_per_unit IS NULL`) is skipped, never treated as a
     violation** — matching the affiliate guard's own null-cost skip
     (`affiliatePricingPolicy.js`/`storeUseCases.js`).
  3. **Redemption fails closed; catalog display fails open per item** — the same asymmetry
     Decision 3 already establishes, applied to this new condition rather than a new rule.
  4. **Cost is `Item.cost_per_unit` alone, not `item_cost_breakdown`'s labor/overhead/packaging
     components.** Matches the affiliate floor's own definition of cost; using a different
     definition for the two guards would make them disagree on the same item.
  5. **No config-time (save-time) validation.** `allow_below_cost` lives on the voucher, and a
     pricelist (if attached) is authored before it is attached to a voucher — so there is nothing
     concrete to validate a pinned price against at config time in the general case. Enforced at
     resolution only; the authoring UI may warn.
- Reason: the flag was live and toggleable in the merchant UI with zero backing enforcement — a
  merchant could already set a price below cost and nothing stopped them. Filed as #697,
  independent of any specific benefit-class feature, because the gap predates and is orthogonal to
  the per-item pricelist work in the same phase.
- **Correction, not just an addition:** the References section below (item 3, until this
  amendment) stated this ADR "inherits ADR 0050 Decision 6's resolution-time cost guard" as an
  already-settled fact. No decision in this ADR ever implemented one. That line is corrected below
  to point at this amendment instead of asserting an inheritance that was never built.
- PR: #697 follow-up to Phase 101-109 (#455 lineage).

### 2026-08-18 — Per-item pricelist for `fixed_price` (#696)

- Clause amended: **Decision 5** (`[default]` tier). Previously read as a single scalar
  (`fixed_unit_price_centavos`) with no alternative. Amended to add a second, mutually-exclusive
  way to express a fixed price: a `pricelists`/`pricelist_items` pair carrying N prices for N
  items, referenced from `vouchers.pricelist_id`.
- Change: `#584`'s own wording — *"per-item, not per-order"* — always meant *scoped to items* with
  one shared price, never a price *per item*. The one-price-per-voucher shape was an unstated
  assumption baked into a column's location (`vouchers`, not a child table), not a decision this
  ADR ever bound. This amendment gives it a second column to point at, still under Decision 5's
  original framing (intent, not a stored delta) and still resolved the same way at redemption time
  — `Σ qty × max(0, base_unit − price(item))`, with `price(item)` now either the scalar or a
  per-item lookup.
  1. **A `fixed_price` voucher carries EITHER `fixed_unit_price_centavos` OR `pricelist_id`, never
     both.** Enforced in `voucherUseCases.js`'s `applyBenefitConfig`, the same choke point already
     re-run on create, update, and activation for the base benefit-column validation.
  2. **When a pricelist is attached, it IS the scope — `voucher_scopes` is not consulted.**
     Avoids two sources of truth for "which items does this voucher cover." A voucher may attach
     only an `active` pricelist (checked at attach time, mirroring how `assertScopeRefsExist`
     validates scope references at attach time and not continuously).
  3. **No ledger change.** `voucher_redemption_lines` already snapshots both
     `base_unit_price_centavos` and `voucher_unit_price_centavos` per line — precisely because
     `Item.default_sale_price` moves, the same reasoning Decision 5 already gives for the scalar
     case. A per-item price needs no new column to stay auditable after the fact.
  4. **`Decision 1` `[binding]` is untouched.** Neither the scalar nor a pricelist row is ever
     written back to `Item.default_sale_price` or `pos_transaction_lines.sale_price` — a pricelist
     is exactly as inert with respect to Catalog's own price as the scalar always was.
  5. **`Decision 7`'s affiliate refusal is inherited unchanged.** A pricelist-backed voucher is
     refused under active affiliate attribution the same way a scalar-priced one already is —
     nothing about having N prices instead of one changes which party's price wins.
- Reason: vouchers are deliberately standing in for a wholesale/B2B-shaped need through a B2C
  mechanism (#454 decision 2) — a business buys stock from a retailer at negotiated per-item prices
  by presenting a voucher code. A single shared price across an entire scope cannot express a real
  wholesale pricelist; #696 is the gap this amendment closes. This is **not** a reversal of #569's
  B2B deferral — no B2B account, pricing tier, or customer-group concept is introduced here, only a
  second way to express what a `fixed_price` voucher's existing scalar already could, one item at a
  time instead of once.
- PR: #696 follow-up to Phase 101-109 (#455 lineage), stacked on #697.

### 2026-08-19 — QRPh payment-then-redemption race: accepted, made reconcilable (#668)

- Clause amended: **Consequences item 3** (untagged -- Consequences record effects, not Decisions,
  so no strictness tier applies). Previously stated storefront "has no refund reversal path" for a
  cancelled order in general. Extended below to name a second, related gap and how it was closed.
- Change: a QRPh voucher preview (session creation -- `resolveCheckoutContext`'s own comment on the
  `options?.transaction` gate: no transaction open yet means preview-only, no reservation) can be
  outrun by a concurrent order that exhausts the same voucher's redemption limit before the
  webhook-confirmed finalization runs the real `reserveRedemption`. Finalization then fails *after*
  the customer's payment has already succeeded.
- **Accepted as-is**, matching this flow's existing, already-accepted stock/location-availability
  race -- not a new bug class. Reserving at session-creation instead would hold a redemption slot
  hostage for a session the customer never pays, and this flow has no session-expiry release
  mechanism to hedge that (`reverseVoucherRedemptionUseCase` exists, from #455's ledger design, but
  has no live caller anywhere yet).
- What changed: `finalizePaidCommerceSession.js` previously tagged every finalization failure with
  the same generic `ORDER_FINALIZATION_FAILED` code. A failure whose `reason_code` is one of the
  voucher exhaustion/conflict codes (`VOUCHER_REDEMPTION_LIMIT_REACHED`, `VOUCHER_BUDGET_EXHAUSTED`,
  `VOUCHER_QUANTITY_LIMIT_REACHED`, `VOUCHER_VERSION_CONFLICT`) is now tagged
  `VOUCHER_REDEMPTION_UNAVAILABLE` instead, so the `paid_manual_resolution_required` queue
  (`commercePaymentAdminUseCases.js`'s existing retry/refund use cases) surfaces which lever
  actually applies -- retrying only helps once the voucher's limit frees up; a refund is the other
  option -- instead of requiring an operator to read a raw error message to tell this apart from
  every other finalization failure.
- Reason: the race itself was already accepted precedent (the stock/location case). What #668
  actually flagged as missing was "no described reconciliation path." The generic
  `paid_manual_resolution_required` status plus the existing retry/refund admin use cases already
  provide the mechanism -- the gap closed here was visibility, not a missing capability.
- PR: #668 follow-up to Phase 105 (#455/#661 lineage).

### 2026-08-19 — Storefront enforces Decision 8; storefront voucher redemptions gain the Decision 10 audit row (#667)

- Clauses fulfilled, not changed: **Decision 8** (`[default]`) and **Decision 10** (inherited from
  ADR 0033, `[default]` tier there). Both already stated the rule; neither was actually wired up on
  the storefront checkout path until this PR. This entry records that the gap is closed, not a
  change to what either clause says.
- Decision 8 gap: `resolveCheckoutContext` let `voucher_code` and `promo_code` both apply to the
  same storefront order, summed uncapped into `totalAmount`, with no mutual-exclusivity check --
  despite `pos_transaction_discounts` already enforcing `UNIQUE (transaction_id)` and Decision 8
  already stating "a voucher occupies that slot" fleet-wide, not POS-only. Fixed by rejecting a
  voucher code submitted alongside an already-applied promo code with `VOUCHER_DISCOUNT_SLOT_OCCUPIED`
  (422), checked before either the promo or voucher benefit resolves against the ledger, so an
  ineligible attempt never burns a redemption. Not a stacking cap -- mutual exclusivity, the same
  shape Decision 8 already describes.
- Decision 10 gap: because the two could stack, a storefront voucher-only order deducted the
  voucher's discount from `totalAmount` but persisted no `pos_transaction_discounts` audit row and
  no per-line allocations -- `discount_amount`/`discount_label_snapshot`/`discount_rate_snapshot`
  on the order header reflected the promo only, or nothing at all on a voucher-only order. Fixed:
  with Decision 8 now enforced, at most one governed discount exists per order, so a voucher
  redemption writes the same audit row a promo redemption always has (`discount_type: 'voucher'`,
  `discount_method` derived from the voucher's `benefit_class`), and the header fields reflect
  whichever source actually applied.
- Explicitly not a stacking-cap feature and not #695's migration arriving early: this is the
  existing single-slot rule reaching a code path it had never been wired into. It composes with
  #695 unchanged -- "one governed discount slot" reads identically before and after a promo code
  becomes a `voucher_kind`.
- Voucher codes are capped at 40 characters (previously up to 64, matching `vouchers.code
  VARCHAR(64)`), to fit `pos_transaction_discounts.promo_code VARCHAR(40)` -- the fiscal column a
  voucher redemption now shares with the promo path -- without widening a fiscal table. No
  production voucher code exists yet to be narrowed out from under a merchant (storefront voucher
  redemption is not on `main` as of this amendment).
- PR: #667 (originally proposed, with a since-corrected rationale, as PR #705).

### 2026-08-20 — POS voucher redemption ships; narrows #454 decision 6 to capture a customer name (#712)

- Clause narrowed: **#454 decision 6** (*"POS: redemption is transaction-only, no buyer identity
  captured -- the cashier just enters or scans the code"*), a closed decision record, not itself an
  ADR clause, but the governing statement this ADR's Decision 8/Consequences item 2 depend on. Not
  reversed -- narrowed. This ADR carries no clause of its own asserting POS captures no identity, so
  nothing here needed a `[binding]`/`[default]` supersession; the narrowing is recorded here because
  this is where POS voucher redemption's behavior is otherwise documented.
- Change: POS voucher redemption now requires a customer name, matching the pre-existing POS
  promo-code requirement (`posDiscountPolicy.js`'s `DISCOUNT_CUSTOMER_NAME_REQUIRED` guard, which
  already excluded only `employee` and the statutory types -- a `voucher` type falls under it with
  no code change to that guard itself). Settled by Pat, 2026-08-20, during the same session that
  scoped #712.
- What this does NOT change: the name is a free-typed string landing on the existing
  `pos_transaction_discounts.customer_name` column (nullable, no migration). No
  `store_customer_id`/`dgfy_account_id` is linked to a POS voucher redemption. #586's two-tier
  tracking model therefore survives unchanged -- per-campaign tracking (redemption count, peso
  cost, channel mix) already worked on both channels; per-customer tracking (who redeemed, repeat
  usage) still only works on storefront, exactly as #454 decision 6 originally scoped it. This is a
  friction/identity-capture narrowing at the point of sale, not a reversal of what tracking
  capability POS contributes.
- Gate, for completeness (not itself a narrowing -- restates what #712 implements): a voucher is
  redeemable at POS when `voucher_pos_redemption_enabled` (#604, tenant-wide, default off) is on
  **and** the specific voucher's `channels_mask` includes the POS bit (`VOUCHER_CHANNEL_BITS.pos`,
  already evaluated by `voucherEligibilityPolicy.js`). No `voucher_kind`-based restriction was added
  -- `channels_mask` already answers "usable at POS," so a second gating mechanism was rejected as
  redundant.
- Approval: a voucher discount requires a manager PIN at POS, parity with every other governed
  discount type per ADR 0033 Decision 7 -- no exception carved out. Flagged, not silently accepted:
  a follow-up issue questions whether this parity is right for a voucher specifically, since the
  discount amount is merchant-set and server-enforced rather than cashier-chosen the way a Manual
  discount is; that issue does not change today's behavior.
- Also fixed in the same PR, not a clause change: `redeemVoucherUseCase`'s ledger idempotency key
  was hardcoded to a `storefront:` prefix regardless of the caller's actual `channel` -- a POS
  redemption would have shared the storefront idempotency namespace. Now derived from `channel`.
- Also: POS never runs a voucher's discount through `calculatePosDiscount` (the generic percentage/
  fixed-amount redistributor already used for promo/senior/pwd/employee/manual). A voucher's
  per-line discounts are already authoritative, computed once by `calculateVoucherBenefit` --
  re-deriving them via proportional redistribution would silently diverge from that computation,
  most visibly for `fixed_price` (Decision 5's per-line delta, not a proportional split of one
  total). `posVoucherDiscountCalculator.js`'s `buildVoucherGovernedCalculation` builds the same
  return shape directly from `lineAllocations` instead.
- PR: #712 (child of epic #453).

## Decision (continued)

12. **A voucher redemption fails closed when it would sell an eligible, discounted line below that
    line's `cost_per_unit`, unless `vouchers.allow_below_cost` is `true`.** Catalog display fails
    open on the same condition — the affected item shows its plain catalog price instead of a
    voucher price, per item, matching Decision 3's asymmetry. Lines with no recorded cost are
    exempt from the check. `[default]`

## References
1. [ADR 0029](0029-catalog-inventory-pos-storefront-ownership-boundaries.md) — Decision 2
   `binding` tier, Catalog owns base sale price; this ADR layers above it and never writes back
2. [ADR 0033](0033-commercial-promo-and-statutory-pos-discount-boundaries.md) — Decisions 8 and 10,
   and the JSON-storage premise this work retires; amended alongside this ADR
3. [ADR 0050](0050-affiliate-buyer-facing-pricing-rule-engine.md) — Decision 5's fail-closed/
   fail-open asymmetry, inherited here as Decision 3. Decision 6's resolution-time cost guard is
   the model this ADR's own Decision 12 (2026-08-18 amendment, above) follows — not something this
   ADR inherited automatically, corrected from the prior wording of this line
4. [ADR 0039](0039-adr-lifecycle-strictness-tiers-and-amendment-path.md) — strictness tiers
5. Issue #454 — voucher decision record; #455 — entity and ledger; #453 — epic; #697 — this
   amendment's below-cost enforcement gap; #696 — the per-item pricelist amendment above; #584 —
   the `fixed_price` benefit class this extends; #569 — B2B deferral, not reversed by #696
   (#454 decision 2 is the carve-out); #661 — the storefront voucher redemption PR both #667 and
   #668 are follow-ups to; #668 — the QRPh payment-then-redemption race amendment above
