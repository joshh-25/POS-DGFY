---
status: reference
authority_level: reference
owner: product_engineering
last_reviewed: 2026-08-24
applies_to: platform_funding_fees_discounts_stacking
topic: platform_funding_and_discount_stacking
---

# Funding & Discount-Stacking Disclosure

Governed by issue #932 (child of epic #931), filed for legal clarity on how DGFY earns money on
each transaction and how discounts combine. This document **describes** current, as-implemented
behavior, traced directly from code on 2026-08-24 — it does not decide policy. Where a decision is
still open, that is stated explicitly rather than presented as settled. It does not supersede any
ADR; where this doc and an ADR appear to disagree, the ADR governs and the disagreement is logged
in [§6](#6-known-gaps-and-open-decisions).

This doc has two parts. **Part 1** is for stakeholders, legal, and the CEO — no code, worked peso
examples, and the stacking matrix that answers "what combines with what." **Part 2** is the
engineering appendix — exact formulas with file:line citations. Every Part 1 claim links to the
Part 2 section that proves it, so the two halves can't quietly drift apart.

---

# Part 1 — For stakeholders and legal

## 1. How DGFY earns money

DGFY has **two structurally different ways of earning revenue on a sale**, and today only one of
them is active.

**The switch is one server setting**, `TENANT_REVENUE_SHARING_ENABLED` — see
[§7](#7-fee-computation-both-regimes). It is currently **OFF** everywhere it has been checked.

### Regime A — "Convenience Fee" (currently active)

The **buyer** pays DGFY an extra **1% of the cart subtotal** on top of their order, labeled "DGFY
convenience fee" on the receipt. The merchant is paid directly by the payment processor and never
sees this fee move through DGFY's own books.

- **In-store (POS cashier) sales: this fee is `0`.** It applies to storefront (online) orders only.
- The 1% is charged on the subtotal **before** any discount is subtracted — so even a fully
  discounted (100%-off voucher) order still carries the fee.
- **This 1% is not recorded anywhere in DGFY's own financial ledger.** It exists only as a line item
  on the customer's receipt and inside the payment processor's own split-payment records. See
  [§6](#6-known-gaps-and-open-decisions) — this is flagged as a bookkeeping gap, not a design choice
  stated in any authoritative doc.
- The rate is **hardcoded** in two separate places in the codebase (backend and storefront), not
  configurable per tenant or from any settings screen. Tracked as open decision **#814**.

### Regime B — "Tenant Revenue Sharing" (built, not currently active)

The **merchant** pays DGFY a **1% platform fee** (configurable per tenant, in the code today), taken
out of what DGFY remits to them — the customer is charged nothing extra by DGFY. DGFY collects the
full payment first, then settles the merchant's share on a 15- or 30-day cycle after deducting its
own fee and the payment processor's fee.

- Fee is computed on the **actual captured amount**, net of any discount, including delivery fee.
- This is the regime `docs/features/TENANT_REVENUE_SETTLEMENT.md` describes in full — this doc
  doesn't repeat that mechanism, only how it fits alongside Regime A and discounts.

### The payment processor's own fee

Separately from DGFY's own fee, the payment processor (PayMongo) charges its own transaction fee.
**By default, that fee is passed on to the merchant in full** — DGFY does not currently absorb it.
See [§7](#7-fee-computation-both-regimes).

## 2. Worked examples

All figures are illustrative, using the rates actually hardcoded/defaulted in the codebase today.

**A. Plain online sale, ₱1,000 cart, Regime A (current default):**
- Convenience fee: `₱1,000 × 1% = ₱10.00`, charged to the buyer
- Buyer pays: `₱1,000 + delivery fee + ₱10.00`
- DGFY's ₱10 is not recorded in DGFY's ledger — see [§1](#1-how-dgfy-earns-money)

**B. Same sale, in-store at POS cashier:**
- Convenience fee: **₱0** — POS cashier sales never carry this fee
- Buyer pays exactly the cart total, no DGFY fee at all

**C. Same sale, Regime B (if switched on):**
- DGFY platform fee: `₱1,000 × 1% = ₱10.00`, deducted from what DGFY pays the merchant
- Buyer pays: `₱1,000 + delivery fee`, nothing extra
- Merchant receives: `₱1,000 − ₱10.00 (DGFY fee) − processor fee share`, 15/30 days later

**D. Downpayment order, ₱1,000 order, 20% (₱200) downpayment, Regime B:**
- DGFY's fee is charged **only on the ₱200 downpayment**: `₱200 × 1% = ₱2.00`
- The remaining ₱800 balance, collected later (typically cash on delivery/pickup), generates
  **zero additional DGFY fee** — there is no code path that charges a fee on the balance leg today.
- **Net effect: DGFY earns ~0.2% of this order's total value, not 1%.** This is the current de-facto
  answer to open issue **#817** ("what fee basis should apply to a downpayment order") — the answer
  today is "downpayment only," not by deliberate policy decision but because that's what the code
  does. See [§7](#7-fee-computation-both-regimes).

**E. Voucher sale, ₱1,000 cart, ₱200 voucher discount:**
- Buyer pays `₱800` for the goods
- In Regime A, the convenience fee is still `₱1,000 × 1% = ₱10.00` — computed on the **pre-discount**
  amount, not the ₱800 the buyer actually pays for goods
- Affiliate commission (if this order also has an affiliate), and DGFY's Regime B fee (if active),
  are both computed on the **post-discount** ₱800

**F. PWD/Senior Citizen sale (in-store only — see §3), ₱112 item, VAT-inclusive:**
- VAT is backed out first: `₱112 ÷ 1.12 = ₱100.00` (VAT-exempt base)
- 20% statutory discount: `₱100.00 × 20% = ₱20.00`
- Buyer pays: `₱80.00`
- This matches the standard Philippine PWD/Senior Citizen computation. See
  [§11](#11-statutory-discount-and-vat-arithmetic).

## 3. The stacking matrix

This is the core of the legal-clarity question: **what combinations of discounts and fees can occur
on the same order, and does the system actually allow or block each one?**

| Combination | Storefront (online) | POS (in-store) | How it's enforced |
|---|---|---|---|
| Voucher + a second voucher | ❌ blocked | ❌ blocked | Only one voucher code can be entered on an order at all — the system has no way to hold two |
| Voucher + a promo code | ❌ blocked | ❌ blocked | Explicit either/or check; applying one blocks the other |
| Voucher (% off or ₱ off) + affiliate pricing | ✅ **allowed** | n/a (affiliate pricing is online-only) | They compose: affiliate sets the item's price first, then the voucher discounts the resulting total |
| Voucher (fixed price) + affiliate pricing | ❌ **refused outright**, checkout blocked | n/a | Both would be claiming the right to set the final price — the system refuses rather than guessing |
| Voucher + PWD/Senior Citizen discount | n/a (statutory not available online — see below) | ❌ blocked | POS allows only one "governed" discount per sale, and a voucher and a statutory discount both compete for that one slot |
| PWD/Senior Citizen discount + a per-item discount | n/a | ✅ **allowed, with no restriction in the code** | The per-item discount reduces the price first; the 20% statutory discount is then computed on the already-discounted amount |
| PWD/Senior Citizen discount online | ❌ **not available at all** | ✅ available | There is no statutory-discount feature built into the online storefront today |
| DGFY convenience fee + any discount | ✅ (fee still applies, see §2E) | n/a (fee is 0 at POS) | Fee (Regime A) is computed before discounts are subtracted |

**The single most important line in this table for legal review: a PWD or Senior Citizen customer
shopping online today cannot receive their statutory discount at all — the feature only exists for
in-store purchases.** This is a compliance-relevant gap, not a documentation gap; see
[§6](#6-known-gaps-and-open-decisions).

**The second: statutory discounts can silently combine with an ordinary commercial discount at
the item level** — nothing in the code stops a cashier from applying both a per-item promo discount
and the 20% Senior/PWD discount on the same item. Whether that's intended is a policy question this
doc surfaces but does not answer.

## 4. What a merchant receives, and when

Fully governed by `docs/features/TENANT_REVENUE_SETTLEMENT.md` (authoritative) — summarized here,
not restated: under Regime B, a merchant's payment is held (`on_hold`) until DGFY confirms the order
was actually fulfilled, then becomes eligible for payout after a 15- or 30-day cycle, then goes
through a two-person (preparer + separate approver) manual batch-approval process before money
actually moves. Under Regime A (current default), the merchant is paid directly by the payment
processor at time of sale minus the processor's own cut — DGFY is not in that money's path at all.

## 5. Refunds and chargebacks

- A full refund on a Regime B order reverses DGFY's platform fee **proportionally** — if half the
  order is refunded, half of DGFY's fee is reversed, computed as an exact running delta so partial
  refunds always sum correctly. See [§7](#7-fee-computation-both-regimes).
- A refund never reopens a merchant payout that's already settled; unresolved refund amounts are
  carried forward to the *next* settlement batch instead.
- **Regime A has no equivalent mechanism described in code for reversing the 1% convenience fee on
  a refund** — because Regime A doesn't post the fee into any DGFY ledger in the first place (§1),
  there is nothing there to reverse. Flagged in [§6](#6-known-gaps-and-open-decisions).

## 6. Known gaps and open decisions

Each row is either an open policy decision (has an issue number, awaiting a business/legal call) or
a code defect this audit surfaced (filed as its own issue, not fixed as part of this document).

**Open policy decisions — not yet settled, current behavior described above is the de-facto answer:**

| # | Question | Current behavior |
|---|---|---|
| #817 | What fee basis applies to a downpayment order? | Fee charged on downpayment only; balance leg is fee-free (§2D) |
| #814 | Should the 1% convenience fee be configurable? | No — hardcoded in two places today |
| #872 | Who funds the affiliate program — the business or DGFY? | Not resolved in this doc's scope |
| #605 | Should a fixed-price voucher be allowed with a statutory discount? | Currently blocked by the single-discount-slot rule (§3), same as any other combination |
| #782 | Should voucher-to-voucher stacking (e.g. a free-delivery voucher category) ever be allowed? | Currently impossible — one voucher per order (§3) |

**Code defects surfaced by this audit — filed separately, not fixed here:**

1. Combining a per-item discount with a voucher on POS can **over-discount** the order — the
   voucher's price base and the amount it's subtracted from are computed inconsistently.
2. Affiliate commission is calculated differently online vs. in-store when a voucher is also
   applied — the same sale would yield a different commission depending on channel.
3. A storefront fallback calculation can, in one specific failure path, add together two discounts
   that the main system deliberately never allows to combine.
4. The official BIR discount report can, in one case, print a **customer's phone number** in the
   field meant for their Senior Citizen/PWD ID number.
5. A per-item statutory discount doesn't correctly flag the item as VAT-exempt in official sales
   reports, which can cause VAT to be counted twice on the same sale.
6. A database field meant to let a voucher explicitly be marked "combinable with statutory
   discounts" exists but is not actually read or enforced anywhere — it looks configurable but is
   not.
7. Affiliate volume-tier bonuses and a safety check for conflicting settlement policy are only
   evaluated in a preview screen for the business owner — they never actually run during real
   checkout.

**Not implemented at all today**, worth stating for completeness on a legal-clarity document: the
statutory 5% basic-necessities discount (RA 9994/RA 11861) and the Solo Parent discount are not
built as discount types anywhere in the system.

---

# Part 2 — Engineering appendix

Every figure below was traced from source on 2026-08-24 and cited by file and line. Line numbers
drift as the codebase changes — treat them as accurate as of this date; re-verify before relying on
them for a change.

## 7. Fee computation, both regimes

**The regime switch** — `apps/dgfy-api/src/config/tenantRevenueFeature.js:15`:
```js
export const tenantRevenueSharingEnabled = readBoolean('TENANT_REVENUE_SHARING_ENABLED', false);
```
Default rate (`:18-21`): `TENANT_REVENUE_DEFAULT_RATE_BPS`, fallback `100` (1%), clamped `[0, 10000]`.
Default settlement cycle (`:22-26`): `TENANT_REVENUE_DEFAULT_SETTLEMENT_CYCLE_DAYS`, fallback `15`,
only `15` or `30` ever resolve.

**The single decision point** — `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js:3812-3814`:
```js
const platformFeeCentavos = tenantRevenueSharingEnabled
    ? Math.round((totalAmountCentavos * Number(revenuePolicy.dgfy_rate_bps || 0)) / 10000)
    : toCentavos(resolved.serviceFeeAmount);
```

**Regime A — the buyer-paid convenience fee**, whole file
`apps/dgfy-api/src/modules/shared/utils/dgfyConvenienceFee.js:1-13`:
```js
const DGFY_CONVENIENCE_FEE_RATE = 0.01;
const DGFY_CONVENIENCE_FEE_LABEL = 'DGFY convenience fee';
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
export const computeDgfyConvenienceFee = (grossSubtotal) => {
    const normalizedGrossSubtotal = Math.max(0, Number(grossSubtotal) || 0);
    return round4(normalizedGrossSubtotal * DGFY_CONVENIENCE_FEE_RATE);
};
```
Called at `storeUseCases.js:1782-1784`:
```js
const serviceFeeAmount = revenueSharingEnabled
    ? 0
    : computeDgfyConvenienceFee(prepared.subtotalAmount);
```
POS cashier zeroing is not a separate flag — POS checkout (`posUseCases.js`) simply never calls
`computeDgfyConvenienceFee`; no service fee is ever set for an in-store sale.

Storefront duplicate of the same constant (not imported from the API package — a maintenance risk,
not just a citation): `apps/dgfy-storefront/src/shared/model/storefrontConstants.js:10-11`,
`apps/dgfy-storefront/src/modes/fnb/checkout/hooks/useCheckoutTotalsAndGating.js:52`.

**Basis for Regime A**: `prepared.subtotalAmount` — the **pre-discount, pre-delivery** subtotal
(`storeUseCases.js:1782-1784`), confirmed by the order-total formula in
[§8](#8-the-order-total-pipeline).

**Regime B — the authoritative fee, recomputed at webhook time.** The checkout-time figure above is
advisory metadata only; the ledger-of-record fee is recomputed from the payment processor's reported
amount. `apps/dgfy-api/src/modules/tenantRevenue/usecases/tenantRevenueUseCases.js:41-48`:
```js
const roundBasisPoints = (amountCentavos, basisPoints) => {
  const amount = toBigInt(amountCentavos);
  const bps = toBigInt(basisPoints);
  if (amount < 0n || bps < 0n || bps > BPS_DENOMINATOR) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Financial rate inputs are invalid.');
  }
  return (amount * bps + (BPS_DENOMINATOR / 2n)) / BPS_DENOMINATOR;
};
```
(`BPS_DENOMINATOR = 10000n`.) And `:176-198`:
```js
const dgfyFee = roundBasisPoints(gross, policy.dgfy_rate_bps);
const providerFeeAllocation = allocateProviderFee({ providerFeeCentavos: providerFee, policy });
return {
  gross, providerFee, dgfyFee,
  tenantProviderFee: providerFeeAllocation.tenant,
  dgfyProviderFee: providerFeeAllocation.dgfy,
  tenantNetPayable: gross - dgfyFee - providerFeeAllocation.tenant
};
```
**Identity: `tenant_net_payable = gross − dgfy_fee − tenant_share_of_provider_fee`.**

**Downpayment substitution** — `storeUseCases.js:3806-3814`:
```js
const isDownpaymentCapture = resolved.downpayment.payment_mode === 'downpayment_required';
const orderTotalCentavos = toCentavos(resolved.totalAmount);
const totalAmountCentavos = isDownpaymentCapture
    ? toCentavos(resolved.downpayment.downpayment_amount)
    : orderTotalCentavos;
const platformFeeCentavos = tenantRevenueSharingEnabled
    ? Math.round((totalAmountCentavos * Number(revenuePolicy.dgfy_rate_bps || 0)) / 10000)
    : toCentavos(resolved.serviceFeeAmount);
```
`totalAmountCentavos` — the fee basis — is substituted to the **downpayment amount**, not the order
total, whenever a downpayment is captured. `orderTotalCentavos` is stored for reference
(`order_total_centavos`) but never feeds any fee formula. The POS balance-settlement path
(`apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`, the balance-collection function around
line 8432) writes a `pos_order_payments` row with no tenant-revenue or ledger write at all — grepping
that file for `tenantRevenue|dgfy_fee|platform_fee` returns zero matches.

**PayMongo (processor) fee allocation** — default is 100% passed to the merchant.
`TenantRevenueFeePolicy` model default: `provider_fee_payer: 'tenant'`. Allocation logic,
`tenantRevenueUseCases.js:167-176`:
```js
const allocateProviderFee = ({ providerFeeCentavos, policy }) => {
  const fee = toBigInt(providerFeeCentavos);
  if (policy.provider_fee_payer === 'dgfy') return { tenant: 0n, dgfy: fee };
  if (policy.provider_fee_payer === 'shared') {
    const tenant = roundBasisPoints(fee, policy.shared_fee_tenant_bps);
    return { tenant, dgfy: fee - tenant };
  }
  return { tenant: fee, dgfy: 0n };
};
```
When the processor doesn't report an explicit fee, a configured per-method fallback is used
(`tenantRevenueUseCases.js:100-112`); every fallback bucket defaults to `rate_bps: 0`. **No seeder
populates a fee policy for any tenant** — a tenant has no policy until an admin explicitly creates
one, and Regime B checkout hard-fails without one (`storeUseCases.js:3665-3684`,
`TENANT_REVENUE_POLICY_NOT_READY`).

**Refund reversal** (proportional, not a flat re-run) — `tenantRevenueUseCases.js:815-821`:
```js
return (dgfyFee * cappedRefund + (grossAmount / 2n)) / grossAmount;
// applied as a delta: proportionalPlatformFee(updatedRefund) - proportionalPlatformFee(previousRefund)
```

**Regime A posts nothing to DGFY's own ledger** —
`tenantRevenueUseCases.js:460-462`:
```js
if (!tenantRevenueSharingEnabled) {
  return { posted: false, reason: 'tenant_revenue_sharing_disabled' };
}
```

## 8. The order-total pipeline

**Storefront** — one formula, `storeUseCases.js:1786-1788`:
```js
const totalAmount = round4(
    prepared.subtotalAmount - promoApplication.discountAmount - voucherApplication.discountAmount
    + deliveryFee + serviceFeeAmount
);
```
Step order: affiliate price rule rewrites each line's unit price → subtotal formed → promo *or*
voucher discount (never both) → `+ delivery fee` (not discounted) → `+ convenience fee`, computed on
the pre-discount subtotal (not discounted) → total. VAT is derived separately, from pre-discount line
subtotals.

**POS** — `posUseCases.js`, roughly lines 3020-3475. Step order: subtotal → per-item discounts
reduce each line's base → one governed (order-level) discount (promo, voucher, senior, pwd,
employee, or manual — exactly one) applied against the item-discounted base → service fee on the
**gross pre-discount** subtotal (always 0 today — no code path sets it for POS) → restaurant service
charge (F&B only) on the **net post-discount** total → order total. VAT is derived from
**post-discount** line amounts — the opposite basis from storefront.

**Confirmed divergence**: storefront computes VAT before discounts, POS computes it after. Both are
internally consistent with their own arithmetic but are not directly comparable across channels.

## 9. Voucher benefit resolution, caps, and per-line allocation

Voucher discount types: `percent_off`, `amount_off`, `fixed_price`
(`apps/dgfy-api/src/models/Voucher.js:49`).

Base amount is the **scope-eligible line subtotal only** —
`apps/dgfy-api/src/modules/vouchers/domain/voucherBenefitPolicy.js:117,247-248`:
```js
lineSubtotalCentavos: Math.round(quantity * baseUnitPriceCentavos)
...
const eligibleSubtotalCentavos = eligibleLines.reduce((sum, line) => sum + line.lineSubtotalCentavos, 0);
```
Delivery and service fees are never in this base.

`percent_off` (`:140`): `Math.round((eligibleSubtotalCentavos * bps) / 10000)`.
`amount_off` (`:155`): `Math.min(amount, eligibleSubtotalCentavos)`.
`fixed_price` (`:200`): `Math.round(line.quantity * Math.max(0, line.baseUnitPriceCentavos - pinned))`.

**Cap** (`:261-264`):
```js
const cap = maxDiscountCentavos == null ? Infinity : toInteger(maxDiscountCentavos);
const cappedDiscount = Math.min(rawDiscountCentavos, cap);
const discountCentavos = Math.max(0, Math.min(cappedDiscount, eligibleSubtotalCentavos));
```
`max_discount_centavos` is per-redemption. The legacy promo mechanism (`commercialPromoPolicy.js`)
has **no cap at all**.

**Redemption is enforced atomically** — a single conditional `UPDATE`
(`apps/dgfy-api/src/modules/vouchers/repositories/voucherRepository.js:343-377`) checks
`max_redemptions`, `max_total_discount_centavos`, and `max_benefit_quantity` together; zero affected
rows maps to the specific exhaustion reason.

**One voucher per order — structural, not a runtime check.** The checkout payload carries a single
scalar `voucher_code` field everywhere (storefront, POS, split-payment), never an array. There is no
"second voucher rejected" error message because a second code has nowhere to be attached.

**Voucher vs. promo** — a clean either/or, never summed:
`storeUseCases.js:3065-3073` persists a single discount slot on the order header, commented
explicitly that promo and voucher "can never BOTH be applied on the same order."

**Voucher vs. affiliate** —
`apps/dgfy-api/src/modules/vouchers/usecases/voucherRedemptionUseCases.js:79-85`:
```js
if (voucher.benefit_class === 'fixed_price' && context.affiliatePricing) {
    voucherError(
        'A fixed-price voucher cannot be combined with active affiliate pricing.',
        VoucherReasonCode.VOUCHER_FIXED_PRICE_AFFILIATE_CONFLICT,
        { voucher_id: voucher.voucher_id }
    );
}
```
`percent_off`/`amount_off` are not blocked — they compose sequentially: the affiliate rule rewrites
the unit price first, then the voucher discounts the resulting (affiliate-adjusted) subtotal.

**`vouchers.stackable_with_statutory`** — declared on the model
(`apps/dgfy-api/src/models/Voucher.js:92`), round-tripped by the validator and use case, but read by
**no pricing, eligibility, or checkout code anywhere in the repository**. It is a stored, editable,
non-functional field.

## 10. Affiliate pricing vs. affiliate commission

Two different mechanisms, computed independently — they are not always the same number.

**Buyer-facing price rule** (rewrites the unit price, before the subtotal forms) —
`apps/dgfy-api/src/modules/shared/utils/affiliatePricingPolicy.js:73-97`:
```js
case 'PERCENTAGE_DISCOUNT': return base - roundBpsAmount(base, rule?.rateBps);
case 'FIXED_DISCOUNT':      return base - toInt(rule?.amountCentavos);
case 'EXACT_AFFILIATE_PRICE': return toInt(rule?.amountCentavos);
```
Applied at `storeUseCases.js:929-985`, stamping the line `price_override_reason: 'affiliate_program'`.
**POS never applies an affiliate price rule** — affiliate codes on POS affect commission only.

**Commission** — a separate calculation, at checkout time (not the reference `calculateAffiliateSale`
engine, which is preview-only — see [§13](#13-known-posstorefront-divergences)).

Storefront (`storeUseCases.js:3293-3337`):
```js
const commissionableBaseCentavos = commissionBaseMode === 'base_price_subtotal'
    ? Math.max(0, baseSubtotalCentavos)
    : Math.max(0, buyerSubtotalCentavos - discountCentavos);  // discountCentavos = PROMO only
amountCentavos: Math.round(commissionableBaseCentavos * rateBps / 10000)
```
POS (`posUseCases.js:4014`):
```js
commissionableBaseCentavos: Math.max(0, toCurrencyCents(subtotalAmount) - toCurrencyCents(discountAmount))
// discountAmount here includes the voucher discount, unlike storefront
```
Default commission rate: `500` bps (5%) (`affiliateCommissionAccrual.js:4`).

**Divergence, confirmed**: storefront's commission basis subtracts only the promo discount, never
the voucher discount; POS's basis subtracts all discounts including the voucher. The same sale
would commission differently depending on channel.

## 11. Statutory discount and VAT arithmetic

Statutory types: `senior`, `pwd` only — `apps/dgfy-api/src/modules/pos/domain/posDiscountCalculator.js:2`.

`apps/dgfy-api/src/modules/pos/domain/posDiscountCalculator.js:29-30,72-79`:
```js
const requestedRate = statutory ? 20 : clamp(application.rate, 0, 100);
...
if (statutory && eligibleGross > 0) {
  if (line.vat_type === 'vatable' || line.vat_type_snapshot === 'vatable') {
    vatExemptAmount = round4(eligibleGross / (1 + VAT_RATE));   // VAT_RATE = 0.12
    vatRemoved = round4(eligibleGross - vatExemptAmount);
  } else {
    vatExemptAmount = eligibleGross;
  }
  discountAmount = round4(vatExemptAmount * 0.20);
}
```
**The 20% is a literal, not read from the configured rule's rate** — a `pos_discount_rules.rate` of
25 is silently ignored for a statutory type; a unit test asserts this deliberately.

`eligibleGross` derives from `line.global_discount_base_amount` — the line's price **after** any
per-item discount has already reduced it (`posUseCases.js:3242-3250` feeds
`itemDiscountCalculation.lines[index].global_discount_base_amount` into the governed calculation
before the statutory discount runs). **No guard exists blocking that combination.**

**Eligibility and quantity are explicit, per line** —
`apps/dgfy-api/src/modules/pos/domain/posDiscountPolicy.js:146-170` requires the item to be flagged
`senior_pwd_discount_eligible` and the selected quantity to not exceed the cart quantity. An optional
peso cap from the configured rule (`max_discount_amount`) proportionally scales the discount down if
exceeded.

**PIN authorization** is required for every governed discount type, statutory included —
`apps/dgfy-api/src/modules/pos/domain/posDiscountApprovalPolicy.js:30-47`: bcrypt-hashed 4-12 digit
PIN, self-approval blocked (`DISCOUNT_SELF_APPROVAL_BLOCKED`).

**Storefront has no statutory discount path** — grepping `apps/dgfy-storefront/src` and
`apps/dgfy-api/src/modules/store` for `senior|pwd|statutory` returns zero matches.

**Reporting gaps** (BIR `special_discount_journal`, `apps/dgfy-api/src/services/reportService.js`
around lines 1174-1202):
- Beneficiary ID is read from a JSON `special_instructions` snapshot, not from the authoritative
  `pos_transaction_discounts.senior_pwd_id_number` column.
- Fallback ID value is `entry.customer_phone` when the beneficiary block is absent — a phone number
  can print in the SC/PWD ID field.
- No VAT-exempt/VAT-removed amount is emitted per statutory line in that journal.
- A per-item (not sale-level) statutory discount does not reclassify its line as VAT-exempt in the
  `vatable_sales`/`vat_amount` rollup (`posUseCases.js:3530-3541` only consults the sale-level
  governed calculation), which can double-count VAT on that line.

## 12. Rounding and centavo handling

| Step | File:line | Expression | Mode |
|---|---|---|---|
| Peso 4dp normalize | `storeUseCases.js:138` | `Math.round(value * 10000) / 10000` | round-half |
| Peso → centavos | `storeUseCases.js:139` | `Math.round(round4(value) * 100)` | double rounding |
| Convenience fee | `dgfyConvenienceFee.js:8` | `round4(subtotal * 0.01)` | round4 |
| VAT extraction | `posDiscountCalculator.js:74` / `storeUseCases.js:1021-1022` | `round4(gross / 1.12)` | round4 |
| Checkout-time platform fee | `storeUseCases.js:3813` | `Math.round(amount * bps / 10000)` | float `Math.round` |
| Webhook-time (authoritative) platform fee | `tenantRevenueUseCases.js:47` | `(amount * bps + 5000n) / 10000n` | BigInt half-up |
| Proportional refund reversal | `tenantRevenueUseCases.js:815-819` | `(fee * refund + gross/2n) / gross` | BigInt half-up, delta-based |
| Downpayment percentage | `downpaymentPolicy.js:65` | `Math.round(total * rateBps / 10000)` | `Math.round` |

**No `Math.floor`/`Math.ceil` is used anywhere in the fee path.** Note the checkout-time platform
fee (`storeUseCases.js:3813`, float `Math.round`) and the webhook-time authoritative fee
(`tenantRevenueUseCases.js:47`, BigInt half-up) are two independently-written implementations of the
same formula — they agree at realistic centavo magnitudes, but only the webhook-time value is ever
persisted as DGFY's actual revenue.

## 13. Known POS/storefront divergences

1. **POS voucher discount base is inconsistent.** The voucher engine is given the line's raw,
   pre-item-discount price, but its resulting discount is subtracted from the already
   item-discounted base — a cart with both an item discount and a voucher can over-discount.
2. **Affiliate commission basis differs by channel** — see [§10](#10-affiliate-pricing-vs-affiliate-commission).
3. **Min-spend voucher evaluation point differs** — storefront checks against the pre-discount,
   affiliate-adjusted subtotal; POS checks against the post-item-discount subtotal. The same voucher
   code can qualify on one channel and not the other for the same cart contents.
4. **Service-fee basis differs within POS itself** — the DGFY service fee (always 0 today) would use
   the gross pre-discount subtotal, while the F&B restaurant service charge uses the net
   post-discount total, in the same order total.
5. **A storefront frontend fallback path can sum promo + voucher discounts** — a state the backend's
   own guard makes impossible — when the backend's quote result isn't available and the frontend
   recomputes locally.
6. **The reference affiliate calculation engine (`calculateAffiliateSale`), including its volume-tier
   bonus and settlement-policy conflict check, is only used in the owner-facing preview screen.**
   Live checkout re-derives commission inline and does not run either check.

---

## References

- `docs/features/TENANT_REVENUE_SETTLEMENT.md` (authoritative) — settlement mechanics this doc
  summarizes in [§4](#4-what-a-merchant-receives-and-when)
- `docs/features/DOWNPAYMENT.md` (authoritative) — downpayment lifecycle; this doc's [§2D](#2-worked-examples)
  and [§7](#7-fee-computation-both-regimes) state the fee-basis behavior that doc's own Residual
  Risks section flags as open (#817)
- [ADR 0012](../architecture/adr/0012-dgfy-global-convenience-fee-and-ui-brand-separation.md) —
  convenience fee policy and its POS-zeroing amendment
- [ADR 0033](../architecture/adr/0033-commercial-promo-and-statutory-pos-discount-boundaries.md) —
  statutory vs. commercial discount boundary, PIN authorization, single-slot rule
- [ADR 0036](../architecture/adr/0036-affiliates-program-commission-and-cashout.md) — affiliate
  commission ledger and basis
- [ADR 0050](../architecture/adr/0050-affiliate-buyer-facing-pricing-rule-engine.md) — affiliate
  pricing vs. voucher composition
- [ADR 0052](../architecture/adr/0052-tenant-revenue-collection-ledger-and-settlement.md) — the
  Regime B ledger and settlement contract
- [ADR 0066](../architecture/adr/0066-voucher-sale-time-price-resolution.md) — voucher resolution,
  the single-discount-slot rule, and the fixed-price/affiliate refusal
- Open issues: #817, #814, #872, #605, #782
