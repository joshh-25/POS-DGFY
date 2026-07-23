---
status: reference
owner: engineering
last_reviewed: 2026-07-21
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-21-pos-catalog-badge-removal-best-seller-category-tablet-layout
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.07.21
verification_evidence: npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert CatalogItemBadges back to rendering isAlwaysAvailable/isBestSeller spans, revert the BEST_SELLER_CATEGORY_ID synthetic filter chip/hasBestSellerItems/selectedFolderLabel and catalogForDisplay's is_best_seller branch in POSCheckoutTerminal.jsx, revert availableCatalog back to filtering via isSellAvailableCatalogItem, revert the tablet card layout (grid-cols/auto-rows, catalogCardClassName heights, the absolutely-positioned badge/name overlay, stock color source, Stock/Price/VAT grid, SKU line) to its prior state, revert the isTabletViewport-gated order-* classes in POSTransactionHistoryPanel.jsx, and revert the Best Seller toggle visibility/order-* swap in TerminalOperationsWorkspace.jsx; no cart, checkout, or backend logic is touched anywhere in this change, so rollback is a straight file revert with no data migration.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-21T00:00:00+08:00
preflight_request_ref: POS-CATALOG-BADGE-REMOVAL-BEST-SELLER-CATEGORY-TABLET-LAYOUT-2026-07-21
---

# POS Catalog Badge Removal, Best-Seller Category, and Tablet Layout Update

## Compliance Impact Classification

Major. This change removes the "Always available" and "Best seller" visual badges from every Sell Catalog card, replaces the best-seller badge with a synthetic "Best Seller" category filter chip driven by the existing `item.is_best_seller` field, and substantially reworks the tablet Sell Catalog/History filter layout to match desktop's simplified card structure. All underlying signals (`pos_always_available`, `is_best_seller`, stock values) remain fully live and continue to drive color coding and out-of-stock exemption — only the visual badge rendering and layout structure change. No checkout, payment, fiscal, or stock-calculation logic is touched. Classified `major` per the `pos`/`terminal` surface floor since all three files are POS-surface components.

## Affected Surfaces

### 1. Always Available tag removed
`frontend/src/features/pos/components/POSCheckoutTerminal.jsx` — `CatalogItemBadges` no longer accepts/renders `isAlwaysAvailable` (or `isBestSeller`); it now renders only the "Service" badge. This affects every viewport (mobile, tablet, desktop) since all call sites were updated to drop the removed props. The underlying `isAlwaysAvailable` boolean (`item.pos_always_available === true`) is unchanged and still: (a) drives green in `getMobileStockNameColorClassName`/`getDesktopStockNameColorClassName`, and (b) still exempts the item from the out-of-stock check (`isOutOfStock`) and from `isSellAvailableCatalogItem` — only the visual "Always available" tag itself was removed.

