---
status: proposal
authority_level: reference
owner: engineering
date: 2026-07-29
last_reviewed: 2026-07-29
applies_to: affiliates_program, storefront, commerce_payments, backend, pos_frontend
topic: affiliate_pricing_rule_engine_scope
---

# Affiliate Pricing Rule Engine — Scope

**Status: planning only. Nothing here is implemented.** No migrations, models, routes, or UI
described in this document exist yet. This is the scoping pass that turns the recorded product
discussion (delivered as an external `affiliate-pricing-spec/` pack) into a phased plan against
*this* codebase, so that implementation can start from a settled contract.

The external spec pack was written repo-agnostically — it assumes a greenfield affiliate system.
This document reconciles it with the affiliate program already shipped under
[ADR 0036](../architecture/adr/0036-affiliates-program-commission-and-cashout.md), identifies what
is genuinely new, records every decision taken, and splits the work into a low-risk Phase 1 and a
Phase 2.

---

## For stakeholders — the plain-language version

*This section is deliberately non-technical. Sections 1 onward are for engineers.*

### What we're building

Right now, when someone buys through an affiliate, the buyer pays the normal store price and the
affiliate quietly earns a commission afterwards. The affiliate has no effect on the price tag.

The new work lets the **business owner decide what an affiliate's customers actually pay**. An
affiliate can be set up to sell at a markup, at a discount, or at an exact price the owner sets —
and separately, to earn a commission on top.

### What changes for each person

**The business owner** gets a simple mobile screen where they choose one option from a list — "add
10%", "take off ₱50", "sell at exactly ₱120" — type one number, and immediately see what the
customer will pay. No formulas, no spreadsheets. They can set one arrangement that applies to all
their affiliates, or give specific affiliates their own deal.

**The affiliate** shares their link or QR code as they do today. The difference is that people who
arrive through it now see that affiliate's price.

**The buyer** sees the affiliate's price while browsing and pays that same price at checkout. They
will see a clear label explaining they're on an affiliate price, so nobody is surprised by a
number that differs from the public store page.

### The money question, in plain terms

The recording left one thing genuinely unresolved, and it's the most important decision here.

Say a product normally sells for ₱100. The owner gives an affiliate a 10% customer discount *and*
a 5% commission. The customer pays ₱90. The affiliate earns ₱5. **Who absorbs the ₱15?**

**The decision taken: the business owner absorbs it — they receive ₱85.** The affiliate's ₱5 is
calculated on the original ₱100, not the discounted ₱90, so the affiliate is paid the same whether
or not a discount is running.

This is worth understanding clearly, because it means an owner who sets a generous affiliate
discount *and* a generous commission can reduce their own take by more than they expect. The
configuration screen will show them the full picture — customer price, affiliate earnings, and
what the owner nets — before they save.

### Two side effects worth knowing about

1. **VAT follows the price actually paid.** If the customer pays ₱90 instead of ₱100, the VAT on
   the receipt is calculated on ₱90. This is what BIR requires, and it is correct — but it does
   mean affiliate discounts slightly reduce the VAT the business reports.
2. **The DGFY 1% platform fee follows the price actually paid too.** If an affiliate marks a
   product up to ₱120, DGFY's fee is 1% of ₱120 rather than 1% of ₱100.

### A safety rule we're adding

Nothing today stops an owner from accidentally setting a discount so large the product sells below
what it cost them. We're adding a check that refuses to save such a rule and explains why. It is
much cheaper to add now than after someone loses money on it.

### What comes first, and what waits

**First (Phase 1)** — the online store only. A customer opens an affiliate's link, browses, sees
that affiliate's prices, and checks out. One pricing arrangement per affiliate, covering all their
products.

**Later (Phase 2)** — different prices for different products, and volume rewards (for example,
an affiliate's commission rising from 5% to 6% once they've sold ₱50,000 in a month).

**Deliberately deferred** — affiliate QR codes scanned at the physical store counter. It sounds
like a small addition but it interacts with the barcode scanner, offline terminals, and refunds in
ways that need their own round of design. Phase 1 leaves in-store checkout completely untouched,
which also means it carries no risk of breaking it.

### What we need before building starts

