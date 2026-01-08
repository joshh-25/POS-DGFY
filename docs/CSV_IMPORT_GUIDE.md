# CSV Import Guide for Inventory Items

## Overview

This guide explains how to bulk import items (raw materials, packaging, products, supplies) using a CSV file.

## Quick Start

1. Go to **Items** page
2. Click **Import CSV** button
3. Download the template or upload your CSV
4. Review the preview and fix any errors
5. Click **Confirm Import**

## CSV Template Structure

### Required Columns
| Column | Description | Valid Values |
|--------|-------------|--------------|
| `sku_code` | Unique item code (max 50 chars) | Text |
| `name` | Item name (max 255 chars) | Text |
| `category` | Item category | `raw_material`, `packaging`, `product`, `supplies` |
| `product_type` | **Required if category = product** | `work_in_progress`, `finished_goods` |
| `max_capacity` | Maximum stock capacity | Number > 0 |
| `unit_of_measure` | Unit of measure | `kg`, `g`, `pcs`, `ml`, `units`, etc. |

### Optional Columns
| Column | Description |
|--------|-------------|
| `description` | Item description |
| `product_folder` | Folder for organizing products |
| `min_threshold` | Low stock warning threshold |
| `purchase_allowance` | Extra stock buffer |
| `cost_per_unit` | Unit cost in ₱ |
| `fifo_enabled` | Enable FIFO tracking (`TRUE`/`FALSE`) |
| `shelf_life_days` | Shelf life in days |
| `opened_shelf_life_days` | Shelf life after opening |
| `batch_size` | Production batch size |
| `yield_percentage` | Production yield (0-100) |
| `processing_loss` | Production loss (0-100) |
| `production_notes` | Production notes |

### Packaging Specification Columns
| Column | Description |
|--------|-------------|
| `packaging_height` | Height |
| `packaging_width` | Width |
| `packaging_thickness` | Thickness |
| `packaging_material` | Material type |
| `packaging_design` | Design info |
| `packaging_contents` | Contents description |

### Allergens Column
Use comma-separated values: `milk,eggs,wheat`

Valid allergens: `milk`, `eggs`, `fish`, `shellfish`, `tree_nuts`, `peanuts`, `wheat`, `soybeans`, `sesame`

## Import Behavior

### Upsert Mode
- **New SKU codes** → Creates new item
- **Existing SKU codes** → Updates the existing item

The preview will show "CREATE" or "UPDATE" status for each row.

### Import Order (Important!)
When importing products with recipes:
1. First import all **raw materials** and **packaging** items
2. Then import **products**
3. Add product recipes (ingredients/packaging) manually via the UI

## Common Errors

| Error | Solution |
|-------|----------|
| `Name is required` | Add a value in the `name` column |
| `Category must be one of...` | Use exact values: `raw_material`, `packaging`, `product`, `supplies` |
| `product_type is required when category is "product"` | Add `work_in_progress` or `finished_goods` in `product_type` column |
| `Invalid allergens` | Use valid allergen names separated by commas |

## Tips

1. **Use the template**: Download the template for correct column headers
2. **Check the preview**: Always review errors before confirming
3. **Start small**: Test with a few rows first before bulk importing
