---
status: proposal
authority_level: reference
owner: engineering
last_reviewed: 2026-07-29
applies_to: affiliates_program, storefront, commerce_payments, backend, pos_frontend
topic: affiliate_pricing_rule_engine_scope
---

# Affiliate Pricing Rule Engine — Scope

**Status: not implemented.** This is the scoping pass that turns the recorded product
discussion (delivered as an external `affiliate-pricing-spec/` pack) into a phased plan against
*this* codebase. No migrations, models, routes, or UI described here exist yet.

The external spec pack was written repo-agnostically — it assumes a greenfield affiliate system.
This document reconciles it with the affiliate program already shipped under
[ADR 0036](../architecture/adr/0036-affiliates-program-commission-and-cashout.md), identifies
what is genuinely new, and splits the work into a low-risk Phase 1 and a Phase 2.

Next step after review: a dedicated ADR (this is a cross-boundary, money-touching change per
`docs/architecture/ARCHITECTURE_GOVERNANCE.md`) plus an impact declaration, then Phase 1
implementation.

---

## 1. The one-line summary

Today an affiliate **never changes what the buyer pays** — commission is computed after the fact
from the order subtotal. The recorded spec makes the affiliate's identity an *input to the
buyer-facing price*. That single change is the bulk of the work and the entire risk surface;
everything else (volume tiers, reseller margin, settlement policy) is additive bookkeeping on the
existing ledger.

---

## 2. Decisions locked in this round

| Ref | Decision | Resolution |
|---|---|---|
| B1 | Which sales surfaces | **Storefront cart → checkout only.** Buyer scans affiliate QR / opens `?p=` link, browses, checks out. In-store POS QR scanning is deferred (§8). |
| B2 | Rule scope | Per-product rules acceptable, using tenant-DB item IDs held **by value** in landlord tables (no cross-DB FK), matching the existing `order_reference` pattern. Phase 2 activates them; Phase 1 ships the schema shape. |
| B3 | Attribution lifetime | **Session-scoped.** Behavior change — see §7.5. |
| B4 | Who configures | **Tenant/business owner**, in the existing POS back-office panel. Owner may set a **tenant-wide template** applied to all affiliates, or **override per affiliate**. |
| B5 | Numeric representation | Follow ADR 0036: integer centavos for money, basis points for rates. The external spec's `DECIMAL` examples get translated, not adopted. |
| B6 | Fixed amounts | **Fixed selling-price rules: yes** — explicitly recorded ("base price + ₱10", "base price − ₱1,000"). **Fixed *commission*: no** — not demonstrated in the recording, and redundant while commission is percentage-of-base. Dropped from scope. |
| C7 | Process | Plan first. Basic implementation short-run, advanced long-run. |
| C8 | Build/verify | Migrations and suites run on the owner's machine; this repo has no live MySQL. |
| C9 | Source recording | Not available. The analysis doc is the authority. |

### 2.1 Assumed defaults still needing explicit sign-off

These were recommended but not explicitly confirmed. Phase 1 proceeds on them unless corrected;
**A3 is the one that changes already-shipped behavior and should be confirmed before coding.**

| Ref | Question | Assumed answer |
|---|---|---|
| A1 | What is `base_price`? | The tenant's existing catalog sale price. No new price column is introduced. |
| A2 | Who funds an affiliate buyer discount? | Merchant-funded by default; the settlement-policy enum makes it explicit per program. |
| **A3** | **Commission basis when a discount is active** | **Commission accrues on the base-price subtotal, not the discounted buyer subtotal.** ADR 0036 rule 3 currently defines the base as `subtotal − discount`. This changes it. Concretely: ₱100 base, 10% affiliate discount, 5% commission → buyer pays ₱90, affiliate earns ₱5, merchant nets ₱85. |
| A4 | Volume basis (Phase 2) | Sum of `commissionable_base_centavos` across `earned` + `paid` rows. |
| A5 | Volume period (Phase 2) | Calendar month, tenant timezone. |
| A6 | Tier retroactivity (Phase 2) | Prospective from the sale that crosses the threshold. Highest tier wins; not cumulative. |

---

## 3. What already exists

Shipped under ADR 0036, in the **landlord** database:

