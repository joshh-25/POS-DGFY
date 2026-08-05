# MSME Retail-Parity Port — 2026-08-03

Covers everything implemented since the prompt: *"First, document the changes. Second, implement them to MSMEs as well. For shared components, let MSMEs use them. For separate, use the MSME's used components."* — i.e. porting the six retail catalog/promo/checkout enhancements (documented separately in `RETAIL_CATALOG_PROMO_CHECKOUT_ENHANCEMENTS_2026-08-03.md`) to MSME, plus two follow-up bugs found and fixed afterward. Structure: Task / Description / Files Created / Files Deleted / Files Changed / Additional Notes.

---

## Task 1: MSME catalog header/toolbar — adopt the shared component

### Description
MSME already had its own hardcoded "Product Section" header block (eyebrow, heading, subtitle, product-count pill) inline in `StorefrontClassicCatalog.jsx`, with no search/sort/category toolbar at all. Per the "shared components → let MSME use them" instruction, MSME was folded into `showsCatalogToolbar` (already shared between F&B and retail) instead of building a second parallel header, and its inline header block was deleted outright since the shared toolbar now covers the same job with MSME's own copy and teal color scheme.

### Files Deleted
None (deletion was inline, see Files Changed).

### Files Changed
- `frontend/apps/store/src/shared/components/storefront/StorefrontClassicCatalog.jsx`:
  - `showsCatalogToolbar` changed from `isFnbMode || isRetailMode` to `isFnbMode || isRetailMode || isSimpleMode`.
  - Deleted the ~50-line inline `isSimpleMode && (<div>...Product Section header + count pill...</div>)` block entirely — now dead code once the shared toolbar renders for MSME.
  - Section-header suppression condition extended: `((!isFnbMode && !isSimpleMode) || isMultiGroup)` → `((!isFnbMode && !isSimpleMode && !isRetailMode) || isMultiGroup)` (this specific edit was for retail; MSME was already covered by the pre-existing `!isSimpleMode` clause).
- `frontend/apps/store/src/app/runtime/modePresentationRegistry.js` — msme entry gained `catalogEyebrow: 'Product Section'` (preserves the exact wording MSME's old inline header used, so the copy is byte-identical after the swap) and `heroTheme` gained `surfaceInset: '#ecfeff'`, `borderSoft: '#bfe8e4'`, `textPrimary: '#0f172a'`, `textMuted: '#64748b'` (previously only read via fallback defaults inside the now-deleted inline block; the shared toolbar needs them as real theme values).
- `frontend/apps/store/src/app/pages/StorefrontCatalogRouteContainer.jsx` — no MSME-specific change needed here: `usesSectionedCatalogPresentation` (category/sort/pagination) intentionally stayed `isFnbMode || isRetailMode` only. MSME keeps its existing single flat product list — it wasn't asking for F&B's sectioned/paginated browsing, only the header/search/sort/category chrome, which is presentational.

### Additional Notes
- MSME now gets full search + sort + category-filter functionality it never had before, styled in its teal palette, using the exact same `StorefrontCatalogToolbar.jsx` component F&B and retail use — a "shared component" per the instruction's own definition, not a fork.

---

## Task 2: MSME product card — rebuilt to F&B's structure, MSME's own component

### Description
Per "for separate, use the MSME's used components" — MSME's product card was never meant to become a shared component (same as retail's card wasn't); it needed its own file mirroring F&B's layout/shadow/border treatment while keeping MSME-specific colors and wording. `SimpleProductCard.jsx` was rewritten from scratch (previously a much simpler ~small component) into the same structure `RetailProductCard.jsx` uses: grid layout, mobile list-view branch, floating price badge, category-icon placeholder, availability banner — with:
1. No "View Details" button — single full-width **"Add to Order"** button (MSME's existing wording, kept instead of copying retail's "Add to Cart").
2. Accent colors: MSME's own teal (`#0f766e` / `#134e4a`) for the category icon, price-badge fill, and button — while border/shadows use F&B's literal values (`#edd4bc` border, `rgba(73,38,20,...)` card shadow, `rgba(217,119,6,...)` price-badge shadow), matching the same "structure and treatment shared, accent color mode-specific" pattern already applied to retail's card.

### Files Changed
- `frontend/apps/store/src/modes/simple/storefront/components/SimpleProductCard.jsx` — full rewrite (~330 lines), same shape as `RetailProductCard.jsx`.
- `frontend/apps/store/src/shared/components/storefront/StorefrontClassicCatalog.jsx` — the `isSimpleMode` branch of the card dispatcher now passes the same prop set F&B/retail cards get (`imageSources`, `FNB_CATEGORY_ICON_MAP`, `buttonTextOnAccent`, `fnbViewMode`, `getCartFlySourceRect`, `heroTheme`, `isMobileViewport`) instead of its old bespoke prop list (`Badge`, `GhostButton`, `PrimaryButton`, `bodyFont`, `displayFont`, etc. — all removed); `key` changed to `item.item_id + '-' + fnbViewMode` to force remount on grid/list toggle, matching F&B/retail.

### Additional Notes
- Enables MSME's mobile grid/list view toggle as a side effect, since the list-view branch now exists in the card component the same way it does for F&B/retail.

---

## Task 3: MSME checkout — Place Order + tracking page (confirmed already correct + one real fix)

### Description
Unlike retail, MSME's checkout submission (`handleCheckout`'s generic branch in `shared/hooks/useCheckoutSubmission.js`) and quote-gating exemption (`requireQuoteForCheckout` in `useCheckoutTotalsAndGating.js`, already excluding `isSimpleMode`) were **already correct** before this port — verified by reading both, not by assumption. No changes were needed there.

