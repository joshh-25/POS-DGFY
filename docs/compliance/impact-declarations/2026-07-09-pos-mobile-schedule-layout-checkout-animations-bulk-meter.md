---
status: reference
owner: engineering
last_reviewed: 2026-07-09
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-09-pos-mobile-schedule-layout-checkout-animations-bulk-meter
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.09
verification_evidence: npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the catalog-slide-enter CSS class and .qty-meter styles in index.css, the flyImageToCheckoutBar helper and long-press quantity-meter handlers (handleQtyButtonPointer*) plus qtyMeterState/qtyMeterGestureRef in POSCheckoutTerminal.jsx, the max-sm:animate-pos-slide-in -> catalog-slide-enter className swaps in TerminalOperationsWorkspace.jsx and TerminalPageLayout.jsx, and the Schedule Sets/Applies-to mobile grid layout in StorefrontBusinessHoursScheduler.jsx; all new entry points call the existing, unmodified addToCart/updateCartQuantity/adjustCartQuantity functions, so rollback carries no data or calculation risk.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-09T00:00:00+08:00
preflight_request_ref: POS-MOBILE-SCHEDLAYOUT-CHECKOUT-ANIM-BULK-METER-2026-07-09
---

# POS Mobile Schedule Layout, Page/Checkout Animations, and Bulk-Buy Quantity Meter

## Compliance Impact Classification

Major. This change reworks the mobile layout of the Storefront Business Hours "Schedule Sets" and "Applies to" (time set) sections, replaces the prior Tailwind `pos-slide-in` page-transition animation with a plain-CSS `catalog-slide-enter` animation (also used for the "item added to cart" fly-to-checkout-bar effect), and adds a mobile long-press "bulk buy" quantity meter on the catalog `+` button. The quantity meter and its release handler funnel into the existing, already-declared `adjustCartQuantity` function (which itself calls `addToCart`/`updateCartQuantity`) — no new cart-mutation or calculation logic is introduced, only a new gesture (tap vs. long-press-drag) that decides how many units to pass to that existing function in one call. Classified `major` per the `pos`/`terminal` surface floor since the POS-surface files are the ones triggering the guardrail; `frontend/src/features/settings/StorefrontBusinessHoursScheduler.jsx` and `frontend/src/index.css` are not compliance-sensitive paths themselves but are described here for completeness since they are part of the same change.

## Affected Surfaces

1. `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`:
   - **Bulk-buy quantity meter**: the catalog `+` button now supports pointer-down/move/up/cancel handlers (`handleQtyButtonPointerDown/Move/Up/Cancel`). A tap (release before 300ms with no drag past 10px) still adds exactly 1, with no added delay. Holding past 300ms shows a fixed, portaled `.qty-meter` overlay anchored to the button; dragging upward (never downward past 1) scales the pending quantity from 1 to 20 over ~96px of drag, and the full quantity is committed in a single `adjustCartQuantity(item, quantity)` call on release.
   - **Add-to-cart animation**: `flyImageToCheckoutBar` clones the tapped item's `.product-image`, animates it (Web Animations API, transform/opacity only) from the catalog card to the mobile checkout bar (`#checkout-bar`/`#checkout-bar-button`), and removes itself on finish. It fires strictly after the cart update, is mobile-only (`matchMedia(max-width: 639.98px)`), and silently no-ops if not mobile, no image, or no checkout bar target — it never blocks, delays, or can throw into the add-to-cart path.
   - **Page-switch animation**: the Sell/History view wrappers switch from the Tailwind `max-sm:animate-pos-slide-in` utility to a plain CSS class `catalog-slide-enter` (defined in `index.css`), same translateX/opacity entrance, mobile-gated via a `max-width: 639.98px` media query instead of Tailwind's `max-sm:` variant.
2. `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx` and `frontend/src/features/pos/components/TerminalPageLayout.jsx` — the same `max-sm:animate-pos-slide-in` → `catalog-slide-enter` className swap on the operations-workspace and checkout-workspace keyed wrappers; purely a rename/reimplementation of the existing mobile page-transition animation, no change to which wrapper remounts or when.
3. `frontend/src/index.css` — adds the `catalog-slide-enter` keyframe/class (mobile-only media query, transform/opacity only, replacing the Tailwind config keyframe used previously) and the `.qty-meter`/`.qty-meter__value`/`.qty-meter__track`/`.qty-meter__fill` styles for the fixed, portaled long-press quantity overlay.
4. `frontend/src/features/settings/StorefrontBusinessHoursScheduler.jsx` — mobile-only (`sm:hidden`/`max-sm:`) layout changes to the "Applies to" day-chip row (2-column grid instead of wrap) and the "Schedule Sets" list (time range + Remove button on one row, selected-day chips in a 2-column grid below, versus the original 3-column table row). The original desktop/tablet 3-column table layout is preserved unchanged behind `hidden ... sm:grid` / `sm:flex`. No change to `setSelectedDays`, `setDaySelected`, `handleRemoveSet`, or any schedule data/validation logic — only markup structure and mobile-gated classes.

## Compliance Preconditions

1. `adjustCartQuantity`, `addToCart`, and `updateCartQuantity` are called unmodified by the new long-press gesture; stock clamping, zero-quantity removal, and cart total recalculation remain centralized in those existing functions.
2. The long-press quantity meter clamps quantity to the range 1–20 (`QTY_METER_MIN_QTY`/`QTY_METER_MAX_QTY`) and only commits once, on pointer release, via a single `adjustCartQuantity` call — it cannot commit a fractional, negative, or partial-drag quantity.
3. `flyImageToCheckoutBar` is purely cosmetic: it runs after the cart state update, never blocks it, and cannot fail the add-to-cart action if the image/target/animation API is unavailable (all failure paths return early with no side effect).
4. Checkout totals, VAT breakdown, DGFY fee calculation, payment method handling, discounts, and order submission behavior remain unchanged.
5. Schedule Sets / time-set day selection, removal, and persistence logic (`setSelectedDays`, `setDaySelected`, `handleRemoveSet`, `scheduleSets`) is unchanged; only the mobile presentation of existing controls changes.
6. Desktop/tablet (`>=640px`) rendering for both the POS catalog/page-transition animations and the Business Hours scheduler is pixel-equivalent to pre-change behavior (`sm:`/`xl:`-gated fallbacks preserve the prior structure).

## Verification Evidence

The commands listed in front matter must pass before deployment. Manual verification: on a mobile viewport, confirm tapping the catalog `+` button still adds exactly 1 unit instantly; confirm holding it shows the vertical quantity meter and dragging up increases the pending quantity up to 20, committing on release; confirm the item image animates from the catalog card to the mobile checkout bar on both tap-add and long-press-add; confirm Sell/History and workspace page switches still animate; confirm the Business Hours "Applies to" chips and "Schedule Sets" rows render in the new 2-column mobile layout while desktop/tablet is unchanged.
