---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-08-17
last_reviewed: 2026-08-17
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

## References
1. [ADR 0029](0029-catalog-inventory-pos-storefront-ownership-boundaries.md) — Decision 2
   `binding` tier, Catalog owns base sale price; this ADR layers above it and never writes back
2. [ADR 0033](0033-commercial-promo-and-statutory-pos-discount-boundaries.md) — Decisions 8 and 10,
   and the JSON-storage premise this work retires; amended alongside this ADR
3. [ADR 0050](0050-affiliate-buyer-facing-pricing-rule-engine.md) — Decision 5's fail-closed/
   fail-open asymmetry and Decision 6's resolution-time cost guard, both inherited here
4. [ADR 0039](0039-adr-lifecycle-strictness-tiers-and-amendment-path.md) — strictness tiers
5. Issue #454 — voucher decision record; #455 — entity and ledger; #453 — epic