The decisions in this document are settled. What remains is a working database to run the schema
changes against, which happens on the owner's machine — this planning environment has none.

---

## 1. The one-line technical summary

Today an affiliate **never changes what the buyer pays** — commission is computed after the fact
from the order subtotal. The recorded spec makes the affiliate's identity an *input to the
buyer-facing price*. That single change is the bulk of the work and the entire risk surface;
everything else (volume tiers, reseller margin, settlement policy) is additive bookkeeping on the
existing ledger.

---

## 2. Decision log

All decisions below are **settled** as of 2026-07-29. Two of them change already-shipped behavior
and are marked ⚠.

### 2.1 Scope and shape

| Ref | Decision | Resolution |
|---|---|---|
| B1 | Which sales surfaces | **Storefront cart → checkout only.** In-store POS QR scanning deferred (§8). |
| B2 | Rule scope | Per-product rules acceptable, holding tenant-DB item IDs **by value** in landlord tables (no cross-DB FK), matching the existing `order_reference` pattern. Phase 2 activates them; Phase 1 ships the schema shape. |
| B3 | Attribution lifetime | **Session-scoped.** ⚠ Behavior change — see §7.5. |
| B4 | Who configures | **Tenant/business owner**, in the existing POS back-office panel. Tenant-wide template, or per-affiliate override. |
| B5 | Numeric representation | Follow ADR 0036: integer centavos for money, basis points for rates. The external pack's `DECIMAL` examples get translated, not adopted. |
| B6 | Fixed amounts | **Fixed selling-price rules: yes** — explicitly recorded ("base price + ₱10", "base price − ₱1,000"). **Fixed *commission*: no** — not demonstrated in the recording and redundant while commission is percentage-of-base. |

### 2.2 Pricing and accounting

| Ref | Decision | Resolution |
|---|---|---|
| A1 | What is `base_price`? | The tenant's existing catalog sale price. No new price column — a second price field would drift from the catalog price immediately. |
| A2 | Who funds the buyer discount? | **Merchant-funded** by default, with the settlement-policy enum making it explicit per program. The alternatives each require a new money movement: affiliate-funded means clawing back from earnings, platform-funded means DGFY subsidising tenant promos. |
| A3 ⚠ | Commission basis when a discount is active | **Commission accrues on the base-price subtotal, not the discounted buyer subtotal.** ₱100 base, 10% affiliate discount, 5% commission → buyer pays ₱90, affiliate earns ₱5, merchant nets ₱85. This amends ADR 0036 Decision 3, which currently defines the base as `subtotal − discount` (§10). |
| A7 ⚠ | DGFY convenience fee basis | **Computed on the affiliate-adjusted subtotal** — what the buyer actually pays. Consistent with ADR 0012's "computed on gross subtotal". Changes platform revenue on marked-up sales (§7.2). |
| A8 | Settlement-policy values | Three: `MERCHANT_FUNDED`, `COMMISSION_ADDED_TO_BUYER_PRICE`, `RESELLER_MARGIN`. **`CUSTOM_OR_UNRESOLVED` from the external pack is dropped** — a persisted "we haven't decided" value means unresolvable rows in a money table. |
| A9 | Floor guard on discounts | **Add one.** Validate the discounted price against `cost_per_unit` (already snapshotted per line) and reject **at config time**, not checkout. Nothing today prevents a 90% affiliate discount selling below cost. |

### 2.3 Volume tiers — Phase 2

| Ref | Decision | Resolution |
|---|---|---|
| A4 | What counts as volume? | Sum of `commissionable_base_centavos` across `earned` + `paid` rows. Already in the ledger, so tiers are a cheap aggregate with no new writes. Using buyer payments instead would let an affiliate's own markup inflate their own tier. |
| A5 | Volume period | Calendar month, tenant timezone. |
| A6 | Tier retroactivity | Prospective from the crossing sale. Highest tier wins, not cumulative. Retroactive would mean rewriting settled ledger rows, against ADR 0036's snapshot rule. |

### 2.4 Behavior and process

