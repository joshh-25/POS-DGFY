---
status: reference
owner: engineering
last_reviewed: 2026-07-03
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-03-pos-mobile-catalog-quantity-stepper
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.03
verification_evidence: npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the mobile catalog quantity stepper (adjustCartQuantity/commitManualCartQuantity, editingQuantityItemId/quantityInputValue state, and the +/- and tap-to-type UI), and revert the cart-line Qty cell back to always showing the +/- control instead of a read-only value on mobile; addToCart and updateCartQuantity themselves are untouched, so rollback carries no data or calculation risk.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-03T00:00:00+08:00
preflight_request_ref: POS-MOBILE-CATALOG-QUANTITY-STEPPER-2026-07-03
---

# POS Mobile Catalog Quantity Stepper

## Compliance Impact Classification

Major. This change adds a new mobile-only (`<640px`) quantity control directly on each catalog card: a `-` button, a tap-to-type quantity field, and a `+` button. It also changes the cart-line "Qty" cell in the mobile cart summary from an editable `+/-` control to a read-only quantity display, since quantity is now managed from the catalog card instead. Both new entry points call the existing, centralized `addToCart` and `updateCartQuantity` functions rather than reimplementing stock clamping, zero-quantity removal, or cart totals — no new quantity-mutation logic is introduced. Classified `major` per the `pos`/`terminal` surface floor, and because this touches cart-quantity interaction (not pure layout), it is treated as `major` rather than a lower classification even though the underlying mutation path is unchanged.

## Affected Surfaces

1. `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` — mobile catalog card gains `adjustCartQuantity(item, delta)` (calls `addToCart`/`updateCartQuantity`) and `commitManualCartQuantity(item)` (parses and commits a typed value via `updateCartQuantity`, or `addToCart` if the line doesn't exist yet). New local state: `editingQuantityItemId`, `quantityInputValue`. The mobile catalog card layout is also simplified: the VAT row, stock-status dot, and SKU code are removed from the mobile card face; "Always available" now renders only when true (no "Not set"/stock-number placeholder in that slot).
2. Mobile cart-line "Qty" cell — now read-only (`formatQuantity(line.quantity)`) on `<640px`; the `+/-` control is preserved unchanged at `sm:` and above (`hidden ... sm:flex`).

## Compliance Preconditions

1. `addToCart` and `updateCartQuantity` are called unmodified — stock clamping, zero-quantity line removal, and cart total recalculation continue to be centralized in those existing functions.
2. Checkout totals, VAT breakdown, DGFY fee calculation, payment method handling, discounts, and order submission behavior remain unchanged.
3. The manual quantity input is sanitized to digits only (`replace(/[^0-9]/g, '')`, `Math.max(0, Math.floor(...))`) before being passed to `updateCartQuantity`/`addToCart`; it cannot submit a negative or non-numeric value.
4. Tapping the stepper controls or the quantity field uses `event.stopPropagation()` so it cannot also trigger the catalog card's own `onClick`/`onKeyDown` add-to-cart handler (which would otherwise double-add the item).
5. `+` and manual-entry-open are disabled when the item is out of stock or POS actions are blocked (`posActionsBlocked`); `-` is disabled once quantity reaches 0.
6. Desktop/tablet (`>=640px`) catalog card content and the cart-line `+/-` control are unchanged.

## Verification Evidence

The commands listed in front matter must pass before deployment. Manual verification: on a mobile viewport, confirm `+`/`-` on a catalog card adds/removes one unit of the item in the cart, confirm tapping the quantity number opens a numeric input that commits on blur/Enter, confirm out-of-stock items cannot be incremented, and confirm the cart summary's Qty cell is read-only on mobile while the desktop `+/-` control still works unchanged at `>=640px`.
