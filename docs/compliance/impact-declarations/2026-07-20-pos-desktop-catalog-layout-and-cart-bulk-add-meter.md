---
status: reference
owner: engineering
last_reviewed: 2026-07-20
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-20-pos-desktop-catalog-layout-and-cart-bulk-add-meter
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.07.20
verification_evidence: npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert getDesktopStockNameColorClassName and its use on the desktop catalog item name, revert availableCatalog's isMobile || !isTabletViewport condition back to isMobile-only, revert the tablet-only SKU gating and the desktop price-only branch (restoring the Stock/Price/VAT grid for desktop), revert the xl:auto-rows-[13.5rem]/xl:h-[13.5rem] card sizing and the mt-auto pt-3 price positioning, and revert handleCartQtyButtonPointerDown/Move/Up/Cancel plus the cart-line "+" button's isMobile/isTabletViewport branch in POSCheckoutTerminal.jsx; revert the order-1..9 utility classes and the order-5/xl:order-6 <-> order-6/xl:order-5 swap between Best Seller and Selling Price in TerminalOperationsWorkspace.jsx; addToCart/updateCartQuantity and all cart/checkout calculation logic are untouched throughout, so rollback carries no data or calculation risk.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-20T00:00:00+08:00
preflight_request_ref: POS-DESKTOP-CATALOG-LAYOUT-CART-BULK-ADD-METER-2026-07-20
---

# POS Desktop Catalog Layout and Cart Bulk-Add Meter

## Compliance Impact Classification

Major. This change extends several existing mobile-only POS behaviors to true desktop (`xl:`, `>=1280px`) viewports: stock-level name color coding, out-of-stock item visibility in the Sell catalog, a simplified item card layout, and the long-press bulk-add quantity meter (now also on the Current Sale cart line's `+` button). It also reorders two fields in the item edit form so "Best Seller" sits in the right column on desktop. All new quantity-mutation entry points funnel through the existing, unmodified `updateCartQuantity`/`addToCart` functions — no new cart-mutation or calculation logic is introduced. Classified `major` per the `pos`/`terminal` surface floor since both files are POS-surface components.

## Affected Surfaces

### `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`

1. **Desktop stock color coding**: `getDesktopStockNameColorClassName(stockValue, isAlwaysAvailable)` mirrors the existing mobile-only `getMobileStockNameColorClassName` (same three colors, no new colors introduced) but with desktop-specific thresholds: green for always-available/service items or stock `> 1000`, yellow for `1–999`, red for `0` or invalid/missing stock. Applied to the catalog item name only when the viewport is neither mobile nor tablet (`isTabletViewport` is false) — tablet keeps its existing static name color untouched.
2. **Out-of-stock visibility**: `availableCatalog` now includes out-of-stock items when `isMobile || !isTabletViewport` (mobile **and** true desktop), instead of only `isMobile`. Tablet (`isTabletViewport`) is the only viewport that still filters out-of-stock items out of the Sell catalog entirely; out-of-stock items on mobile/desktop remain visible but locked/grayed via the existing `isOutOfStock` card handling — this is a presentation-only change, the API remains the stock authority and checkout still revalidates inventory server-side.
3. **Simplified desktop card**: the product-code/SKU line is now rendered only when `isTabletViewport` is true (previously shown on any non-mobile viewport). True desktop gets a new price-only branch (`PHP {price}` or "Not set") in place of the tablet/prior desktop Stock/Price/VAT grid; tablet's Stock/Price/VAT grid is unchanged. The card's existing opacity/blur styling and "Out of stock" image overlay still communicate unavailability without the removed metadata line.
4. **Card height + price position**: the desktop catalog grid's row height and card height both increase to `xl:auto-rows-[13.5rem]`/`xl:h-[13.5rem]` (from `xl:h-full`, tied to the parent's `xl:grid-cols-4/5`). The desktop price line uses `mt-auto pt-3` instead of a fixed top margin, pinning it to the bottom of the card regardless of how many tags (Best Seller, etc.) render above it.
5. **Cart-line bulk-add meter (desktop only)**: `handleCartQtyButtonPointerDown/Move/Up/Cancel` reuse the exact same `qtyMeterState`/`qtyMeterGestureRef`/`qtyMeterTimerRef` state, the same `QTY_METER_*` constants, and the existing `.qty-meter` portal already used by the mobile catalog's long-press meter — same long-press-then-drag-up gesture and visual meter, wired to the Current Sale cart line's `+` button. The only difference is the commit step: the catalog button adds/creates a line via `adjustCartQuantity`, while the cart-line button already has a line and instead calls `updateCartQuantity(lineKey, currentQuantity + gesture.quantity)`. A plain tap still adds exactly `+1` (handled inside `handleCartQtyButtonPointerUp`, so there is no separate `onClick` that could double-add). Mobile and tablet keep the original plain `onClick` `+1` button, untouched.

