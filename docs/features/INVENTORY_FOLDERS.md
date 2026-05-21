# Inventory Grouping (Folders) Feature Guide

## Overview

Inventory folders organize items and drive filter UX in both Inventory and POS.

## Current Behavior (2026-03-30)

1. Folders are stored in `item_folders` and linked to items via `folder_id`.
2. Inventory Items page supports folder chips with toggle behavior:
- Click once to apply folder filter.
- Click active chip again to clear.
3. POS Terminal category chips are folder-driven:
- Only folders with `show_in_pos_filter=true` are listed as POS chips.
- Clicking an active folder chip again clears the filter.
4. Folder POS visibility (`show_in_pos_filter`) only controls chip visibility, not sellability.
5. Item sellability in POS is controlled by item-level `pos_visible` policy:
- If override row exists in `pos_catalog_overrides`, use that value.
- If no override row:
  - `category=product` + `product_type=finished_goods` => visible by default
  - other categories => hidden by default until enabled
6. POS catalog responses return POS-visible items regardless of stock.
- Stock-controlled product rows with zero stock are shown as unavailable in the POS UI.
- Services Mode rows (`category=service`) are stock-exempt service sales and remain addable when `service_item_details.visible_in_pos` is not false.

## UI Operations

### Create Folder
1. Go to `Items`.
2. Click `Create Folder`.
3. Save folder name.

### Move Items to Folder
1. Drag and drop item cards to a folder card, or
2. Use bulk selection + move action.

### Toggle Folder in POS Filters
1. On a saved folder card, toggle POS filter visibility.
2. Disabled folders are removed from POS category chips.

### Delete Folder
1. Open folder card actions.
2. Choose delete and confirm.
3. Items are unassigned (moved to uncategorized) automatically.

## API Endpoints

1. `GET /api/v1/items/folders` - List folders (includes `show_in_pos_filter`)
2. `POST /api/v1/items/folders` - Create folder
3. `PATCH /api/v1/items/folders/:folder_id` - Update folder metadata (`show_in_pos_filter`)
4. `DELETE /api/v1/items/folders/:folder_id` - Delete folder
5. `GET /api/v1/pos/catalog?folder_id=<id>` - Filter POS catalog by folder

## Permission Notes

1. Folder update/delete follows Inventory permissions (`items:edit`, `items:delete`).
2. POS catalog override updates (item-level `pos_visible`) use `items:edit`.

## Developer Notes

1. Legacy compatibility with `product_folder` remains in place.
2. Runtime behavior should be validated with:
- `npm run check:architecture`
- `npm run lint:docs`
- targeted POS + Inventory tests
