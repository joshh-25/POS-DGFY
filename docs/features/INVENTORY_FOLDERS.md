# Inventory Grouping (Folders) Feature Guide

This guide explains how to use and manage the Inventory Grouping ("Folders") feature in the SKU Inventory Manager.

## Overview

The Inventory Folder system allows you to organize items into logical groups. This feature is fully supported by both the **AI Chat** and the **Web UI**.

## Managing Folders via UI

### Creating a Folder
1. Navigate to the **Inventory Items** tab.
2. Click the **"Create Folder"** card in the grid.
3. Enter a folder name (e.g., "Packaging").
4. The new folder will appear immediately.

### Moving Items
- **Drag and Drop**: Drag an item card and drop it onto a folder card.
- **Bulk Move**: Select multiple items using the checkboxes, click the "Actions" menu, and select "Move to Folder".

### Navigating
- Click on a folder card to "enter" it and see only the items inside.
- Use the **Breadcrumbs** at the top (`Items / Folder Name`) to navigate back to the main list.

### Deleting a Folder
1. On the **Items** tab, find the folder card you want to delete.
2. Click the **three-dot menu** (⋮) in the top-right corner of the folder card.
3. Select **"Delete Folder"**.
4. Confirm in the dialog. Any items inside the folder will be **automatically unassigned** (moved out to uncategorized).
5. The folder is permanently removed.

> **Note:** Only users with the `DELETE_ITEMS` permission can see and use the delete option.

## Managing Folders via AI Chat

You can perform all folder operations using natural language in the chat.

### Commands
- **Create (single)**: "Create an inventory folder named 'Seasonal Products'"
- **Create (bulk)**: "Create 5 folders: Raw Materials, Packaging, Finished Goods, Supplies, Beverages"
- **Delete (single)**: "Delete the 'Seasonal Products' folder"
- **Delete (bulk)**: "Delete folders A, B, C, D, E"
- **Move**: "Move the Christmas wrapper to Seasonal Products" or "Put all Red items in the Color folder"
- **List**: "Show me all my inventory folders"
- **Query**: "What is inside the 'Packaging' folder?"

### Bulk Folder Creation
When you ask the AI to create multiple folders, it uses a single bulk operation with **one confirmation dialog** for all folders. This is much faster than creating folders individually.

Example: *"Create folders for each department: Kitchen, Bar, Storage, and Office"* — The AI will show a confirmation listing all 4 folders, and create them all after you confirm.

### Bulk Folder Deletion
Similarly, when you ask the AI to delete multiple folders, it uses a single bulk operation. Items inside deleted folders are automatically unassigned (moved to uncategorized).

Example: *"Delete folders A, B, C, D, E"* — The AI will show a confirmation listing all 5 folders, and delete them all after you confirm.

## Technical Details (For Developers)

- **Database**: Folders are stored in the `item_folders` table.
- **Relationships**: Items are linked via `folder_id`.
- **Legacy Sync**: For compatibility, the system automatically syncs the new `folder_id` with the legacy `product_folder` string column. This ensures that older parts of the application that rely on the string field still work correctly.
- **API Endpoints**:
    - `GET /api/v1/items/folders` — List all folders with item counts
    - `POST /api/v1/items/folders` — Create a folder
    - `DELETE /api/v1/items/folders/:folder_id` — Delete a folder (auto-unassigns items)
- **Services**:
    - Backend: `itemGroupingService.js`
    - Frontend: `useItems.js` (specifically `useFolders` hook)
- **AI Tools**: `create_inventory_folder`, `bulk_create_inventory_folders`, `delete_inventory_folder`, `bulk_delete_inventory_folders`, `move_items_to_inventory_folder`, `get_inventory_folders`, `get_items_in_inventory_folder`

## Troubleshooting

**Issue**: "I created a folder but I don't see it."
**Solution**: Ensure you are connected to the correct tenant. If the folder is truly empty and was created before the "Empty Folder Visibility" fix, try creating it again or creating a new one. The UI now supports displaying empty folders.

**Issue**: "500 Internal Server Error when viewing reports."
**Solution**: This has been resolved. If it recurs, it is likely a multi-tenancy context issue. Check `reportService.js` to ensure models are loaded via `dbStore.get()`.