- `dgfy_affiliate_enrollments` — one row per `(dgfy_account_id, tenant_id)`; hashed `share_code`,
  typable `AF-XXXXXX` short code, nullable `commission_rate_bps` override
- `dgfy_affiliate_attributions` — audit trail; `channel` enum already includes `qr` (reserved, unused)
- `dgfy_affiliate_commissions` — the ledger. `pending → earned → paid`, plus `reversed`.
  Idempotent on `(tenant_id, order_reference)`. `reason` is a free `STRING(120)`
- `dgfy_affiliate_payout_methods`, `dgfy_affiliate_cashouts` — manual, full-balance cashout flow
- `tenant_affiliate_settings` — `program_enabled`, `default_rate_bps` (500), `min_cashout_centavos`,
  `auto_approve_enrollment`, `attribution_window_days` (60)

Live wiring:

- `frontend/apps/store/src/StorefrontApp.jsx:344` calls `useAffiliateAttributionCapture` — the
  capture endpoint is **no longer dormant** as ADR 0036 described it
- `backend/src/modules/store/controllers/storeHandlers.js:346` bridges the `sku_aff_attr` cookie
  into the checkout payload
- `frontend/src/features/pos/components/AffiliatesWorkspacePanel.jsx` — owner-facing config

### 3.1 Gaps in what exists

- `attribution_window_days` is **stored and editable but never enforced** anywhere in accrual.
  It is currently cosmetic config.
- The `qr` attribution channel is defined in the enum but never written.
- The cookie's real lifetime is 30 days (`AFFILIATE_ATTRIBUTION_MAX_AGE_MS`,
  `backend/src/utils/browserSessionCookies.js:17`), which contradicts both the `attribution_window_days`
  setting and the session-scoped decision (B3).

---

## 4. What the spec adds

Three independent rule layers. Mapping to this codebase:

| Spec layer | Status here | Phase |
|---|---|---|
| **Selling Price Rule** (6 modes) | Entirely new. Changes buyer-facing price. | 1 (program-level) → 2 (per-product) |
| **Commission Rule** | Partially exists — flat `rate_bps` covers `PERCENTAGE_OF_BASE`. `NONE` and `RESELLER_MARGIN` are new. | 1 |
| **Volume Tier Rule** | Entirely new. | 2 |
| **Settlement policy** | Entirely new; currently an unstated assumption. | 1 |

Selling-price modes, all six retained: `BASE_PRICE`, `PERCENTAGE_MARKUP`, `FIXED_MARKUP`,
`PERCENTAGE_DISCOUNT`, `FIXED_DISCOUNT`, `EXACT_AFFILIATE_PRICE`.

Commission modes reduced to three (per B6): `NONE`, `PERCENTAGE_OF_BASE`, `RESELLER_MARGIN`.

---

## 5. Rule resolution order

The owner picks a template or customises per affiliate (B4). Resolution, most specific first:

1. Per-product rule for this enrollment — *Phase 2*
2. Per-product tenant template — *Phase 2*
3. Per-enrollment rule (this affiliate, all products)
4. Tenant template rule (all affiliates, all products)
5. No rule → buyer pays the catalog price, commission falls back to today's flat-rate behavior

**MySQL gotcha:** MySQL treats `NULL` as distinct in unique indexes, so `enrollment_id IS NULL`
cannot express "the template row" under a unique constraint. Use sentinel `0` for both
`enrollment_id` and `item_id` to mean "applies to all", keeping
`UNIQUE (tenant_id, enrollment_id, item_id)` enforceable. This must be explicit in the migration
and the repository layer.

---

## 6. Where the price is actually resolved

There are exactly four sale-price resolution sites in the backend. This is what makes the
storefront-only boundary (B1) provable rather than aspirational:

| Site | Surface | Phase 1 |
|---|---|---|
| `backend/src/modules/inventory/usecases/storefrontCatalogUseCases.js:152` | Storefront catalog display | **In scope** |
| `backend/src/modules/store/usecases/storeUseCases.js:765` | Storefront checkout | **In scope** |
| `backend/src/modules/pos/usecases/posUseCases.js:2548` | In-store POS checkout | Deferred (§8) |
| `backend/src/services/dispatchOrderService.js:47` | Dispatch orders | Out of scope |