### 2. Best Seller tag removed, replaced by a Best Seller category filter
`frontend/src/features/pos/components/POSCheckoutTerminal.jsx`:
- The "Best seller" badge/tag is removed from `CatalogItemBadges` and from the tablet/desktop card's name row; `item.is_best_seller` is no longer read for badge display anywhere.
- A new synthetic (non-folder) category is added: `BEST_SELLER_CATEGORY_ID = 'best-seller'`, a string sentinel distinct from real numeric `folder_id`s. `hasBestSellerItems` (memoized) is true when at least one currently-visible catalog item has `is_best_seller === true`. A "Best Seller" filter chip (Star icon) renders in the category filter row only when `hasBestSellerItems` is true; selecting it sets `selectedFolderId` to the sentinel.
- `catalogForDisplay` gains a branch: when `selectedFolderId === BEST_SELLER_CATEGORY_ID`, the catalog is filtered to `item.is_best_seller === true` items instead of a `folder_id` match. `selectedFolderLabel` (used by the Filter button's label) resolves to `'Best Seller'` for the sentinel, since the real-folder lookup (`selectedFolder`) is always null for it. The existing "does this selected category still have items" `useEffect` is extended to check `hasBestSellerItems` instead of `availableCategories` when the sentinel is selected, so the selection isn't immediately reset after being picked.
- Items keep their real folder/category assignment unchanged — Best Seller is an additional, cross-cutting filter, not a replacement for an item's normal category.

`frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx` — the manual "Best Seller" force-tag toggle in the item create/edit forms (this sets the underlying data flag, not a card badge) is now visible on every viewport (previously mobile-only in the create form, and mobile+desktop-only via `sm:hidden xl:flex` in the edit form); tablet can now see and use it too. The Best Seller/Selling Price field order swap (`order-5`/`order-6`) now applies via `md:order-*` instead of `xl:order-*`, so tablet gets the same right-column placement desktop already had.

### 3. Tablet layout and functionality updates
`frontend/src/features/pos/components/POSCheckoutTerminal.jsx`:
- **Out-of-stock visibility**: `availableCatalog` is simplified to `safeCatalog` with no filtering at all (previously tablet was the one viewport that still hid out-of-stock items via `isSellAvailableCatalogItem`; mobile and desktop already showed them). Tablet now matches mobile/desktop: out-of-stock items stay visible, locked/grayed via the card's existing `isOutOfStock` handling. The API remains the stock authority and checkout still revalidates inventory server-side.
- **Card structure**: the DGFY-tablet-specific treatment of absolutely-positioning badges and the item name over a gradient image overlay is removed entirely. Tablet cards now use the same stacked structure as mobile/desktop (image, then name/tags/price rows below it).
- **Card sizing**: DGFY tablet grid changes from a responsive `grid-cols-2 sm:grid-cols-3` / `auto-rows-[7rem]` to a flat `grid-cols-3` / `auto-rows-[10rem]`; standard tablet changes from `auto-rows-[11rem]` to `auto-rows-[13rem]`. Matching `catalogCardClassName` heights: DGFY tablet `7rem → 10rem`, standard tablet `11rem → 13rem`. (True desktop's own `xl:` row/card height is also adjusted, from `13.5rem` to `12rem`, as part of the same class-string edit.)
- **Name color**: tablet now reuses the same `getMobileStockNameColorClassName` result already computed for mobile (same thresholds/logic, no duplicated function) instead of a flat static color; desktop keeps its own separate `getDesktopStockNameColorClassName` untouched.
- **SKU removed**: the product code/SKU line, previously shown tablet-only, is removed from the tablet card entirely (neither tablet nor desktop show it now).
- **Price section simplified**: tablet's previous Stock/Price/VAT three-row grid plus "Unavailable for checkout" note is replaced with a price-only line (`PHP {price}` or "Not set"), using the same `mt-auto`-pinned-to-bottom pattern as desktop (slightly more compact type/spacing for tablet). This is a separate JSX branch from desktop's own, so desktop's markup is untouched.

`frontend/src/features/pos/components/POSTransactionHistoryPanel.jsx` — tablet-only (`isTabletViewport`) reordering of the transaction history filter fields via explicit `order-*` classes: Status, Payments, Order Methods, Sources, Date From, Date To, Cashier ID, then the search/reset actions row. Mobile (`max-sm:order-*`) and desktop (unordered, natural DOM flow) are unaffected — the added classes only take effect when `isTabletViewport` is true.

## Compliance Preconditions

1. `addToCart`, `updateCartQuantity`, and all cart/checkout/VAT/fee/payment calculation logic are unmodified anywhere in this change; it only affects which visual badges render, how items can be filtered/browsed, and layout structure.
2. `pos_always_available` and `is_best_seller` remain fully functional data flags (color coding, out-of-stock exemption, category filtering) — only their dedicated on-card badges were removed.
3. The synthetic Best Seller filter never matches a real `folder_id` (guarded by the `BEST_SELLER_CATEGORY_ID` string sentinel vs. numeric folder IDs everywhere `selectedFolderId` is compared), so it cannot be confused with or overwrite a real category selection.
4. Making tablet show out-of-stock items (like mobile/desktop already did) is a presentation-only change; the API remains the stock authority and checkout still revalidates inventory server-side, so an out-of-stock item still cannot be successfully checked out.
5. The manual Best Seller toggle's newly-expanded visibility (tablet, and mobile-form-wide) does not change who can use it — it was already available to the same users on other viewports; this only removes viewport-based hiding of an existing control.
6. Mobile catalog card layout, and desktop's already-simplified card layout, are unchanged by this entire change set except for the shared badge-removal (item 1/2) and the desktop row/card height adjustment noted above.
7. Desktop (non-tablet) History filter ordering is unchanged; the reorder is gated to `isTabletViewport` only.

## Verification Evidence

The commands listed in front matter must pass before deployment. Manual verification: confirm "Always available" and "Best seller" badges no longer render on any catalog card at any viewport; confirm a "Best Seller" filter chip appears in the category row only when at least one visible item is a best seller, and selecting it filters the catalog to best-seller items only; confirm out-of-stock items remain visible (locked/grayed, not purchasable) on tablet now, matching mobile/desktop; confirm tablet catalog cards render image → name → tags → price with no SKU or Stock/Price/VAT grid; confirm the tablet History filter fields render in the new Status/Payments/Order Methods/Sources/Date From/Date To/Cashier ID/Actions order while mobile and desktop orders are unchanged; confirm the Best Seller toggle is now visible and functional in the item form on tablet.
