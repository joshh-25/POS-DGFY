---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-04-23
last_reviewed: 2026-09-04
review_by: 2026-10-23
applies_to: architecture_decision
topic: dgfy_global_convenience_fee_and_ui_brand_separation
---

# ADR 0012: DGFY Global Convenience Fee and UI Brand Separation

## Status
Accepted (2026-04-23)

## Context
POS and storefront checkout previously depended on order-method fee matrices (`pos_order_method_fees`) and POS payload override behavior (`service_fee_amount`). This created cross-surface pricing drift and inconsistent receipt labels. At the same time, UI rebranding requirements need DGFY-facing names without mutating legal fiscal issuer metadata used for compliance.

## Decision
Adopt one mandatory cross-surface fee policy and branding split:

1. Pricing policy
   - `service_fee_amount = round4(gross_subtotal * 0.01)` for all new POS/storefront transactions.
   - POS total: `(gross_subtotal - discount_amount) + service_fee_amount`.
   - Storefront total: `gross_subtotal + delivery_fee + service_fee_amount`.
   - Fee label snapshot: `DGFY convenience fee`.
   - Fee override is retired; runtime ignores caller `service_fee_amount`.
2. Snapshot persistence and compatibility
   - Keep existing DB fields and exports: `service_fee_*`.
   - Persist `service_fee_overridden=false` for new transactions.
   - Keep `service_fee_method_snapshot` from order method for traceability.
   - Forward-only behavior: no historical recompute/backfill.
3. Branding separation
   - Operator/customer UI branding uses `DGFY`.
   - Legal/fiscal issuer fields (`pos_business_name`, TIN/PTU/MIN/accreditation, etc.) remain unchanged and visible where required.
   - Receipt footer appends exact line: `Discover Goods For You`.
4. Settings behavior
   - `pos_order_method_fees` is deprecated for runtime pricing.
   - Setting remains read-compatible for historical rows only; editing UX is removed.

## Consequences
1. Cross-boundary consistency improves (POS + storefront + reports + receipts) with one fee engine.
2. Legacy clients sending `service_fee_amount` remain compatible, but value is ignored.
3. Compliance math remains unchanged: service fee stays non-VAT in VAT buckets/exports.
4. Future pricing customization now requires explicit governance (new ADR) instead of settings-level mutation.

## Amendments

### 2026-08-19 — POS cashier fee policy clarification

- POS cashier checkout is an in-store transaction and does not charge a DGFY convenience fee. Its effective `service_fee_amount` is `0`, and the cashier total excludes that fee.
- The Storefront online-order fee policy remains unchanged at `round4(gross_subtotal * 0.01)`.
- POS transaction history and POS receipt renderers must not display a DGFY convenience-fee row. Existing `service_fee_*` columns, snapshots, and historical values remain for schema compatibility and auditability; no historical backfill or recomputation is allowed.
- Restaurant service-charge accounting remains separate from the DGFY convenience fee and continues to appear where the F&B receipt contract requires it.

### 2026-09-02 — Storefront delivery-fee term becomes a resolved breakdown (Phase 237, #1329)

- The storefront total formula's shape is unchanged:
  `total = gross_subtotal + delivery_fee + service_fee_amount` (Decision 1, third bullet), with
  promo/voucher discounts folded in ahead of it exactly as today. Only the *derivation* of the
  `delivery_fee` term changes.
- `delivery_fee` is no longer read directly from the `store_delivery_fee` setting. It is the
  `finalFee` of a resolved delivery-fee breakdown:
  `delivery_fee = max(0, base − waiver)`, and **an override, when present, replaces that result
  outright rather than adjusting it**. `null` means no override; `0` means an override that set
  the fee to zero — the two are never conflated.