What genuinely was broken for MSME: the shared tracking/pickup page (`FnbTrackingRouteContainer`) that retail's checkout now routes to on `isTrackSubpage` had no equivalent dispatch branch for MSME — MSME's order-subpage route always rendered `SimpleCheckoutRoutePage`, even when visiting `/order/track`. Fixed by adding the same `isTrackSubpage` branch retail got, and by broadening the tracking-runtime activation flag (already extended for retail) to also cover MSME.

### Files Changed
- `frontend/apps/store/src/shared/components/storefront/StorefrontClassicCatalog.jsx` — MSME's order-subpage dispatch:
  ```jsx
  {isSimpleMode && isResolvedOrderSubpage && simpleStorefrontModel && (
    isTrackSubpage
      ? <FnbTrackingRouteContainer {...fnbTrackingRouteProps} visible renderDrawer={false} />
      : <SimpleCheckoutRoutePage {...simpleCheckoutRouteProps} />
  )}
  ```
- `frontend/apps/store/src/StorefrontApp.jsx` — the `useFnbTrackingRuntime({...})` call's `isFnbOrderSubpage` param extended from `isFnbOrderSubpage || (isRetailMode && isTrackSubpage)` to `isFnbOrderSubpage || ((isRetailMode || isSimpleMode) && isTrackSubpage)`, so MSME's tracking page actually activates the polling effect that fetches order status instead of hanging on "Loading Order Details...".

### Additional Notes
- The `checkoutTab` → `'track'` cold-load sync `useEffect` (added while fixing retail's "stuck on loading" bug) is mode-agnostic and required no MSME-specific change — it already covers MSME once the dispatch branch above exists.
- Verified against an existing placed MSME order (tracking pin `SK-VSVWCO`): tracking page renders correctly, same shared component F&B/retail use.

---

## Task 4 (follow-up bug): MSME cart FAB position

### Description
User-reported: *"the positioning of the product cart seems to be different compared to the retail. perhaps you forgot about this."* Correct — MSME has its own separate cart FAB component (`SimpleCartFloatingButton.jsx`, architecturally parallel to retail's `DefaultProductCartFab.jsx`, not a shared file), and it was never updated when `DefaultProductCartFab.jsx`'s position was fixed to match F&B's `StorefrontCartFab.jsx` earlier in the retail work.

### Files Changed
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCartFloatingButton.jsx` — `right`/`bottom` changed from `16/24` (mobile/desktop) to `20/36` and `10/18`, matching F&B and retail exactly. `zIndex: 2090` was already correct.

### Additional Notes
- Verified live: computed style measured `right: 36px, bottom: 18px` on desktop, matching F&B/retail.

---

## Task 5 (follow-up bug): MSME catalog section missing white background

### Description
User-reported (with screenshot comparing MSME's mobile/desktop catalog to F&B/retail's white-backed catalog section): MSME's product catalog had no white background separating it from the page's gray gradient background. Root cause: when `showsCatalogToolbar` was extended to include `isSimpleMode` (Task 1 above), the catalog `<section>`'s `background`/`border`/`borderRadius`/`padding`/`boxShadow` styles still had leftover `isSimpleMode`-specific branches predating that change (`background: isSimpleMode ? 'transparent' : '#fff'`, etc.) — dead code that always won for MSME regardless of `showsCatalogToolbar`, since `isSimpleMode` now always implies `showsCatalogToolbar === true`.

### Files Changed
- `frontend/apps/store/src/shared/components/storefront/StorefrontClassicCatalog.jsx` — removed the dead `isSimpleMode` fallback branches from `gap`, `marginTop`, `background`, `border`, `borderRadius`, `padding`, `boxShadow` on the catalog `<section>`, so all three modes using `showsCatalogToolbar` (F&B/retail/MSME) share one consistent style path: white (`#fff`) full-bleed section, no border/shadow, correct padding.

### Additional Notes
- Verified live on the MSME test tenant (`retail-ipsum-6161e0`): "Product Section / Everyday Products" catalog now renders on a white background, matching F&B/retail.

---

## Summary of files touched in this port (beyond the original retail task, listed in `RETAIL_CATALOG_PROMO_CHECKOUT_ENHANCEMENTS_2026-08-03.md`)

- `frontend/apps/store/src/modes/simple/storefront/components/SimpleProductCard.jsx` (rewritten)
- `frontend/apps/store/src/modes/simple/checkout/components/SimpleCartFloatingButton.jsx` (position fix)
- `frontend/apps/store/src/app/runtime/modePresentationRegistry.js` (msme entry: `catalogEyebrow`, `heroTheme` fields)
- `frontend/apps/store/src/shared/components/storefront/StorefrontClassicCatalog.jsx` (MSME folded into `showsCatalogToolbar`; old inline header deleted; MSME tracking dispatch added; dead `isSimpleMode` style branches removed)
- `frontend/apps/store/src/StorefrontApp.jsx` (`isFnbOrderSubpage` param extended to cover MSME)

No backend changes were required for any of this — every fix was presentation-layer (React components/styling) or a gating flag already computed elsewhere.