| Ref | Decision | Resolution |
|---|---|---|
| A10 | VAT moving with the affiliate price | **Accepted.** BIR requires the receipt to reflect the price actually paid, so VAT on ₱90 is correct. Stated in the ADR rather than left to be discovered (§7.1). |
| A11 | Promo codes stacking with affiliate discounts | **Allowed in Phase 1, surfaced as a warning in the config UI.** Commission computes on base price (A3), so affiliate earnings are unaffected either way; the only exposure is merchant margin, which is the owner's call to make knowingly. |
| A12 | `attribution_window_days` setting | **Removed from the owner panel** in the same change. It is enforced nowhere today and session-scoping makes it actively misleading. |
| A13 | Pricing failure mode | **Pricing is pre-commit and blocking** — an unresolvable affiliate rule fails the checkout. A deliberate departure from ADR 0036's best-effort accrual convention, because silently charging the wrong price is the worst available outcome (§10). |
| A14 | Can the affiliate set their own price? | **No in Phase 1.** The owner configures everything. Follows from B4, but the external pack's reseller example implies otherwise, so it is stated explicitly. |
| A15 | What does the QR/link point at? | **Store-scoped affiliate storefront** — which is what `?p=` + `store_slug` already does. No change; recorded so it is not relitigated. |
| A16 | Cart repricing when rules change mid-session | **No work needed.** The cart is client-side only (`frontend/apps/store/src/__tests__/storefrontCartStorage.test.js`; there is no cart table) and holds item + quantity, so price is already recomputed authoritatively at checkout. |
| C7 | Process | Plan first. Basic implementation short-run, advanced long-run. |
| C8 | Build/verify | Migrations and suites run on the owner's machine; this repo has no live MySQL. |
| C9 | Source recording | Not available. The analysis doc is the authority. |

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

- `frontend/apps/store/src/StorefrontApp.jsx` calls `useAffiliateAttributionCapture` — the capture
  endpoint is **no longer dormant** as ADR 0036 described it
- `backend/src/modules/store/controllers/storeHandlers.js:346` bridges the `sku_aff_attr` cookie
  into the checkout payload
- `frontend/src/features/pos/components/AffiliatesWorkspacePanel.jsx` — owner-facing config

### 3.1 Gaps in what exists

- `attribution_window_days` is **stored and editable but never enforced** anywhere in accrual. It
  is currently cosmetic config (removed per A12).
- The `qr` attribution channel is defined in the enum but never written.
- The cookie's real lifetime is 30 days (`AFFILIATE_ATTRIBUTION_MAX_AGE_MS`,
  `backend/src/utils/browserSessionCookies.js:17`), contradicting both the `attribution_window_days`
  setting and the session-scoped decision (B3).

---

## 4. What the spec adds

| Spec layer | Status here | Phase |
|---|---|---|
| **Selling Price Rule** (6 modes) | Entirely new. Changes buyer-facing price. | 1 (program-level) → 2 (per-product) |
| **Commission Rule** | Partially exists — flat `rate_bps` covers `PERCENTAGE_OF_BASE`. `NONE` and `RESELLER_MARGIN` are new. | 1 |
| **Volume Tier Rule** | Entirely new. | 2 |
| **Settlement policy** | Entirely new; currently an unstated assumption. | 1 |

Selling-price modes, all six retained: `BASE_PRICE`, `PERCENTAGE_MARKUP`, `FIXED_MARKUP`,
`PERCENTAGE_DISCOUNT`, `FIXED_DISCOUNT`, `EXACT_AFFILIATE_PRICE`.

Commission modes, three (per B6): `NONE`, `PERCENTAGE_OF_BASE`, `RESELLER_MARGIN`.

---

## 5. Rule resolution order

Owner picks a template or customises per affiliate (B4). Most specific first:

1. Per-product rule for this enrollment — *Phase 2*
2. Per-product tenant template — *Phase 2*
3. Per-enrollment rule (this affiliate, all products)
4. Tenant template rule (all affiliates, all products)
5. No rule → buyer pays the catalog price, commission falls back to today's flat-rate behavior

**MySQL gotcha:** MySQL treats `NULL` as distinct in unique indexes, so `enrollment_id IS NULL`
cannot express "the template row" under a unique constraint. Use sentinel `0` for both
`enrollment_id` and `item_id` to mean "applies to all", keeping
`UNIQUE (tenant_id, enrollment_id, item_id)` enforceable. Must be explicit in the migration and
the repository layer.