### `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx`

6. **Best Seller Auto-Tagging Settings panel**: reviewed and confirmed it already renders unrestricted on desktop (no `sm:hidden`/viewport gating on its wrapper) — no code change was needed or made for this item.
7. **Best Seller item-form toggle (edit form)**: visibility changes from mobile-only (`sm:hidden`) to `sm:hidden xl:flex` (mobile and true desktop; tablet, which both POS tablet definitions cap below 1280px, still does not render it). Explicit `order-1` through `order-9` utility classes are added to all 9 grid fields in the edit form to lock in today's natural DOM order on mobile/tablet (where no `xl:` override is active), and Best Seller (`order-5 xl:order-6`) is swapped against Selling Price (`order-6 xl:order-5`) so Best Seller renders in the right column next to Selling Price on desktop only.

## Compliance Preconditions

1. `addToCart` and `updateCartQuantity` are called unmodified by every new entry point (desktop catalog `+`, desktop cart-line `+`, both long-press and tap); stock clamping, zero-quantity removal, and cart total recalculation remain centralized in those existing functions.
2. Checkout totals, VAT breakdown, DGFY fee calculation, payment method handling, discounts, and order submission behavior remain unchanged.
3. Making out-of-stock items visible on desktop (like mobile) is a Sell-catalog presentation change only; the card's existing `isOutOfStock` locked/grayed state, the API's stock authority, and server-side checkout revalidation are all unchanged, so an out-of-stock item still cannot be successfully checked out.
4. The desktop cart-line bulk-add meter clamps quantity the same way the mobile catalog meter does (via the shared `QTY_METER_MIN_QTY`/`QTY_METER_MAX_QTY` constants and gesture state) and commits in a single `updateCartQuantity` call on release; it cannot commit a fractional, negative, or partial-drag quantity.
5. Removing the SKU/Stock-Price-VAT grid from the desktop card face is a display simplification only — no underlying item, stock, or pricing data is altered, and the full detail remains available via other existing surfaces (e.g. Items management).
6. Tablet (`isTabletViewport`) behavior — out-of-stock filtering, card layout, SKU display, the plain `+1` cart button, and the Best Seller field's non-visibility — is unchanged by this entire change set.
7. The Best Seller edit-form field reorder is presentational only (`order-*` utility classes); the field's underlying value, validation, and submission behavior are unchanged.

## Verification Evidence

The commands listed in front matter must pass before deployment. Manual verification: on a true desktop viewport (`>=1280px`), confirm catalog item names are color-coded green/yellow/red by the new desktop stock thresholds; confirm out-of-stock items remain visible (locked/grayed) in the catalog instead of being hidden; confirm the catalog card shows only the price (no SKU/Stock/VAT grid) and the price stays bottom-pinned regardless of tag count; confirm long-pressing the Current Sale cart line's `+` button shows the same bulk-add meter as the catalog and commits the dragged quantity on release, while a quick tap still adds exactly 1; confirm the Best Seller toggle appears in the edit-item form's right column next to Selling Price. Confirm tablet viewports are pixel-and-behavior-unchanged throughout.
