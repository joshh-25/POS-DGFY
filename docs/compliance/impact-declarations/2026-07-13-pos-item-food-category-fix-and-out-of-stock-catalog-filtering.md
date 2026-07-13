---
status: reference
owner: engineering
last_reviewed: 2026-07-13
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-13-pos-item-food-category-fix-and-out-of-stock-catalog-filtering
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.13
verification_evidence: npm --prefix backend test,npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert create_category_name support in itemValidator.js/itemRepository.js/updateItemUseCase.js/itemHandlers.js, revert the editCategoryInput/canManageCategories create-on-edit UI and the currentFolderId fallback in TerminalOperationsWorkspace.jsx, and revert catalogForDisplay/availableCategories filtering plus the folder_id/product_folder/folder include in posRepository.js and POSCheckoutTerminal.jsx; addToCart/updateCartQuantity and item stock values themselves are untouched, so rollback carries no data or calculation risk.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-13T00:00:00+08:00
preflight_request_ref: POS-ITEM-CATEGORY-FIX-OOS-CATALOG-FILTER-2026-07-13
---

# POS Item Food Category Fix and Out-of-Stock Catalog Filtering

## Compliance Impact Classification

Major. This change fixes two bugs: (1) editing an item whose Food Category (POS folder) was inactive would silently clear the item's category on save, and admins had no way to create a new category while editing an existing item (only while creating one); (2) the Sell catalog now excludes out-of-stock items when browsing a specific category, and the mobile category dropdown hides categories with no currently purchasable items. No checkout, payment, fiscal, or stock-quantity calculation logic is changed — this is a data-integrity fix for category assignment and a display/filtering change for catalog browsing. Classified `major` per the `pos`/`terminal` surface floor since `backend/src/modules/pos/repositories/posRepository.js`, `POSCheckoutTerminal.jsx`, and `TerminalOperationsWorkspace.jsx` are POS-surface files.

## Affected Surfaces

### Food category bug fix
1. `backend/src/validators/itemValidator.js` — `updateItemSchema` gains an optional `create_category_name` field (trimmed, whitespace-collapsed, 1–100 chars, or empty/null).
2. `backend/src/modules/inventory/usecases/updateItemUseCase.js` / `backend/src/modules/inventory/controllers/itemHandlers.js` — `updateItemUseCase` and `updateItem` now accept/derive `canManageCategories` (`true` only for master admins or the `admin` role) and pass it through to the repository.
3. `backend/src/modules/inventory/repositories/itemRepository.js` — `updateItem(itemId, itemData, userId, { canManageCategories })`:
   - Rejects (`422`) if both `create_category_name` and `folder_id` are supplied.
   - If `create_category_name` is supplied, requires `canManageCategories` (`403` otherwise), matches it case-insensitively against existing top-level folders, rejects (`422`) if the match is inactive, and otherwise creates the folder (mirroring `createItem`'s existing create-a-category-on-save behavior, previously unavailable on edit), handling a race on the unique constraint by re-reading the just-created folder.
   - `create_category_name` is stripped before the item row is persisted (it is a command field, not an `Item` column).
4. `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx` (`ItemsWorkspace`):
   - **Root cause of the wipe bug**: `foodCategoryOptions` only lists active folders, so an item whose current category had since been deactivated resolved to `foodCategory = null`, and the save payload became `{}` — clearing `product_folder`/`folder_id` on every save even though the field was never touched. Fixed by falling back to the item's existing `folder_id`/`product_folder` when the category field is untouched, instead of sending an empty payload.
   - Admins (`canManageCategories`) now get an editable, autocomplete (`<input list>`) category field on the edit form instead of a fixed `<select>` of active categories only, so they can type a new category name to create it on save — mirroring the existing create-item flow. Non-admins keep the original dropdown-only behavior.
   - The item list's "Category" field now shows `item.folder?.name || item.product_folder` (the actual Food Category/POS folder) instead of `item.category` (a fixed, unrelated inventory-type enum that was always "product").
   - After a successful edit, both `loadItems()` and `loadPosFolders()` are refreshed (previously only `loadItems()`), so a newly created category appears immediately.

### Out-of-stock catalog filtering
5. `backend/src/modules/pos/repositories/posRepository.js` — `listCatalog` now includes `folder_id`/`product_folder` in the base attribute list and joins `ItemFolder` (`as: 'folder'`, `attributes: ['folder_id', 'name', 'show_in_pos_filter']`) so the frontend can filter/group by category.
6. `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`:
   - **Category-filtered view**: when a specific folder/category is selected (not "All Items"), `catalogForDisplay` excludes items with `current_stock <= 0`, except service items and items with `pos_always_available === true`. "All Items" is unaffected — out-of-stock items still appear there.
   - **Mobile category dropdown**: `availableCategories` (mobile-only, via `isMobile` media-query state) hides any category that has zero items with stock, unless at least one item in that category is `pos_always_available`. Desktop/tablet always shows the full, unfiltered category list.
   - Folders and catalog are now re-fetched whenever the category filter panel is opened, so a category added/edited elsewhere during the same terminal session is reflected without a full reload.

## Compliance Preconditions

1. `addToCart`, `updateCartQuantity`, and all cart/checkout calculation logic are unmodified; this change only affects which items are visible/selectable and how an item's category is assigned.
2. Checkout totals, VAT breakdown, DGFY fee calculation, payment method handling, discounts, and order submission behavior remain unchanged.
3. Only master admins or the `admin` role can create a new category via `create_category_name`, enforced server-side (`403` for non-admins) independent of the frontend gate.
4. An item's category can no longer be silently cleared by an edit that didn't touch the category field — the fallback preserves the existing `folder_id`/`product_folder` when the field is untouched, and inactive categories remain visibly assigned to items that already have them (existing "Inactive categories remain on existing items" behavior is preserved).
5. Out-of-stock exclusion only applies within a selected category filter; "All Items" and service/always-available items are never hidden by stock level.
6. `current_stock` and other item/stock values themselves are read-only in this change — nothing here writes to inventory or stock quantities.

## Verification Evidence

The commands listed in front matter must pass before deployment. Manual verification: edit an item whose category is inactive without touching the Food Category field, save, and confirm the category is preserved (not cleared); as an admin, type a brand-new category name while editing an item and confirm it is created and assigned on save; as a non-admin, confirm the category field remains a fixed dropdown; on the Sell screen, select a category containing only out-of-stock items and confirm they are hidden (and the category itself is hidden from the mobile dropdown), then confirm those same items still appear under "All Items".