---

## 6. Where the price is actually resolved

Exactly four `requireExplicitSalePrice(item, context)` call sites exist in the backend, all from
`backend/src/modules/shared/utils/itemFinancialPolicy.js`. This is what makes the storefront-only
boundary (B1) provable rather than aspirational:

| Site | Surface | Phase 1 |
|---|---|---|
| `backend/src/modules/inventory/usecases/storefrontCatalogUseCases.js:152` | Owner-side readiness check (`assertStorefrontPriceReady`, runs when enabling storefront visibility) | Not a buyer-facing price site — see correction below |
| `backend/src/modules/store/usecases/storeUseCases.js:765` | Storefront checkout | **In scope** |
| `backend/src/modules/pos/usecases/posUseCases.js:2548` | In-store POS checkout | Deferred (§8) |
| `backend/src/services/dispatchOrderService.js:47` | Dispatch orders | Out of scope |

**Correction (found during Phase 1 planning):** the row above was originally listed as the
buyer-facing storefront catalog price site. It is not — it only gates whether an owner can flip an
item's `storefront_visible` flag on, and never runs on the buyer's browsing path. The actual
buyer-facing catalog price is `serializeStoreCatalogItem`
(`backend/src/modules/store/usecases/storeUseCases.js:894`, emitting `default_sale_price` at `:911`),
reached from two callers: the catalog list endpoint (`:1348`) and the barcode-resolve endpoint
(`:1494`). Both must become affiliate-aware together — this is the second in-scope site, alongside
storefront checkout at `:765`.

`serializeStoreCatalogItem`'s two callers, plus `storeUseCases.js:765`, are the affiliate rule
engine's actual wrap points.

**Both in-scope sites must change together.** If the catalog is not affiliate-aware but checkout
is, the buyer sees ₱100 in the product list and ₱90 (or ₱120) at checkout. Today the
`sku_aff_attr` cookie is read *only* in the checkout controller — Phase 1 must extend that read to
the catalog endpoint.

`storeUseCases.js` already carries `sale_price_overridden` and `price_override_reason` on each
prepared line. Affiliate pricing has a natural home there
(`sale_price_overridden: true, price_override_reason: 'affiliate_program'`) with no new line columns.

---

## 7. Consequences the external spec does not mention

These surfaced from reading the actual checkout path.

### 7.1 VAT moves with the affiliate price *(accepted, A10)*

`storeUseCases.js:796-806` derives `vatableSales` from `line_subtotal`
(`vatableGross / (1 + VAT_RATE)`). Any affiliate price change moves the VAT base — a discount
reduces the tenant's output VAT, a markup increases it. Correct per BIR, but a tax-visible
consequence of a pricing feature and must be stated in the ADR.

### 7.2 The DGFY convenience fee moves too *(decided, A7)*

`storeUseCases.js:1197` computes `computeDgfyConvenienceFee(prepared.subtotalAmount)`. A ₱120
reseller markup makes DGFY collect 1% of ₱120 instead of ₱100.

### 7.3 Commission needs a second subtotal

A3 requires commission on the *base-price* subtotal while the buyer pays the *affiliate-adjusted*
subtotal. `prepareCheckoutLines` currently returns one `subtotalAmount`. Phase 1 adds a parallel
`baseSubtotalAmount` (catalog price × quantity, pre-affiliate-rule) and threads it to accrual.
Additive; no behavior change when no affiliate is attributed.

### 7.4 Affiliate discount stacking with promo codes *(decided, A11)*

`promoApplication.discountAmount` already exists. Affiliate discount plus promo code is a double
discount the merchant funds twice. Allowed in Phase 1 with a config-UI warning.

### 7.5 Session-scoped attribution is a live behavior change *(B3)*

Moves `sku_aff_attr` from a 30-day cookie to a session cookie. Attributions that would have
converted on a later visit no longer convert. Paired with removing `attribution_window_days` from
the panel (A12).

### 7.6 Reseller margin has to settle through PayMongo