All four call `requireExplicitSalePrice(item, context)` from
`backend/src/modules/shared/utils/itemFinancialPolicy.js`. The affiliate rule engine wraps that
call at the two in-scope sites only.

**Both in-scope sites must be changed together.** If the catalog is not affiliate-aware but
checkout is, the buyer sees ₱100 in the product list and ₱90 (or ₱120) at checkout. Today the
`sku_aff_attr` cookie is read *only* in the checkout controller — Phase 1 must extend that read to
the catalog endpoint.

`storeUseCases.js` already carries `sale_price_overridden` and `price_override_reason` on each
prepared line. Affiliate pricing has a natural home there
(`sale_price_overridden: true, price_override_reason: 'affiliate_program'`) with no new line columns.

---

## 7. Problems this creates that the external spec does not mention

These surfaced from reading the actual checkout path and are the substance of the review.

### 7.1 VAT moves with the affiliate price

`storeUseCases.js:796-806` derives `vatableSales` from `line_subtotal`
(`vatableGross / (1 + VAT_RATE)`). Any affiliate price change moves the VAT base. An affiliate
discount reduces the tenant's output VAT; a reseller markup increases it.

This is *probably correct* — BIR requires the receipt to reflect the price actually paid — but it
is a tax-visible consequence of a pricing feature and must be stated in the ADR, not discovered
later.

### 7.2 The DGFY convenience fee moves too (ADR 0012)

`storeUseCases.js:1197` computes `computeDgfyConvenienceFee(prepared.subtotalAmount)`. With
affiliate pricing, a ₱120 reseller markup makes DGFY collect 1% of ₱120 instead of ₱100.

**Recommendation:** the fee follows the affiliate-adjusted subtotal — consistent with ADR 0012's
"computed on gross subtotal", and it is what the buyer actually pays. Needs an explicit call
because it changes platform revenue.

### 7.3 Commission needs a second subtotal

Decision A3 requires commission on the *base-price* subtotal while the buyer pays the
*affiliate-adjusted* subtotal. `prepareCheckoutLines` currently returns one `subtotalAmount`.
Phase 1 adds a parallel `baseSubtotalAmount` (catalog price × quantity, pre-affiliate-rule) and
threads it to the accrual path. Additive, no behavior change when no affiliate is attributed.

### 7.4 Affiliate discount stacking with promo codes

`promoApplication.discountAmount` already exists. An affiliate discount plus a promo code is a
double discount the merchant funds twice. The external spec lists coupon stacking as out of scope
but does not say what to *do* about it.

**Recommendation for Phase 1:** allow both, but compute commission on the base-price subtotal
(A3) so affiliate earnings are unaffected by promos. Flag the merchant-margin exposure to the
owner in the config UI. A hard block is a product decision, not an engineering one.

### 7.5 Session-scoped attribution is a live behavior change

B3 moves the `sku_aff_attr` cookie from a 30-day cookie to a session cookie. Attributions that
would have converted on a later visit will no longer convert. `attribution_window_days` should be
removed from the owner panel in the same change rather than left as misleading dead config.

### 7.6 Reseller margin has to settle through PayMongo

Under `RESELLER_MARGIN`, the buyer pays ₱120, the merchant is owed ₱100, the affiliate is owed ₱20 —
but storefront online payments are split-settled per ADR 0027. The ₱20 lands in the existing
settlement path and must reach the affiliate through the manual cashout flow.

Mechanically this works: book the margin as a commission row with `reason: 'reseller_margin'`
(`reason` is a free `STRING(120)`, so no enum migration). The ADR must state that reseller margin
is *not* a new money movement, just a differently-derived ledger amount.

---

## 8. Deferred: in-store POS affiliate QR

Per B1, the affiliate presenting a QR **at the POS terminal** — cashier scans, terminal resolves
the affiliate, in-store cart reprices — is deferred and needs its own spec. Open questions it
raises, recorded here so they are not rediscovered:

- Which device scans: the customer's phone against a terminal-displayed code, or the terminal's
  scanner against the affiliate's phone?
- The POS barcode scanner path already owns the scan input — an affiliate QR must not collide with
  a product barcode (see `frontend/src/utils/barcodePolicy.js`).
