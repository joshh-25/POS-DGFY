# CSV Import/Export Guide for Inventory Items

## Overview

This guide explains how to bulk import items (raw materials, packaging, products, supplies) using a CSV file, and how to export existing items to CSV.

## Quick Start - Import

1. Go to **Items** page
2. Click **Import / Export** button
3. Select **Import**
4. Download the appropriate template:
   - **Items Template** - For Raw Materials, Packaging, Supplies
   - **Products Template** - For WIP, Finished Goods
5. Upload your CSV
6. Review the preview and fix any errors
7. Click **Confirm Import**

## Quick Start - Export

1. Go to **Items** page
2. Click **Import / Export** button
3. Select **Export**
4. Choose export mode:
   - **All Items** - Export every item (ZIP file if mixed types)
   - **Filtered Items** - Export only items matching current page filters
   - **Select Items** - Manually pick specific items with checkboxes
5. Click **Export CSV**

---

## CSV Template Types

### Items Template (Raw Materials, Packaging, Supplies)
| Column | Description | Required |
|--------|-------------|----------|
| `sku_code` | Unique item code | ✅ |
| `name` | Item name | ✅ |
| `category` | `raw_material`, `packaging`, or `supplies` | ✅ |
| `description` | Item description | |
| `current_stock` | Initial stock quantity | |
| `max_capacity` | Maximum stock capacity | ✅ |
| `min_threshold` | Low stock warning threshold | |
| `purchase_allowance` | Extra stock buffer | |
| `unit_of_measure` | Unit of measure | ✅ |
| `cost_per_unit` | Unit cost in ₱ | |
| `fifo_enabled` | Enable FIFO tracking (`TRUE`/`FALSE`) | |
| `shelf_life_days` | Shelf life in days | |
| `opened_shelf_life_days` | Shelf life after opening | |
| `allergens` | Comma-separated values | |
| `packaging_height` | Height | |
| `packaging_width` | Width | |
| `packaging_thickness` | Thickness | |
| `packaging_material` | Material type | |
| `packaging_design` | Design info | |
| `packaging_contents` | Contents description | |

### Products Template (WIP, Finished Goods)

The Products template includes comprehensive fields from the 12-step Product Wizard.

#### Core Fields
| Column | Description | Required |
|--------|-------------|----------|
| `sku_code` | Unique item code | ✅ |
| `name` | Product name | ✅ |
| `category` | Must be `product` | ✅ |
| `product_type` | `work_in_progress` or `finished_goods` | ✅ |
| `description` | Product description | |
| `product_folder` | Folder for organizing products | |
| `current_stock` | Initial stock quantity | |
| `max_capacity` | Maximum stock capacity | ✅ |
| `min_threshold` | Low stock warning threshold | |
| `unit_of_measure` | Unit of measure | ✅ |
| `cost_per_unit` | Unit cost in ₱ | |
| `fifo_enabled` | Enable FIFO tracking (`TRUE`/`FALSE`) | |
| `shelf_life_days` | Shelf life in days | |
| `opened_shelf_life_days` | Shelf life after opening | |
| `batch_size` | Production batch size | |
| `yield_percentage` | Production yield (0-100) | |
| `processing_loss` | Production loss (0-100) | |
| `production_notes` | Production notes | |

#### Nutritional Info
| Column | Description |
|--------|-------------|
| `nutrition_serving_size` | Serving size (e.g., "100g") |
| `nutrition_calories` | Calories per serving |
| `nutrition_total_fat` | Total fat (g) |
| `nutrition_saturated_fat` | Saturated fat (g) |
| `nutrition_cholesterol` | Cholesterol (mg) |
| `nutrition_sodium` | Sodium (mg) |
| `nutrition_total_carbohydrates` | Total carbs (g) |
| `nutrition_dietary_fiber` | Dietary fiber (g) |
| `nutrition_sugars` | Sugars (g) |
| `nutrition_protein` | Protein (g) |

#### Allergens
| Column | Description |
|--------|-------------|
| `allergens` | Comma-separated: `milk,eggs,wheat` |
| `may_contain_allergens` | Cross-contamination warning |