Under `RESELLER_MARGIN` the buyer pays ₱120, the merchant is owed ₱100, the affiliate is owed ₱20 —
but storefront online payments are split-settled per ADR 0027. The ₱20 lands in the existing
settlement path and reaches the affiliate through the manual cashout flow.

Mechanically this works: book the margin as a commission row with `reason: 'reseller_margin'`
(`reason` is a free `STRING(120)`, so no enum migration). The ADR must state that reseller margin
is *not* a new money movement, just a differently-derived ledger amount.

### 7.7 Refunds get harder — flagged, not solved

The existing reversal path (`reverseAffiliateCommissionForOrder`) handles today's flat commission
correctly. A refund on a **reseller-margin** sale is different: the buyer's ₱120 comes back while
the ₱20 may already be reserved in — or paid out through — a cashout. Not Phase 1 scope, but the
ADR must record that the exposure exists rather than imply reversal is fully solved.

---

## 8. Deferred: in-store POS affiliate QR

Per B1, the affiliate presenting a QR **at the POS terminal** is deferred and needs its own spec.
Open questions, recorded so they are not rediscovered:

- Which device scans — the customer's phone against a terminal-displayed code, or the terminal's
  scanner against the affiliate's phone?
- The POS scanner path already owns scan input; an affiliate QR must not collide with a product
  barcode (`frontend/src/utils/barcodePolicy.js`).
- In-store checkout captures no buyer identity, so ADR 0036's self-referral guard stays a no-op.
- In-store commissions are born `earned` with no pending stage — affiliate pricing plus immediate
  accrual means a void must reverse both the price and the commission.
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
- Pure calculation service — inputs in, breakdown out, no I/O. The unit-test surface; carries every
  acceptance case from the external pack's `04-acceptance-tests.md`
- Rule resolution + validation: negative buyer price, discount > 100%, duplicate scope rows, and
  the below-cost floor guard (A9)
- Affiliate-aware price at the two in-scope resolution sites (§6)
- `baseSubtotalAmount` threaded through `prepareCheckoutLines` (§7.3)
- Accrual updated for `NONE` / `PERCENTAGE_OF_BASE` / `RESELLER_MARGIN` and the A3 base change
- Cookie read extended to the catalog endpoint; cookie switched to session-scoped

**Frontend:**
- Owner config in `AffiliatesWorkspacePanel.jsx` — mobile-first structured controls, no formula
  typing: rule-type selector, single numeric input, live preview, template-vs-per-affiliate toggle,
  promo-stacking warning (A11), and a full preview showing buyer price, affiliate earnings, and
  merchant net before save
- Storefront shows the affiliate price with visible "affiliate price" labelling so the buyer is
  never silently quoted a different number than the public catalog
