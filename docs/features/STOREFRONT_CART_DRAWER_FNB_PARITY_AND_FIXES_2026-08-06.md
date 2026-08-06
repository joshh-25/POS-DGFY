# Storefront Cart Drawer F&B Parity and Fixes — 2026-08-06

Branch: `fixes/POS-history_loadFixes`

---

## 1. Fix: unresponsive Delivery/Pickup Completed tracking view

**Files:**
- `frontend/apps/store/src/modes/fnb/tracking/components/FnbTrackingCompletedView.jsx`

**Issue:** The Reference No. / Delivered On / order-type strip on the "Completed" tracking view used a fixed 3-column grid (`gridTemplateColumns: 'repeat(3,1fr)'`) regardless of viewport, squeezing each cell too narrow on mobile. Values also used `wordBreak: 'break-all'`, which chops long text (reference numbers, dates) mid-character instead of breaking at natural boundaries.

**Fix:** Mobile now gets a single-column stacked layout (`gridTemplateColumns: '1fr'`, larger `gap: 12`); word breaking changed to `overflowWrap: 'break-word', wordBreak: 'normal'` so long values wrap at word boundaries instead of being sliced arbitrarily. Desktop is unchanged (still `repeat(3,1fr)`).

---

## 2. Fix: "Order Now" incorrectly landing on Checkout instead of the catalog

**Files:**
- `frontend/apps/store/src/StorefrontApp.jsx`

**Issue:** Clicking "Order Now" from Discovery routed F&B stores directly into the checkout tab (`resolvedInitialTab = 'checkout'`), presenting a visitor who hadn't added anything yet with an empty checkout instead of the catalog to browse. Every other mode's handler was inconsistent with this.

**Fix:** "Order Now" now always lands on the storefront's catalog section (`goStore(normalized, locationId)`, no forced checkout tab) for every mode — F&B included. If the store doesn't currently support checkout, an access-block toast is shown instead of silently placing the visitor into an unusable checkout screen.

---

## 3. Unify MSME/Retail cart drawer layout with F&B's

**Files:**
- `frontend/apps/store/src/shared/components/storefront/DefaultProductCartDrawer.jsx` (Retail)
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCartDrawerSurface.jsx` (MSME)
- `frontend/apps/store/src/shared/hooks/useDefaultProductCartDrawerProps.js`
- `frontend/apps/store/src/modes/simple/checkout/hooks/useSimpleCartDrawerProps.js`
- `frontend/apps/store/src/StorefrontApp.jsx`

**Issue:** MSME's and Retail's cart drawers were structurally different from F&B's — a simple "current total" line with no promo-code entry point, no explicit subtotal/total split, and no obvious way back into the catalog once the drawer was open.

**Fix:** Both drawers were rebuilt to match F&B's `FnbCartDrawerContent.jsx` structure: a simplified "Your Cart (N)" header (with a drag handle on mobile), an "Add more items → Browse Products" prompt row that closes the drawer and scrolls back to the catalog section, a `renderPromoCodePanel` slot for promo-code entry, and a Subtotal/Total split instead of a single total line — each mode keeping its own brand color (Retail blue, MSME teal). New props threaded through: `cartSubtotal`, `goStoreCatalogPage`, `renderPromoCodePanel`, `servicesBodyFont`.

---

## 4. Rebuild the cart line item row to match F&B's

**Files:**
- `frontend/apps/store/src/shared/components/storefront/DefaultProductCartLineItem.jsx` (Retail)
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCartLineItem.jsx` (MSME)

**Issue:** MSME's and Retail's individual cart line items were bordered, boxed cards with a separate "Qty N" pill tag and standalone circular +/- buttons — visually inconsistent with F&B's inline row style.

**Fix:** Rebuilt to match F&B's inline cart line item: divider-separated rows instead of individual bordered cards, a quantity badge overlaid directly on the item's thumbnail image instead of a separate pill tag, a `Package` icon placeholder for missing images (was plain "No image" text), and the +/- controls unified into a single pill-shaped stepper group instead of two separate floating circular buttons. Each mode keeps its own accent color on the quantity badge (Retail blue, MSME's existing teal).

---

## 5. Add the fly-to-cart animation for MSME and Retail

**Files:**
- `frontend/apps/store/src/shared/hooks/useCartMutations.js`
- `frontend/apps/store/src/shared/components/StorefrontCartFlyAnimations.jsx`
- `frontend/apps/store/src/app/pages/StorefrontCartDrawerShellContainer.jsx`
- `frontend/apps/store/src/shared/components/storefront/DefaultProductCartFab.jsx`
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCartFloatingButton.jsx`

**Issue:** Adding an item to the cart only played the "fly to cart" animation for Services and F&B mode (`animateCartCardToFab` was gated to `isServicesMode || isFnbMode`); MSME and Retail added items to the cart with no visual feedback at all.

**Fix:**
- `useCartMutations.js` — the animation gate now includes `isRetailMode || isSimpleMode`.
- `StorefrontCartFlyAnimations.jsx` — generalized from a hardcoded F&B-vs-everyone-else color/icon switch to configurable `accentColor`/`accentSoft`/`accentStrong`/`borderColor`/`icon` props, so each mode can supply its own look.
- `StorefrontCartDrawerShellContainer.jsx` — now renders the animation for Retail and MSME too, passing each mode's own accent (F&B orange, Retail blue, MSME teal) and a `ShoppingCart` icon.
- `DefaultProductCartFab.jsx` / `SimpleCartFloatingButton.jsx` — both forward a new `fabRef` prop so the animation has a real DOM element to land on (the button's own position), matching how the existing Services/F&B FAB ref already worked.
