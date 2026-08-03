# Retail Catalog, Promo, and Checkout Enhancements — 2026-08-03

Covers everything implemented since the prompt: *"try to make the retail use the header component (turn it to a shared component) instead of the 'Shop the Store' and 'Browse general merchandise...' copy"* through the retail "Place Order" / pickup-page fixes. Structure: Task / Description / Files Created / Files Deleted / Files Changed / Additional Notes.

---

## Task 1: Shared catalog toolbar (search / sort / category) for retail

### Description
Retail's catalog page previously showed only a generic heading + a bare, unstyled search input — no sort, no category filter, no item-count pill. F&B's toolbar (`FnbCatalogToolbar.jsx`) had all of this but was F&B-exclusive. The underlying data (`filteredFnbViewModel`, `fnbCatalogPresentation`, sort/pagination via `useFnbCatalogRuntime`) was already computed generically for every mode — F&B just happened to be the only mode consuming it. The toolbar component was extracted into a genuinely shared component and wired into retail with retail's own copy and colors:
- Eyebrow: "Item Catalog" (was "Curated Menu" for F&B)
- Heading: "What are you looking for?" (replaced "Shop the Store")
- Subtitle: "Browse items, compare options, and add ready-to-order items to the cart." (replaced "Browse general merchandise, per-kilo goods, and refill products currently in stock.")
- Colors: driven by retail's own `heroTheme` (orange `#ea580c`/`#9a3412`), not F&B's orange/green.

### Files Created
- `frontend/apps/store/src/shared/components/storefront/StorefrontCatalogToolbar.jsx` — the generalized toolbar (moved from `FnbCatalogToolbar.jsx`), copy/colors now sourced from `modeAdapter`/`modeAdapter.heroTheme` instead of hardcoded F&B strings.

### Files Deleted
- `frontend/apps/store/src/modes/fnb/storefront/components/FnbCatalogToolbar.jsx` — superseded by the shared component above.

### Files Changed
- `frontend/apps/store/src/app/runtime/modePresentationRegistry.js` — retail entry: `catalogHeading`, `catalogSubtitle`, new `catalogEyebrow: 'Item Catalog'`; retail `heroTheme` filled out with `borderSoft`/`textPrimary`/`textMuted`/`surfaceInset`. F&B entry: added explicit `catalogEyebrow`/`catalogItemNounSingular`/`catalogItemNounPlural` so its existing copy stays byte-identical rather than relying on fallbacks.
- `frontend/apps/store/src/shared/components/storefront/StorefrontClassicCatalog.jsx` — swapped the `FnbCatalogToolbar` import for the shared one; toolbar now renders for `isFnbMode || isRetailMode`; suppressed the old generic `<h2>`/subtitle block and bare search `<input>` for retail (now superseded by the toolbar); extended the pagination block to the same gate; generalized the "menu items" pagination-summary wording.
- `frontend/apps/store/src/app/pages/StorefrontCatalogRouteContainer.jsx` — extended the item-resolution logic (category filtering, sorting, pagination via `fnbCatalogPresentation`) from `isFnbMode`-only to `isFnbMode || isRetailMode`. Necessary, not cosmetic: the toolbar's category/sort state was already being computed for every mode but only *applied* for F&B; turning the toolbar on for retail without this would have stranded items past page 1.
- `frontend/apps/store/src/__tests__/modePresentationRegistry.test.js` — updated the two assertions hardcoding retail's old `catalogHeading` ("Shop the Store" → "What are you looking for?").

### Additional Notes
- The category grouping model (`getFoodBeverageStorefrontViewModel`) buckets uncategorized items into a fallback labeled "Chef Specials" — pre-existing shared behavior, not changed here. Confirmed live: shows up for retail too when items have no category set. Worth revisiting separately if it looks wrong on a real retail catalog.
- Search bar is desktop-only in F&B's original design; retail inherited the same asymmetry (fixed for mobile in Task 5 below, for both modes).

---

## Task 2: Retail's own product card (border/shadow/colors/layout, grid + mobile list view)

