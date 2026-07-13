---
status: reference
owner: engineering
last_reviewed: 2026-07-13
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-13-pos-best-seller-tag-catalog-layout-settings-buttons
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.13
verification_evidence: npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the pos_best_seller toggle in the create/edit item forms, the BEST_SELLER_STORAGE_KEY/BEST_SELLER_EVENT_NAME read/write helpers and bestSellerItemIds state in both files, the "best seller" badge and taller mobile catalog card classes in POSCheckoutTerminal.jsx, the non-functional Best Seller Auto-Tagging checkboxes, and the mobile Settings tab bar grid-cols-2 layout in TerminalOperationsWorkspace.jsx; no backend field, cart, or checkout logic is touched, so rollback is a straight file revert with no data migration.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-13T00:00:00+08:00
preflight_request_ref: POS-BEST-SELLER-TAG-CATALOG-LAYOUT-SETTINGS-BUTTONS-2026-07-13
---

# POS Best Seller Tag, Sell Catalog Layout, and Settings Button Layout

## Compliance Impact Classification

Major. This change adds a client-side-only, mobile-only "Best Seller" tag that an admin/cashier can toggle when creating or editing an item, adjusts the mobile Sell Catalog card layout to accommodate the new tag, and changes the mobile Settings tab bar from an equal-width row to a 2-column grid. The Best Seller marker has no backend field, no server persistence, and no effect on stock, pricing, VAT, or checkout — it is stored only in the browser's `localStorage` and read back purely for display. Classified `major` per the `pos`/`terminal` surface floor since `POSCheckoutTerminal.jsx` and `TerminalOperationsWorkspace.jsx` are POS-surface files.

## Affected Surfaces

### Best Seller tag (create/edit item)
1. `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx` (`ItemsWorkspace`):
   - `createForm`/`editForm` gain a `pos_best_seller` boolean field, editable via a mobile-only (`isMobile`) `Switch` toggle in both the Create Item and Edit Item forms, labeled "Best Seller" with helper text "Shows a 'best seller' tag in the Sell Catalog."
   - `readBestSellerItemIds`/`writeBestSellerItemIds` persist the set of best-seller item IDs to `localStorage` (`pos_best_seller_item_ids`) and broadcast a `pos:best-seller-updated` custom event (plus listening for the native `storage` event) so the Sell Catalog reflects changes instantly in the same tab (native `storage` events do not fire within the originating tab).
   - `setItemBestSeller(itemId, isBestSeller)` updates local state and persists it; called from `runPostCreateStages` (client-side only, so it cannot fail like the network-backed post-create stages) and from the edit-save handler.
2. `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` — duplicates the same `readBestSellerItemIds`/storage-key/event-name contract to read (never write) the best-seller set, and derives `isBestSeller` per catalog item to render a mobile-only (`sm:hidden`) amber "best seller" badge alongside the existing "Always available" badge.

### Sell Catalog mobile card layout
3. `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` — the mobile catalog card height increases from `max-sm:h-[6.5rem]` to `max-sm:h-[7.5rem]` (and the matching `catalogGridClassName` auto-row height), to fit the "Always available"/"best seller" badges wrapping onto their own row (`flex flex-wrap items-center gap-1`) without crowding the price/stock text below it. No change to desktop/tablet (`sm:` and above) card height or content.

### Settings mobile button layout
4. `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx` (`SettingsWorkspace`):
   - The mobile Settings tab bar changes from `flex items-center gap-2 sm:hidden` with each tab button `flex-1` (equal-width row) to `grid grid-cols-2 gap-2 sm:hidden` with buttons sized to their grid cell instead of `flex-1`.
   - A new "Best Seller Auto-Tagging" card is added (mobile-only, `sm:hidden`) with two checkboxes ("tag if sold more than 100 times last day", "tag if among the top 3 best sold items overall"). These checkboxes are **not wired to any state, persistence, or evaluation logic** — they are static, non-functional UI placeholders only; no automatic tagging occurs from sales data as a result of this change.

## Compliance Preconditions

1. `pos_best_seller`/the best-seller tag has no backend field, is never sent to the server, and does not affect `current_stock`, pricing, VAT, discounts, or any checkout/order calculation — it is a purely cosmetic, client-side, mobile-only label read from `localStorage`.
2. Best-seller state does not sync across devices or users (it is per-browser `localStorage`); this is a known, accepted limitation of a client-side-only marker, not a data-integrity concern.
3. The "Best Seller Auto-Tagging" checkboxes in Settings perform no action when checked/unchecked in this change — they must not be represented to end users as functional until wired to real logic in a future change.
4. Checkout totals, VAT breakdown, DGFY fee calculation, payment method handling, discounts, and order submission behavior remain unchanged.
5. The mobile catalog card height and Settings tab bar grid layout changes are mobile-only (`max-sm:`/`sm:hidden`); desktop/tablet card height, content, and Settings tab bar layout are unchanged.

## Verification Evidence

The commands listed in front matter must pass before deployment. Manual verification: on a mobile viewport, toggle "Best Seller" on when creating or editing an item and confirm the amber "best seller" tag appears on that item's Sell Catalog card without a page reload; confirm the taller mobile catalog card still displays price/stock correctly with both badges present; confirm the mobile Settings tab bar renders as a 2-column grid; confirm the Best Seller Auto-Tagging checkboxes are present but produce no visible effect when toggled (expected, since they are placeholders in this change).
