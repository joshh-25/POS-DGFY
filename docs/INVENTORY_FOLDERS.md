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

## Managing Folders via AI Chat

You can perform all folder operations using natural language in the chat.

### Commands
- **Create**: "Create an inventory folder named 'Seasonal Products'"
- **Move**: "Move the Christmas wrapper to Seasonal Products" or "Put all Red items in the Color folder"
- **List**: "Show me all my inventory folders"
- **Query**: "What is inside the 'Packaging' folder?"

## Technical Details (For Developers)

- **Database**: Folders are stored in the `item_folders` table.
- **Relationships**: Items are linked via `folder_id`.
- **Legacy Sync**: For compatibility, the system automatically syncs the new `folder_id` with the legacy `product_folder` string column. This ensures that older parts of the application that rely on the string field still work correctly.
- **Services**:
    - Backend: `itemGroupingService.js`
    - Frontend: `useItems.js` (specifically `useFolders` hook)

## Troubleshooting

**Issue**: "I created a folder but I don't see it."
**Solution**: Ensure you are connected to the correct tenant. If the folder is truly empty and was created before the "Empty Folder Visibility" fix, try creating it again or creating a new one. The UI now supports displaying empty folders.

**Issue**: "500 Internal Server Error when viewing reports."
**Solution**: This has been resolved. If it recurs, it is likely a multi-tenancy context issue. Check `reportService.js` to ensure models are loaded via `dbStore.get()`.