- `base` is produced by the tenant's configured delivery-fee mode per ADR 0078 Decision 1
  (`fixed` | `calculated` | `free`), with ADR 0078 Decision 2's `[binding]` fail-open-to-fixed
  applying on any provider, address, or formula-config failure. `waiver` is `0` until #240
  (`free_delivery` voucher benefit) populates it; `override` is `null` until a resolve-time
  override source exists — Phase 238 (#1330) overrides the persisted `pos_transactions.delivery_fee`
  post-hoc and is not a resolve-time input.
- POS cashier checkout is unaffected: the 2026-08-19 amendment above stands unchanged, and the
  delivery-fee-mode work is storefront-only (#1322 decision #6). POS-created delivery orders
  (`dispatchOrders`) keep their own existing fee path.
- Forward-only, consistent with Decision 2: no historical recompute or backfill of `delivery_fee`
  on existing `pos_transactions` rows. New sibling columns
  (`delivery_fee_mode`, `delivery_fee_base`, `delivery_fee_waiver`, `delivery_fee_override`,
  `delivery_fee_calc_version`) are additive and default to the values that describe pre-237
  behavior exactly (`fixed` / `0` / `0` / `NULL` / `1`).
- The `service_fee_amount` policy, its `round4(gross_subtotal * 0.01)` derivation, the fee-label
  snapshot, and every branding/fiscal clause in this ADR are untouched by this amendment.

### 2026-09-04 — The persisted delivery-fee override is written, and the invariant has two halves (Phase 281, #1564)

- Corrects the 2026-09-02 amendment above on one point of fact, not of policy. That amendment
  described `override` as "`null` until a resolve-time override source exists — Phase 238 (#1330)
  overrides the persisted `pos_transactions.delivery_fee` post-hoc and is not a resolve-time
  input." The first half is unchanged and remains correct. The second half described a persisted
  write that **was never actually implemented**: Phase 238's use case wrote `delivery_fee` and
  `total_amount` and left `pos_transactions.delivery_fee_override` at `NULL`. Every override
  applied between Phase 238 and this amendment therefore produced a row in which
  `delivery_fee_base - delivery_fee_waiver !== delivery_fee` while `delivery_fee_override` still
  read `NULL` — a silently violated invariant with no column able to explain it. That write now
  exists (`apps/dgfy-api/src/modules/pos/usecases/deliveryFeeOverrideUseCases.js`).
- **The persisted invariant is restated with both halves explicit**, because the single-clause form
  above invited exactly the reading that went wrong — that the `override IS NULL` case was the only
  case worth stating:
  - `delivery_fee_override IS NULL` → `delivery_fee_base - delivery_fee_waiver === delivery_fee`.
  - `delivery_fee_override IS NOT NULL` → `delivery_fee === delivery_fee_override`, and
    `delivery_fee_base`/`delivery_fee_waiver` are **retained as the pre-override provenance and
    deliberately no longer reconcile**. This is the amendment above's "an override, when present,
    replaces that result outright rather than adjusting it", stated on the persistence side rather
    than only on the resolver's.
  A reader finding the first half violated must check `delivery_fee_override` before concluding the
  row is corrupt.
- **`resolveStoreDeliveryFee` does not gain an override input, and this is the settled model, not a
  deferral.** #1564 required this be decided rather than assumed. The override corrects an
  already-persisted transaction after checkout; there is no live quote for it to feed back into.
  Accepting one at resolve time would force that function to read persisted state, breaking the
  I/O-free, `await`-free contract its own header and its byte-identity regression tests rely on, and
  would add a second writer to ADR 0078 Decision 4's single storefront choke point. Its
  `overrideAmount: null` is the truthful value at resolve time, not a placeholder awaiting a source.
- **Forward-only, unchanged.** No backfill or recompute of rows written before this correction
  (Decision 2, and the 2026-09-02 amendment's own forward-only clause). A pre-#1564 row whose fee
  was overridden but whose provenance column stayed `NULL` is instead repairable in place through
  the same permissioned, reasoned, audited endpoint: resubmitting the fee the row already carries
  now stamps `delivery_fee_override` and moves no money.
- The totals formula's shape, the `service_fee_amount` policy, POS cashier checkout, and every
  branding/fiscal clause in this ADR are untouched by this amendment.