- In-store checkout captures no buyer identity, so the ADR 0036 self-referral guard stays a no-op.
- In-store commissions are born `earned` immediately with no pending stage — affiliate pricing plus
  immediate accrual means a void has to reverse both the price and the commission.
- Offline/queued terminal sales cannot resolve an affiliate rule at scan time.

Phase 1 leaves `posUseCases.js:2548` untouched, so in-store pricing is provably unchanged.

---

## 9. Phasing

### Phase 1 — basic

Goal: a buyer arriving through an affiliate link sees and pays that affiliate's price on the
storefront, and the affiliate earns commission on the base price.

**Schema (all additive):**
- New `dgfy_affiliate_price_rules` — `tenant_id`, `enrollment_id` (0 = template),
  `item_id` (0 = all products, populated in Phase 2), `rule_type`, `rate_bps`, `amount_centavos`,
  `active`, `active_from`/`active_until` (written `NULL` in Phase 1), timestamps.
  `UNIQUE (tenant_id, enrollment_id, item_id)`
- `tenant_affiliate_settings` += `commission_type`, `settlement_policy`
- `dgfy_affiliate_enrollments` += `commission_type` (nullable override)
- `dgfy_affiliate_commissions` += `base_subtotal_centavos`, `buyer_subtotal_centavos`,
  `reseller_margin_centavos`, `price_rule_type_snapshot`, `settlement_policy_snapshot`

**Backend:**
- Pure calculation service — inputs in, breakdown out, no I/O. This is the unit-test surface and
  carries every acceptance case from the external pack's `04-acceptance-tests.md`
- Rule resolution + validation (negative buyer price, discount > 100%, duplicate scope rows)
- Affiliate-aware price at the two in-scope resolution sites (§6)
- `baseSubtotalAmount` threaded through `prepareCheckoutLines` (§7.3)
- Accrual updated for `NONE` / `PERCENTAGE_OF_BASE` / `RESELLER_MARGIN` and the A3 base change
- Cookie read extended to the catalog endpoint; cookie switched to session-scoped

**Frontend:**
- Owner config in `AffiliatesWorkspacePanel.jsx` — mobile-first, structured controls, no formula
  typing: rule-type selector, single numeric input, live preview, template-vs-per-affiliate toggle
- Storefront shows the affiliate price with a visible "affiliate price" indication so the buyer is
  not silently quoted a different number than the public catalog

**Not in Phase 1:** volume tiers, per-product overrides, effective-date windows, POS in-store.

### Phase 2 — advanced

- Per-product rule overrides (schema already shaped; activates `item_id`)
- `dgfy_affiliate_volume_tiers` + tier resolution (A4/A5/A6), additive bps on top of base rate
- `dgfy_affiliate_commission_rules` table, when per-product commission is actually needed
- Rule effective-date windows and overlap rejection
- In-store POS affiliate QR (§8), after its own spec

---

## 10. Governance obligations

Per `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, this is cross-boundary and money-touching:

1. A new ADR, extending ADR 0036 — must explicitly amend rule 3 (commission base) and address the
   ADR 0012 convenience-fee interaction (§7.2) and the ADR 0027 settlement interaction (§7.6)
2. An impact declaration under `docs/compliance/impact-declarations/`
3. Controllers stay transport-only; logic in use cases; persistence in repositories
4. Migrations additive only
5. Accrual stays post-commit and non-blocking — a bookkeeping failure must never fail a sale.
   **Pricing, unlike accrual, is pre-commit and blocking**: an unresolvable affiliate rule must
   fail the checkout rather than silently charge the wrong price. This is a deliberate departure
   from ADR 0036's best-effort convention and needs to be stated as such.

---

## 11. Verification plan

No `node_modules` and no live MySQL in the working container (C8), so the split is:

**Verifiable here:** the pure calculation service and its unit tests (every acceptance case),
rule-resolution and validation tests, and the existing backend suite once dependencies install.

**Requires the owner's machine:** the migration against live MySQL, storefront catalog/checkout
integration against a real tenant DB, and the mobile config UI.

ADR 0036 records that its own migration was never run against a live database. That debt is
inherited here and should be cleared in the same session that runs Phase 1's migration.