#### Physical Properties
| Column | Description |
|--------|-------------|
| `physical_texture` | Texture (e.g., "smooth", "granular") |
| `physical_color` | Color description |
| `physical_viscosity` | Viscosity (e.g., "thick", "runny") |
| `physical_ph_level` | pH level (0-14) |
| `physical_water_activity` | Water activity (0-1) |

#### Extended Shelf Life
| Column | Description |
|--------|-------------|
| `shelf_storage_temperature` | `frozen`, `refrigerated`, `cool`, `room`, `ambient` |
| `shelf_storage_conditions` | Storage conditions text |

#### Packaging Info
| Column | Description |
|--------|-------------|
| `packaging_primary` | Primary packaging type |
| `packaging_secondary` | Secondary packaging type |
| `packaging_material` | Packaging material |
| `packaging_net_weight` | Net weight |
| `packaging_label_compliance` | Label compliant (`TRUE`/`FALSE`) |

#### Cost Breakdown
| Column | Description |
|--------|-------------|
| `cost_labor` | Labor cost per unit |
| `cost_overhead` | Overhead cost per unit |
| `cost_additional_packaging` | Additional packaging cost |

#### Quality Control
| Column | Description |
|--------|-------------|
| `qc_test_frequency` | `every_batch`, `daily`, `weekly`, `bi_weekly`, `monthly`, `quarterly` |
| `qc_sampling_plan` | Sampling plan details |
| `qc_acceptance_criteria` | Acceptance criteria |
| `qc_corrective_actions` | Corrective actions |

#### Regulatory Compliance
| Column | Description |
|--------|-------------|
| `compliance_fda_approved` | FDA approved (`TRUE`/`FALSE`) |
| `compliance_gmp_compliant` | GMP compliant (`TRUE`/`FALSE`) |
| `compliance_haccp_plan` | HACCP plan (`TRUE`/`FALSE`) |
| `compliance_organic_certified` | Organic certified (`TRUE`/`FALSE`) |
| `compliance_kosher_certified` | Kosher certified (`TRUE`/`FALSE`) |
| `compliance_halal_certified` | Halal certified (`TRUE`/`FALSE`) |

---

## Import Behavior

### Template Auto-Detection
The system automatically detects which template you're using based on the CSV headers:
- Headers with `allergens` or `packaging_height` → **Items Template**
- Headers with `product_type` or `batch_size` → **Products Template**

### Strict Validation
- **Items Template**: Only accepts `raw_material`, `packaging`, `supplies` categories
- **Products Template**: Only accepts `product` category
- Mismatched rows are **rejected** with clear error messages

### Upsert Mode
- **New SKU codes** → Creates new item
- **Existing SKU codes** → Updates the existing item

The preview will show "CREATE" or "UPDATE" status for each row.

### Import Order (Important!)
When importing products with recipes:
1. First import all **raw materials** and **packaging** items
2. Then import **products**
3. Add product recipes (ingredients/packaging) manually via the UI

---

## Export Behavior

### Export All
- Returns a **ZIP file** (`inventory_export_YYYY-MM-DD.zip`) containing:
  - `items.csv` - All raw materials, packaging, supplies
  - `products.csv` - All WIP and finished goods

### Export Filtered/Selected
- Returns **ZIP** if export contains mixed types (items + products)
- Returns **single CSV** if export contains only one type

---

## Allergens Column
Use comma-separated values: `milk,eggs,wheat`

Valid allergens: `milk`, `eggs`, `fish`, `shellfish`, `tree_nuts`, `peanuts`, `wheat`, `soybeans`, `sesame`

---

## Common Errors

| Error | Solution |
|-------|----------|
| `Name is required` | Add a value in the `name` column |
| `Category must be one of...` | Use exact values: `raw_material`, `packaging`, `product`, `supplies` |
| `product_type is required when category is "product"` | Add `work_in_progress` or `finished_goods` in `product_type` column |
| `Category 'product' is not valid for Items template` | Use the Products Template for products |
| `Category 'raw_material' is not valid for Products template` | Use the Items Template for raw materials |
| `Invalid allergens` | Use valid allergen names separated by commas |

---

## Tips

1. **Use the correct template**: Download Items Template for ingredients, Products Template for products
2. **Check the preview**: Always review errors before confirming
3. **Start small**: Test with a few rows first before bulk importing
4. **Import order matters**: Import ingredients before products
