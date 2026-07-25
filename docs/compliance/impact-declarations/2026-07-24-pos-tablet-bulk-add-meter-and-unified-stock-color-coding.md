---
status: reference
owner: engineering
last_reviewed: 2026-07-24
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-24-pos-tablet-bulk-add-meter-and-unified-stock-color-coding
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.24
verification_evidence: npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the cart-line "+" button's !isMobile && !isTabletViewport gate back to excluding tablet (restoring its plain onClick +1 button) and the isTabletViewport h-10/px-3 touch-target sizing, and revert getMobileStockNameColorClassName/getDesktopStockNameColorClassName back to two separate functions with the prior >100/>1000 thresholds applied per viewport; updateCartQuantity/addToCart and all cart/checkout calculation logic are untouched, so rollback carries no data or calculation risk.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-24T00:00:00+08:00
preflight_request_ref: POS-TABLET-BULK-ADD-METER-UNIFIED-STOCK-COLOR-2026-07-24
---

# POS Tablet Bulk-Add Meter and Unified Stock Color Coding

## Compliance Impact Classification

Major. This change extends the existing long-press bulk-add quantity meter on the Current Sale cart line's `+` button to tablet (previously desktop-only), and unifies the Sell Catalog item name stock-color-coding logic into a single shared function applied identically across mobile, tablet, and desktop (previously desktop used a different, inconsistent threshold from mobile, and tablet had no dynamic color coding at all). The bulk-add meter continues to commit through the existing, unmodified `updateCartQuantity` function — no new cart-mutation logic is introduced. Classified `major` per the `pos`/`terminal` surface floor since `POSCheckoutTerminal.jsx` is a POS-surface file.

## Affected Surfaces

`frontend/src/features/pos/components/POSCheckoutTerminal.jsx`:

1. **Tablet bulk-add meter**: the Current Sale cart line's `+` button gate changes from `!isMobile && !isTabletViewport` (desktop-only) to `!isMobile` (tablet and desktop). Tablet now gets the same long-press-then-drag-up bulk-add gesture as desktop — `handleCartQtyButtonPointerDown/Move/Up/Cancel`, the shared `qtyMeterState`/`qtyMeterGestureRef`/`qtyMeterTimerRef` state, and the existing `.qty-meter` portal — with identical gesture timing, drag scaling, and the 0–20 quantity range; no logic is duplicated. A plain tap still adds exactly `+1` (committed inside `handleCartQtyButtonPointerUp`, so there is no separate `onClick` that could double-add). Tablet's `-`/quantity-display/`+` controls are sized slightly larger (`h-10`/`px-3`) than desktop's (`h-8`/`px-2`) for easier touch input; this is a touch-target sizing change only, not a functional one. Mobile is unaffected — its cart-line quantity remains read-only (managed from the catalog card's own stepper instead).
2. **Unified stock color coding**: `getMobileStockNameColorClassName` and `getDesktopStockNameColorClassName` are collapsed into a single function (kept under the `getMobileStockNameColorClassName` name for now), applied identically to the catalog item name on every viewport via one shared `stockNameColorClassName` value (previously two separately-computed values, `mobileStockNameColorClassName` and `desktopStockNameColorClassName`, applied to different viewports with different thresholds). The unified thresholds are: always-available/service items always green; stock `>= 100` green (previously mobile used `> 100`, so a stock value of exactly 100 now reads green instead of yellow); `0 <` stock `< 100` yellow; stock `<= 0` or invalid/missing red. Desktop's prior separate `> 1000` green threshold is removed — desktop now uses the same `>= 100` threshold as mobile/tablet, and tablet (which previously showed a flat, non-color-coded name) now gets the same dynamic color coding as mobile/desktop. No new colors are introduced.

## Compliance Preconditions

1. `updateCartQuantity`/`addToCart` are called unmodified by the tablet bulk-add meter; stock clamping, zero-quantity removal, and cart total recalculation remain centralized in those existing functions.
2. The tablet bulk-add meter clamps quantity the same way the existing mobile/desktop meters do (via the shared `QTY_METER_MIN_QTY`/`QTY_METER_MAX_QTY` constants and gesture state) and commits in a single `updateCartQuantity` call on release; it cannot commit a fractional, negative, or partial-drag quantity.
3. Checkout totals, VAT breakdown, DGFY fee calculation, payment method handling, discounts, and order submission behavior remain unchanged.
4. The stock color coding change is a display-only recoloring of the item name text; it does not alter `current_stock`, inventory, or any backend value, and does not affect whether an item can be added to the cart or checked out.
5. Mobile's cart-line quantity display and catalog-card stepper behavior are unchanged; mobile does not render the cart-line `+`/`-` bulk-add controls at all.

## Verification Evidence

The commands listed in front matter must pass before deployment. Manual verification: on a tablet viewport, confirm long-pressing the Current Sale cart line's `+` button shows the bulk-add meter and dragging up scales the pending quantity, committing on release, while a quick tap still adds exactly 1; confirm the tablet cart-line `-`/quantity/`+` controls render at the larger touch-target size. Across mobile, tablet, and desktop, confirm catalog item names are colored consistently: green at stock `>= 100` or always-available/service, yellow at `1-99`, red at `0` or invalid stock.