- Note: storefront checkout UI was unified across MSME and F&B in `6c26ac84` (PR #137). Phase 1
  frontend work must build on that unified surface, not the pre-merge one.

**Not in Phase 1:** volume tiers, per-product overrides, effective-date windows, POS in-store.

### Phase 2 — advanced

- Per-product rule overrides (schema already shaped; activates `item_id`)
- `dgfy_affiliate_volume_tiers` + tier resolution (A4/A5/A6), additive bps on the base rate
- `dgfy_affiliate_commission_rules` table, when per-product commission is actually needed
- Rule effective-date windows and overlap rejection
- In-store POS affiliate QR (§8), after its own spec

---

## 10. Governance path

ADR 0039 (accepted 2026-07-29) replaced the old "any cross-boundary change needs an ADR" rule with
tier-based routing. That materially reduces the paperwork here:

1. **ADR 0036 amendment, not supersession.** ADR 0036's Decision clauses carry no tier tags, and
   ADR 0039 §1 states untiered clauses default to `default`, **not** `binding`. Changing Decision 3
   (commission base, A3) therefore takes a dated `## Amendments` block appended to ADR 0036 in the
   implementing PR, with `status: amended` and a refreshed `last_reviewed`. No new ADR, no
   tech-lead approval.
   - Because this clause is money-integrity, tier ADR 0036's clauses as part of this work: Decision
     2 (integer centavos / bps) is genuinely `binding`; Decision 3 (commission base) is `default`
     and therefore amendable.
2. **A new ADR for the pricing engine itself** — buyer-facing affiliate pricing is a new
   cross-boundary decision with no ADR covering it (ARCHITECTURE_GOVERNANCE step 3, final bullet).
   Per ADR 0039 §5 it must stay under ~150 lines: decision, tiers, consequences. Column lists and
   phase plans stay in *this* document and are linked, not inlined.
   - Must address: the ADR 0012 convenience-fee interaction (§7.2), the ADR 0027 settlement
     interaction (§7.6), the VAT consequence (§7.1), and the refund exposure (§7.7).
   - Front matter must carry `status`, `authority_level`, `owner`, `date`, `last_reviewed`,
     `review_by`, `topic` — enforced by `npm run check:adr`.
   - Regenerate the index with `npm run generate:adr-index`.
3. **Impact declaration** under `docs/compliance/impact-declarations/`.
4. **Implementation Hardening Contract** applies — checkout is explicitly named in
   ARCHITECTURE_GOVERNANCE. All 10 items, notably rendered-UI proof at desktop + mobile viewports
   and build-surface proof for every affected app surface.
5. **Failure-mode split.** Accrual stays post-commit and non-blocking — a bookkeeping failure must
   never fail a sale. **Pricing is pre-commit and blocking** (A13). This departure from ADR 0036's
   convention must be stated in the new ADR as a deliberate decision.

---

## 11. Verification plan

No `node_modules` and no live MySQL in the working container (C8):

**Verifiable here:** the pure calculation service and its unit tests (every acceptance case),
rule-resolution and validation tests including the floor guard, and the existing backend suite once
dependencies install. Plus `npm run check:adr` and `npm run check:architecture`.

**Requires the owner's machine:** the migration against live MySQL, storefront catalog/checkout
integration against a real tenant DB, and the mobile config UI.

ADR 0036 records that its own migration was never run against a live database. That debt is
inherited here and should be cleared in the same session that runs Phase 1's migration.

---

## 12. Environment readiness — measured 2026-07-29

Verified by running the toolchain, not assumed.

| Check | Result |
|---|---|
| `backend` dependency install | **Works** — 784 packages, ~12s |
| Pure unit test without MySQL | **Works** — `tests/commercialPromoPolicy.unit.test.js`, 5 passed. `backend/tests/setup.js` mocks Redis in-memory, so pure-logic suites need no services |
| `npm run check:adr` | **Passes** — 55 ADRs validated |
| Disk / Node | 30 GB free, Node 22.22.2, npm 10.9.7 |
| Redis / Docker binaries | Both present |
| MySQL | **Absent.** CI (`.github/workflows/ci.yml` `test-backend`) provisions `mysql:8.0` + `redis:7` as services, runs `sequelize-cli db:migrate`, then the suite. Docker is available, so a containerized MySQL is a plausible workaround but is **unproven** |

Test layout note: the backend suite is `backend/tests` (399 files), run from `./backend` with
`backend/jest.config.cjs`. The root `./tests` directory is a separate suite, and the root
`npm test` script references a root-level jest that is not installed by root `npm install`.

### 12.1 The gap that most affects this work

**There is zero affiliate test coverage.** Grepping all 399 files in `backend/tests` for
`affiliate` returns nothing — the ADR 0036 feature shipped without tests in this suite.

This matters directly: decision A3 changes commission accrual behavior, and there is no existing
regression net under it. Phase 1 must therefore **write characterization tests for today's accrual
behavior before changing it**, so the A3 change is a deliberate, visible diff in test expectations
rather than an unobserved behavior shift. This is added scope the external pack does not account
for, and it should be the first task in Phase 1, ahead of the calculation service.

### 12.2 Implications for unattended/long-running work

- The container is **ephemeral** and reclaimed after inactivity. Any unattended run must commit and
  push continuously; work held only in the container is lost.
- **Well suited to run here:** the pure calculation service, rule resolution, validators (including
  the A9 floor guard), and their unit tests — the largest and most logic-dense part of Phase 1.
- **Cannot complete here:** the migration against live MySQL, storefront catalog/checkout
  integration, the mobile config UI, and the Hardening Contract's rendered-UI proof (which needs
  the app running, which needs MySQL).
