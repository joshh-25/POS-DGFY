---
status: reference
owner: engineering
last_reviewed: 2026-07-11
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-11-pos-bulk-add-meter-zero-floor
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.11
verification_evidence: npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert QTY_METER_MIN_QTY from 0 back to 1, revert the gesture.quantity <= 0 early-return guard in handleQtyButtonPointerUp, and revert the qty-meter__fill height calculation back to the hardcoded (quantity - 1) / 19 formula; adjustCartQuantity itself is untouched, so rollback carries no data or calculation risk.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-11T00:00:00+08:00
preflight_request_ref: POS-BULK-ADD-METER-ZERO-FLOOR-2026-07-11
---

# POS Bulk-Add Quantity Meter Zero Floor

## Compliance Impact Classification

Major. This change lowers the mobile long-press bulk-add quantity meter's minimum draggable value from 1 to 0, so dragging the meter all the way back down now cancels the bulk-add instead of committing a minimum of 1 unit. The commit path still funnels through the existing, unmodified `adjustCartQuantity` function; the only new logic is an early-return guard that skips the commit (and the fly-to-checkout-bar animation) entirely when the released quantity is 0. Classified `major` per the `pos`/`terminal` surface floor since `POSCheckoutTerminal.jsx` is a POS-surface file.

## Affected Surfaces

1. `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` — `QTY_METER_MIN_QTY` changes from `1` to `0` (range is now 0–20 instead of 1–20 over the same ~96px drag). `handleQtyButtonPointerUp` gains a `gesture.quantity <= 0` guard: if the finger is dragged back down to 0 before release, the long-press is treated as a cancel — no `adjustCartQuantity` call and no fly-to-checkout-bar animation fire. The `.qty-meter__fill` height calculation is generalized from the hardcoded `(quantity - 1) / 19` to `(quantity - QTY_METER_MIN_QTY) / (QTY_METER_MAX_QTY - QTY_METER_MIN_QTY)`, so the fill bar continues to scale correctly across the new 0–20 range.

## Compliance Preconditions

1. `adjustCartQuantity` (and the `addToCart`/`updateCartQuantity` functions it calls) remain unmodified — stock clamping, zero-quantity removal, and cart total recalculation continue to be centralized there.
2. A released quantity of 0 results in no cart mutation and no animation — it is a pure cancel, not a call that adds/removes 0 units.
3. A quick tap (released before the 300ms long-press threshold) is unaffected and still adds exactly 1 unit, since that path does not go through `QTY_METER_MIN_QTY` at all.
4. Checkout totals, VAT breakdown, DGFY fee calculation, payment method handling, discounts, and order submission behavior remain unchanged.
5. Desktop/tablet (`>=640px`) behavior is unchanged, since the bulk-add meter is mobile-only.

## Verification Evidence

The commands listed in front matter must pass before deployment. Manual verification: on a mobile viewport, long-press the catalog `+` button, drag up to increase the pending quantity, then drag all the way back down to 0 and release — confirm nothing is added to the cart and no fly animation plays; confirm dragging to any value 1–20 and releasing still adds that exact quantity in one step; confirm a quick tap still adds exactly 1 unit.