### Description
Retail was reusing `ServiceProductCard.jsx` (Services mode's card) for its catalog grid. Built retail's own card component instead, mirroring F&B's `FnbProductCard.jsx` layout exactly (container size/corner-radius/image height, category-icon placeholder, floating price badge, name/description, availability banner, and the mobile list-view variant), with two intentional differences:
1. No "View Details" button anywhere — replaced with a single full-width "Add to Cart" button (icon + "+" badge + label) in both the grid and mobile-list layouts.
2. Colors: category icon, price-badge fill, and the "Add to Cart" button all read from retail's own `heroTheme` accent (`#ea580c`/`#9a3412`) — except the card border, card shadow, category-icon box shadow, and price-badge shadow, which were explicitly set to F&B's *literal* values (`#edd4bc` border; `rgba(73,38,20,...)` card shadow; `rgba(217,119,6,...)` price-badge shadow) per direct instruction, rather than recolored to retail's palette.

Mobile grid/list toggle was also re-enabled for retail (previously suppressed) once the mobile list-view branch existed.

### Files Created
- `frontend/apps/store/src/modes/retail/storefront/components/RetailProductCard.jsx`

### Files Deleted
None.

### Files Changed
- `frontend/apps/store/src/shared/components/storefront/StorefrontClassicCatalog.jsx` — added `RetailProductCard` as its own branch in the item-card dispatcher (`isFnbMode → isSimpleMode → isRetailMode → else ServiceProductCard`); the other default-like modes still use `ServiceProductCard`. Fixed `onViewDetails` to use `openFnbDetail` (matching what F&B/MSME actually use) instead of `openServiceDetail`, a leftover from the borrowed Services card. `showViewToggle` on the toolbar changed from `isFnbMode` to `showsCatalogToolbar` (i.e. `isFnbMode || isRetailMode`) so the grid/list toggle shows for retail; `key` on the card changed to `item.item_id + '-' + fnbViewMode` to force remount on view-mode switch (matches F&B's pattern).

### Additional Notes
- The retail card intentionally relies on the same `getFoodBeverageStorefrontViewModel`-shaped fields (`sectionVisualMeta`, `sectionLabel`, `descriptionPreview`, `availabilityMeta`) F&B's card uses — no new data plumbing was needed since Task 1 already put retail's items through that shared view model.

---

## Task 3: Toolbar search/sort/category stroke color

### Description
The toolbar's search bar, sort dropdown, and category dropdown border used `toolbarTheme.borderSoft`, which for retail resolved to its own `#fed7aa`. Per instruction, changed to F&B's literal `#edd4bc` unconditionally for every mode using this shared toolbar (invisible on F&B since its own `borderSoft` was already that value).

### Files Changed
- `frontend/apps/store/src/shared/components/storefront/StorefrontCatalogToolbar.jsx` — `toolbarBorder` hardcoded to `'#edd4bc'` instead of `toolbarTheme.borderSoft || STYLES.colors.border`.

---

## Task 4: Mobile expandable search bar

### Description
Two-stage implementation:
1. First pass added an always-visible compact search input on the "Browse by Category" row (replacing the "View all" link), shared for F&B and retail's mobile toolbar.
2. Superseded by an expandable design: by default a circular icon-only search button (styled like the cart FAB); tapping it expands to a full-width search input covering the row (with a close "×" that collapses back and clears the search).

### Files Changed
- `frontend/apps/store/src/shared/components/storefront/StorefrontCatalogToolbar.jsx` — added `isMobileSearchOpen` state; moved the theme-derived color variables above the mobile branch (previously desktop-only) so both branches can use them; replaced the "View all" link with the collapsed button / expanded input toggle described above.

---

## Task 5: Promos — backend/POS research, demo promo, storefront display simplification

### Description
Confirmed the Promos feature (fields: `title`, `subtitle`, `badge`, `validity_text`, `promo_code`, `discount_percent`, `usage_limit`, `used_count`, `target_item_ids`, `valid_time_start/end`, `valid_from/until`, `active`, `channels`, `fulfillment_methods`, `order_timing`) is fully backend-supported and mode-agnostic (generic tenant settings, a POS management UI in `TerminalOperationsWorkspace.jsx`, and a promo-application engine in `commercialPromoPolicy.js`) — available to F&B and retail alike. The one real gap found: retail's checkout has no promo-code redemption UI (F&B/MSME have `PromoCodePanel.jsx`; retail doesn't) — noted but not implemented (out of scope for this task).

Created a demo promo directly via a `system_settings` write for the retail test tenant (`storefront_promos` key), then ran `npm run reconcile:storefront-discovery` to refresh the cached discovery index so it appeared live.

Then, per instruction, trimmed the storefront promo card down to only Title / Subtitle / Promo code / Badge (removing the discount-percent hero panel, validity/date display, and availability messaging) — then reverted per a follow-up instruction to restore the original flip-card layout (discount-percent panel, validity chip, availability messaging, flip-to-reveal-code back face) minus just the badge chip. Finally increased the mobile card's minimum height slightly for breathing room.

### Files Changed
- `frontend/apps/store/src/shared/components/storefront/sections/StorefrontPromoSection.jsx` — `PromoCard` simplified then restored (net effect vs. original: badge chip removed, `promoLabel` no longer falls back to `badge`; `cardMinHeight` for mobile changed from `156` to `184`).

### Additional Notes
- This component is genuinely shared — no MSME-specific work was needed for the promo card itself; it already renders identically for any mode using `SharedStorefrontPromoSection`.
- Demo promo data lives in the retail tenant's DB only (`sku_tenant_retailipsum_5a9b90d4`), not a code change.

---

## Task 6: Retail checkout — functional "Place Order" + shared pickup/tracking page

### Description
Retail's step-3 "Place Order" button was permanently disabled ("Coming Soon"). Wired it to the same shared `handleCheckout` (from `shared/hooks/useCheckoutSubmission.js`) that MSME already uses — F&B has its own dedicated submission path (`handleFnbCheckout`), but every other mode, including MSME, already fell through to a fully generic branch that posts to `/api/v1/store/checkout` and navigates to tracking on success. Retail was simply never wired to call it.

On success, retail now renders the same shared tracking/pickup page F&B uses (`FnbTrackingRouteContainer` → `PickupTrackingMobileView` for pickup orders) instead of a retail-specific page, per explicit instruction to keep this shared rather than forked.

Two bugs surfaced during live verification and were fixed in the same pass:
1. **"Please click Quote first before checkout"** — `requireQuoteForCheckout` (in `useCheckoutTotalsAndGating.js`) exempted F&B and MSME but never retail, so retail was incorrectly held to Services' quote-first requirement despite having no Quote step. Fixed by adding `isRetailMode` to the exemption.
2. **Tracking page stuck on "Loading Order Details..." forever** — the polling effect that fetches order status only activated when `isFnbOrderSubpage` (`isFnbMode && ...`) was true, structurally excluding retail. Also, that effect required `checkoutTab === 'track'`, which was only ever set by the in-app `goStoreTrackPage()` call — meaning a cold/refreshed load of the tracking route would hang for **any** mode, not just retail. Fixed both: broadened the flag fed into the tracking hook to include `isRetailMode && isTrackSubpage`, and added a `useEffect` that syncs `checkoutTab` to `'track'` whenever `isTrackSubpage` is true, regardless of how the page was reached.

### Files Changed
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderPaymentStep.jsx` — "Place Order (Coming Soon)" → real "Place Order" button calling `onCheckout`, disabled while `checkoutLoading`, inline error banner for `checkoutError`.
- `frontend/apps/store/src/modes/retail/checkout/components/RetailOrderMobileSummaryPanel.jsx` — same, for the mobile sticky footer's step-3 action.
- `frontend/apps/store/src/modes/retail/checkout/pages/RetailOrderPage.jsx` — threads `onCheckout`/`checkoutLoading`/`checkoutError` to both.
- `frontend/apps/store/src/modes/retail/checkout/hooks/useRetailOrderPageProps.js` — accepts `handleCheckout`/`checkoutLoading`/`checkoutError`, returns `onCheckout: handleCheckout` (matching MSME's exact pattern).
- `frontend/apps/store/src/modes/fnb/checkout/hooks/useCheckoutTotalsAndGating.js` — `requireQuoteForCheckout` now also excludes `isRetailMode`.
- `frontend/apps/store/src/shared/components/storefront/StorefrontClassicCatalog.jsx` — retail's order-subpage dispatch now branches on `isTrackSubpage`: renders `<FnbTrackingRouteContainer>` (shared) instead of `<RetailOrderPage>` when viewing tracking.
- `frontend/apps/store/src/StorefrontApp.jsx` — threaded `handleCheckout`/`checkoutLoading`/`checkoutError` into the retail props call; threaded `isTrackSubpage`/`fnbTrackingRouteProps` through the catalog route props chain; broadened the flag passed into `useFnbTrackingRuntime`; added the `checkoutTab` → `'track'` sync effect.
- `frontend/apps/store/src/app/hooks/useStorefrontCatalogRouteProps.js`, `frontend/apps/store/src/app/pages/StorefrontCatalogRouteContainer.jsx` — plain pass-through threading for `isTrackSubpage`/`fnbTrackingRouteProps`.

### Additional Notes
- Verified against a real placed order (tracking pin `SK-GNQSAN`): full pickup-tracking page renders (status stepper, order details, pickup location + map, support links) — pixel-identical structure to F&B's own tracking page (verified against F&B's `SK-74QGO9`, unaffected).
- The `checkoutTab` sync fix closes a latent bug that also affected F&B (a hard refresh of a tracking URL would previously hang) — a genuine side benefit, not scope creep, since it's the same mechanism being touched.
