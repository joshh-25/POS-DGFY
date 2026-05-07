# MySQL Database Schema Design - SKU Inventory Manager

## Table of Contents

> **Navigation Tip:** Click a table name to jump directly to its schema definition.

### Overview
- [Database Overview](#database-overview)
- [Entity-Relationship Diagram](#entity-relationship-diagram)

### Multi-Tenant Architecture
- [Landlord Database (Registry)](#landlord-database-registry)
- [Tenant Databases (Isolated Contexts)](#tenant-databases-isolated-contexts)

### Recent Addenda
- [POS Shift-Location Safety Addendum (2026-04-21)](#pos-shift-location-safety-addendum-2026-04-21)
- [Food & Beverage Mode Addendum (2026-05-06)](#food--beverage-mode-addendum-2026-05-06)

### Table Definitions
- [1. Users Table](#1-users-table)
- [2. Items (SKU Master) Table](#2-items-sku-master-table)
- [3. FIFO Batches Table](#3-fifo-batches-table)
- [4. Item Nutrition Table](#4-item-nutrition-table)
- [5. Item Allergens Table](#5-item-allergens-table)
- [6. Product Composition Table](#6-product-composition-table)
- [7. Suppliers Table](#7-suppliers-table)
- [8. Supplier Items Table](#8-supplier-items-table)
- [9. Bulk Discounts Table](#9-bulk-discounts-table)
- [10. Purchase Orders Table](#10-purchase-orders-table)
- [11. PO Line Items Table](#11-po-line-items-table)
- [12. Job Orders Table](#12-job-orders-table)
- [13. JO Ingredients Table](#13-jo-ingredients-table)
- [14. Stock Movements Table](#14-stock-movements-table)
- [15. Batch Transactions Table](#15-batch-transactions-table)
- [16. Audit Logs Table](#16-audit-logs-table)
- [17. System Settings Table](#17-system-settings-table)
- [18. POS Catalog Overrides Table](#18-pos-catalog-overrides-table)
- [19. POS Terminal Shifts Table](#19-pos-terminal-shifts-table)
- [20. POS Cash Drawer Events Table](#20-pos-cash-drawer-events-table)
- [Food & Beverage Mode Addendum (2026-05-06)](#food--beverage-mode-addendum-2026-05-06)

### Database Administration
- [Key Indexes & Performance Optimization](#key-indexes--performance-optimization)
- [Data Integrity Constraints](#data-integrity-constraints)
- [Initial Data Setup](#initial-data-setup)
- [Backup & Recovery Strategy](#backup--recovery-strategy)
- [Migration Strategy](#migration-strategy)

---

# MySQL Database Schema Design - SKU Inventory Manager

## Database Overview

**MySQL Version**: 8.0+
**Character Set**: utf8mb4
**Collation**: utf8mb4_unicode_ci

## Multi-Tenant Architecture

This system uses a **Database-per-Tenant** isolation strategy. A central **Landlord** database manages the registry, while each company has its own isolated **Tenant** database.

### 1. Landlord Database (Registry)
**Database Name**: `SKU` (or as configured in `DB_NAME`)

This database identifies each tenant and routes API requests to the correct data source.

```sql
CREATE TABLE tenants (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    subdomain VARCHAR(100),
    db_name VARCHAR(100) NOT NULL UNIQUE,
    company_token VARCHAR(255) NOT NULL UNIQUE,
    db_host VARCHAR(255),
    status ENUM('pending', 'active', 'inactive', 'rejected', 'archived') DEFAULT 'pending',
    plan ENUM('standard', 'premium') DEFAULT 'standard',
    billing_cycle_anchor INT NULL,
    subscription_status ENUM('active', 'inactive', 'past_due', 'cancelled', 'pending') DEFAULT 'inactive',
    paypal_subscription_id VARCHAR(255) NULL,
    current_period_end DATETIME NULL,
    trial_ends_at DATETIME NULL,
    grace_period_end DATETIME NULL,
    cancelled_at DATETIME NULL,
    last_expiry_notified_at DATETIME NULL,
    last_expiry_notification_type VARCHAR(255) NULL,
    -- Subscription management fields (Phase 65)
    pending_plan ENUM('standard', 'premium') NULL,
    pending_plan_change_date DATE NULL,
    pending_plan_approved BOOLEAN DEFAULT false,
    pending_paypal_subscription_id VARCHAR(255) NULL,
    paypal_setup_initiated_at DATE NULL,
    pending_paymongo_subscription_id VARCHAR(255) NULL,
    paymongo_setup_initiated_at DATE NULL,
    paymongo_subscription_id VARCHAR(255) NULL,
    paymongo_source_id VARCHAR(255) NULL,
    payment_method ENUM('manual', 'paypal', 'paymongo') DEFAULT 'manual',
    reactivation_requested_at DATE NULL,
    rejection_reason VARCHAR(500) NULL,
    compliance_mode_state ENUM('non_compliant_active', 'compliant_pending', 'compliant_active') NULL,
    compliance_mode_choice_required BOOLEAN NOT NULL DEFAULT true,
    compliance_mode_selected_at DATETIME NULL,
    compliance_mode_selected_by VARCHAR(120) NULL,
    compliance_mode_override_by VARCHAR(120) NULL,
    compliance_mode_override_at DATETIME NULL,
    compliance_mode_override_reason VARCHAR(255) NULL,
    compliance_mode_revert_by VARCHAR(120) NULL,
    compliance_mode_revert_at DATETIME NULL,
    compliance_mode_revert_reason VARCHAR(255) NULL,
    compliance_cycle_version INT NOT NULL DEFAULT 0,
    compliance_revert_last_cycle_version INT NOT NULL DEFAULT 0,
    compliance_activated_at DATETIME NULL,
    compliance_policy_version VARCHAR(40) NULL,
    compliance_profile JSON NULL,
    settings JSON,
    admin_email VARCHAR(255),
    admin_password_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

Subscription notes:
- Tenant DB credentials are environment-driven at runtime (`DB_USER`, `DB_PASSWORD`); tenant-row plaintext credential columns are intentionally removed.
- `billing_cycle_anchor` backfill migration (`20260303000005-backfill-missing-billing-anchor.cjs`) only updates premium tenants with non-null `current_period_end` and null anchor.
- Phase 65 fields added via `20260309000001-extend-tenant-subscription-fields.cjs` (idempotent `describeTable` guard):
  - `payment_method`: `'manual'` = admin-invoiced; `'paypal'` = PayPal recurring; `'paymongo'` = PayMongo recurring
  - `pending_plan*` fields: track a queued plan change awaiting PayPal user re-consent
  - `pending_paypal_subscription_id` / `paypal_setup_initiated_at`: track admin-initiated PayPal setup links (72h TTL)
  - `pending_paymongo_subscription_id` / `paymongo_setup_initiated_at`: track admin-initiated PayMongo setup links
  - `paymongo_subscription_id` / `paymongo_source_id`: active PayMongo billing references
  - `reactivation_requested_at`: set when an inactive tenant requests reactivation
  - `rejection_reason`: populated by `rejectTenantUseCase`; surfaced in email lookup response
- Compliance lifecycle fields are landlord-tenant scoped and enforced in runtime + DB:
  - `compliance_mode_state`, `compliance_mode_choice_required`
  - `compliance_mode_selected_*`, `compliance_activated_at`
  - `compliance_mode_override_*`, `compliance_mode_revert_*`
  - `compliance_cycle_version`, `compliance_revert_last_cycle_version`
  - `compliance_policy_version`, `compliance_profile`
- Drift-alignment migrations:
  - `20260407000003-align-tenant-schema-with-model.cjs` aligns tenant landlord schema with active runtime model (including admin fields and enum normalization).
  - `20260407000002-compliance-hardening-phase1-2.cjs` and `20260407000005-add-compliance-audit-fallback-table.cjs` complete compliance table/column hardening for runtime checks.
  - `20260422000001-add-compliance-downgrade-override-controls.cjs` adds governed downgrade columns, audit event types, and controlled downgrade trigger support.
  - `20260422000002-harden-compliance-downgrade-controls.cjs` tightens trigger invariants (same-update marker mutation, no mixed override+revert mutation, and tenant one-per-cycle enforcement parity).

### 2. Tenant Databases (Isolated Contexts)
**Database Name Pattern**: `sku_tenant_[id]` or as specified in `tenants.db_name`

Every tenant database follows the **Master Schema** defined below. When a new company is registered, the system creates a new database and executes all migrations to ensure it matches this structure.

## POS Shift-Location Safety Addendum (2026-04-21)

The following POS location-safety schema additions are now part of the active tenant schema behavior:

1. `pos_terminal_shifts.location_id` is the shift location anchor for POS operations.
2. `pos_shift_location_transitions` stores privileged location switch audit transitions (close+open flow).
3. `pos_shift_location_backfill_audit` stores legacy shift-location remediation provenance (`resolution_source`, `resolution_reason`, `migration_tag`).
4. Terminal registry entries support a single home location mapping (`pos_terminal_registry[].location_id`) used by remediation and strict-binding policy checks.

Primary migrations:

1. `20260421000001-add-pos-shift-location-binding.cjs`
2. `20260421000002-remediate-pos-shift-location-backfill.cjs`

---

## Food & Beverage Mode Addendum (2026-05-06)

Food & Beverage Mode adds restaurant-only side tables while reusing shared `items`, nutrition/allergen, product composition, POS transaction, and stock-movement contracts.

Primary migration:

1. `20260505000002-create-fnb-restaurant-mode-tables.cjs`

Tenant-local F&B tables:

1. `fnb_modifier_groups`
2. `fnb_modifier_options`
3. `fnb_item_modifier_groups`
4. `fnb_dining_areas`
5. `fnb_dining_tables`
6. `fnb_kitchen_stations`
7. `fnb_item_kitchen_routes`
8. `fnb_checks`
9. `fnb_check_lines`
10. `fnb_kitchen_tickets`
11. `fnb_reservation_requests`
12. `fnb_reservation_tables`
13. `fnb_restaurant_service_charge_snapshots`

POS snapshot additions:

1. `pos_transactions.fnb_check_id`
2. `pos_transactions.fnb_table_id`
3. `pos_transactions.fnb_table_label_snapshot`
4. `pos_transactions.fnb_guest_count`
5. `pos_transactions.fnb_server_id`
6. `pos_transactions.restaurant_service_charge_amount`
7. `pos_transactions.restaurant_service_charge_label_snapshot`
8. `pos_transactions.restaurant_service_charge_rate_snapshot`
9. `pos_transactions.restaurant_service_charge_taxable`
10. `pos_transactions.fnb_metadata`
11. `pos_transaction_lines.fnb_course_snapshot`
12. `pos_transaction_lines.fnb_modifiers_snapshot`
13. `pos_transaction_lines.fnb_special_instructions`
14. `pos_transaction_lines.fnb_kitchen_station_snapshot`

Restaurant service charge remains separate from the DGFY convenience fee. DGFY continues to use `pos_transactions.service_fee_amount`; restaurant service charge uses `restaurant_service_charge_*` columns and `fnb_restaurant_service_charge_snapshots`. When `restaurant_service_charge_taxable=true`, checkout includes the restaurant service charge in the VATable gross calculation at transaction time.

F&B menu inventory reuses `product_composition` for recipes. POS checkout deducts ingredient rows for F&B menu items with `composition_type='ingredient'`; menu items without recipe rows continue to deduct the sold item directly.

F&B reservation scheduling stores `duration_minutes` and `buffer_minutes` on `fnb_reservation_requests` with `requested_at` and optional primary `table_id`. Combined-table bookings use `fnb_reservation_tables` to store every assigned table. Confirmed/seated reservations use the combined duration plus reset-buffer window to prevent overlap on any assigned table and to reject party sizes above selected seat capacity.

---

## Entity-Relationship Diagram

> **Reference Diagram**: See [Data Model Diagram](./images/data-model-diagram.png) for a visual representation of the complete database schema and entity relationships.
> **Implementation Note (2026-04-18)**: The diagram is conceptual and may omit newer generated/location-scoped columns (for example `items.active_sku_code`, location-scoped FIFO, and location-ledger tables). Treat SQL table definitions below as canonical.

```
┌─────────────────┐
│     Users       │
│─────────────────│
│ user_id (PK)    │
│ username        │
│ email           │
│ password_hash   │
│ role            │
│ created_at      │
│ updated_at      │
└────────┬────────┘
         │
         │ 1:N
         │
    ┌────▼─────────────────┐
    │  AuditLogs           │
    │──────────────────────│
    │ log_id (PK)          │
    │ user_id (FK)         │
    │ entity_type          │
    │ entity_id            │
    │ action               │
    │ changes              │
    │ timestamp            │
    └──────────────────────┘

┌──────────────────────────┐
│      Items (SKU Master)  │
│──────────────────────────│
│ item_id (PK)             │
│ sku_code (UNIQUE)        │
│ name                     │
│ category                 │
│ description              │
│ current_stock            │
│ max_capacity             │
│ min_threshold            │
│ purchase_allowance       │
│ unit_of_measure          │
│ cost_per_unit            │
│ default_sale_price       │
│ fifo_enabled             │
│ created_at               │
│ updated_at               │
└────────┬─────────────────┘
         │
    ┌────┴────────────────────┐
    │                         │
    │ 1:N                     │ 1:N
    │                         │
    ▼                         ▼
┌──────────────────┐   ┌──────────────────┐
│  FIFOBatches     │   │ ItemNutrition    │
│──────────────────│   │──────────────────│
│ batch_id (PK)    │   │ nutrition_id(PK) │
│ item_id (FK)     │   │ item_id (FK)     │
│ quantity         │   │ calories         │
│ cost_per_unit    │   │ protein          │
│ received_date    │   │ fat              │
│ expiry_date      │   │ carbohydrates    │
│ po_number (FK)   │   │ fiber            │
│ created_at       │   │ sodium           │
└──────────────────┘   └──────────────────┘

┌──────────────────┐
│  ItemAllergens   │
│──────────────────│
│ allergen_id(PK)  │
│ item_id (FK)     │
│ allergen_name    │
└──────────────────┘

┌──────────────────────────────┐
│  ProductComposition          │
│──────────────────────────────│
│ composition_id (PK)          │
│ product_id (FK)              │
│ ingredient_id (FK)           │
│ quantity_required            │
│ unit_of_measure              │
└──────────────────────────────┘

┌──────────────────────────┐
│      Suppliers           │
│──────────────────────────│
│ supplier_id (PK)         │
│ name                     │
│ contact_person           │
│ email                    │
│ phone                    │
│ address                  │
│ quality_rating           │
│ avg_delivery_days        │
│ is_active                │
│ created_at               │
│ updated_at               │
└────────┬─────────────────┘
         │
    ┌────┴─────────────────────┐
    │                          │
    │ 1:N                      │ 1:N
    │                          │
    ▼                          ▼
┌────────────────────┐  ┌──────────────────┐
│ SupplierItems      │  │ BulkDiscounts    │
│────────────────────│  │──────────────────│
│ supplier_item_id   │  │ discount_id (PK) │
│ supplier_id (FK)   │  │ supplier_id (FK) │
│ item_id (FK)       │  │ min_quantity     │
│ moq                │  │ discount_percent │
│ price_per_unit     │  │ created_at       │
│ last_price_update  │  └──────────────────┘
└────────────────────┘

┌────────────────────────────────┐
│     PurchaseOrders             │
│────────────────────────────────│
│ po_id (PK)                     │
│ po_number (UNIQUE)             │
│ supplier_id (FK)               │
│ order_date                     │
│ expected_delivery_date         │
│ received_date                  │
│ status                         │
│ subtotal                       │
│ discount                       │
│ total_amount                   │
│ delivery_rating                │
│ notes                          │
│ created_by (FK - Users)        │
│ created_at                     │
│ updated_at                     │
└────────┬────────────────────────┘
         │
         │ 1:N
         │
         ▼
    ┌────────────────────────┐
    │  POLineItems           │
    │────────────────────────│
    │ line_item_id (PK)      │
    │ po_id (FK)             │
    │ item_id (FK)           │
    │ quantity_ordered       │
    │ quantity_received      │
    │ unit_price             │
    │ total_price            │
    │ quality_check_status   │
    │ notes                  │
    └────────────────────────┘

┌────────────────────────────────┐
│       JobOrders                │
│────────────────────────────────│
│ jo_id (PK)                     │
│ jo_number (UNIQUE)             │
│ product_id (FK - Items)        │
│ quantity_to_produce            │
│ status                         │
│ created_date                   │
│ completion_date                │
│ responsible_user (FK - Users)  │
│ notes                          │
│ created_at                     │
│ updated_at                     │
└────────┬────────────────────────┘
         │
         │ 1:N
         │
         ▼
    ┌────────────────────────┐
    │ JOIngredients          │
    │────────────────────────│
    │ jo_ingredient_id (PK)  │
    │ jo_id (FK)             │
    │ item_id (FK)           │
    │ quantity_required      │
    │ quantity_consumed      │
    │ stock_before           │
    │ stock_after            │
    └────────────────────────┘

┌────────────────────────────────┐
│     StockMovements             │
│────────────────────────────────│
│ movement_id (PK)               │
│ item_id (FK)                   │
│ movement_type                  │
│ quantity                       │
│ from_location                  │
│ to_location                    │
│ reference_id                   │
│ reference_type                 │
│ user_responsible (FK - Users)  │
│ notes                          │
│ loss_reason                    │
│ weighted_average_cost          │
│ timestamp                      │
│ created_at                     │
└────────┬────────────────────────┘
         │
         │ 1:N
         │
         ▼
    ┌────────────────────────┐
    │ BatchTransactions      │
    │────────────────────────│
    │ transaction_id (PK)    │
    │ movement_id (FK)       │
    │ batch_id (FK)          │
    │ quantity_consumed      │
    │ remaining_after        │
    │ cost_per_unit          │
    └────────────────────────┘

┌────────────────────────────────┐
│      SystemSettings            │
│────────────────────────────────│
│ setting_id (PK)                │
│ setting_key (UNIQUE)           │
│ setting_value                  │
│ data_type                      │
│ description                    │
│ updated_at                     │
└────────────────────────────────┘
```

---

## Detailed Table Definitions

### Soft Delete Contract (2026-03-03)
- The system uses **manual soft delete** for `users`, `items`, and `suppliers`.
- Sequelize `paranoid` is **not** the source of truth for visibility.
- Service-layer queries enforce visibility using `deleted_at IS NULL` plus entity-specific status rules.
- Default resource behavior for soft-deleted targets is `404 Not Found`.

### 1. Users Table

```sql
CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'manager', 'staff', 'cashier', 'po', 'do', 'jo') DEFAULT 'staff',
    is_active BOOLEAN DEFAULT TRUE,
    permissions JSON,                    -- Granular permission array
    is_master_admin BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP NULL,

    -- Invitation system fields
    invitation_token VARCHAR(255) NULL,
    invitation_expires_at TIMESTAMP NULL,
    invited_by INT NULL,
    invitation_status ENUM('pending', 'accepted', 'expired') NULL,

    -- Soft delete fields (Remove from Company)
    deleted_at TIMESTAMP NULL,           -- When user was removed
    deleted_by INT NULL,                 -- Who removed the user (FK to user_id)

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_role (role),

    CONSTRAINT fk_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(user_id)
);
```

**Soft Delete Notes:**
- When a user is removed from the company, `deleted_at` is set to the removal timestamp
- `deleted_by` tracks which admin/manager performed the removal (audit trail)
- Removed users are excluded from `getAllUsers()` queries
- Removed users cannot log in (auth service checks `deleted_at`)
- User data is preserved for audit purposes
- Removed users can be re-invited (creates a new user record)

**Role Contract Notes (2026-03):**
- Expanded operational roles now include:
  - `cashier` (POS-first transactional operations)
  - `po` (purchase order operations)
  - `do` (dispatch order operations)
  - `jo` (job order operations)
- Role assignment defaults are enforced by backend permission maps (`DEFAULT_ROLE_PERMISSIONS`).

### 2. Item Folders Table

```sql
CREATE TABLE item_folders (
    folder_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NULL,
    show_in_pos_filter BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_item_folders_name (name),
    INDEX idx_item_folders_show_in_pos_filter (show_in_pos_filter)
);
```

**Folder Visibility Contract (2026-03-30 update):**
- `show_in_pos_filter = TRUE`: folder is available as POS category filter.
- `show_in_pos_filter = FALSE`: folder is hidden from POS category filters.
- Item sellability is still controlled by POS catalog override `pos_visible` at item level.

### 3. Items (SKU Master) Table

```sql
CREATE TABLE items (
    item_id INT PRIMARY KEY AUTO_INCREMENT,
    sku_code VARCHAR(50) NULL,
    active_sku_code VARCHAR(50)
      GENERATED ALWAYS AS (
        CASE
          WHEN deleted_at IS NULL
            AND status NOT IN ('draft', 'inactive')
            AND sku_code IS NOT NULL
            AND TRIM(sku_code) <> ''
          THEN UPPER(TRIM(sku_code))
          ELSE NULL
        END
      ) STORED,
    name VARCHAR(255) NOT NULL,
    category ENUM('raw_material', 'packaging', 'product', 'supplies', 'service') NOT NULL,
    product_type ENUM('work_in_progress', 'finished_goods') NULL,
    mode_item_preset VARCHAR(64) NULL,
    product_folder VARCHAR(100),
    folder_id INT NULL,
    description TEXT,
    current_stock DECIMAL(12, 2) DEFAULT 0,
    max_capacity DECIMAL(12, 2) NULL,
    min_threshold DECIMAL(12, 2),
    purchase_allowance DECIMAL(12, 2),
    unit_of_measure VARCHAR(50) NULL,  -- See UOM Standards below
    cost_per_unit DECIMAL(10, 4),
    default_sale_price DECIMAL(10, 4) NULL,
    fifo_enabled BOOLEAN DEFAULT TRUE,
    shelf_life_days INT NULL,
    opened_shelf_life_days INT NULL,
    batch_size DECIMAL(12, 2),
    yield_percentage DECIMAL(5, 2),
    processing_loss DECIMAL(5, 2),
    production_notes TEXT,
    packaging_specs JSON NULL,
    status ENUM('draft', 'active', 'inactive') DEFAULT 'active',
    deleted_by INT NULL,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_sku_code (sku_code),
    INDEX idx_category (category),
    INDEX idx_folder_id (folder_id),
    INDEX idx_deleted_at (deleted_at),
    INDEX idx_status (status),
    UNIQUE KEY uq_items_active_sku_code (active_sku_code),
    CONSTRAINT fk_items_folder FOREIGN KEY (folder_id) REFERENCES item_folders(folder_id),
    CONSTRAINT fk_items_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(user_id)
);
```

**Current Implementation Note (2026-05):**
- `items.vat_type` is implemented as `ENUM('vatable','vat_exempt','zero_rated')` with default `vatable`.
- POS uses this as the default tax classification source, then snapshots it at transaction-line level.
- `items.category` includes `service` for Services Mode item-backed catalog rows. Service-only rows are stock-exempt; physical products, add-ons, consumables, and supplies remain stock-bearing.
- `items.mode_item_preset` stores the corrected workflow-mode preset key when a row was created or intentionally recategorized through a governed mode taxonomy. It is nullable for legacy rows. F&B uses it to distinguish `menu_item` from `packaged_beverage` when both share `category='product'` and `product_type='finished_goods'`.

**SKU Uniqueness Contract (2026-04-18):**
- Runtime and DB both enforce case/whitespace-normalized uniqueness for active SKUs.
- `active_sku_code` is generated from `UPPER(TRIM(sku_code))` only for non-deleted and non-`draft`/`inactive` rows.
- The unique key `uq_items_active_sku_code` allows draft/inactive/archive flows without blocking active catalog uniqueness.

**Soft Delete Notes (Items):**
- Soft delete writes `status = 'inactive'`, `deleted_at`, and `deleted_by`.
- Default reads and mutations treat soft-deleted items as not found.
- Visibility is enforced in services, not via model-level paranoid behavior.

**Folder Filtering Canonical Path (2026-03-03 update):**
- Query filtering must use `items.folder_id` (indexed) instead of the legacy `items.product_folder` string.
- `product_folder` remains for compatibility/export metadata only and is not the performance path.
- `mode_item_preset` is indexed by `idx_items_mode_item_preset` for mode-native preset filtering and import/reporting checks.
- CSV export filtering was updated to resolve folder name via `item_folders.name` (indexed) then filter by `items.folder_id`.

#### UOM (Unit of Measure) Standards

The `unit_of_measure` field uses standardized abbreviations organized into convertible inventory groups and non-convertible business groups. Only weight, volume, and count units are **automatically convertible** for job order, recipe, and inventory calculations.

| Group | UOM Code | Display Name | Conversion Factor |
|-------|----------|--------------|-------------------|
| **Weight** | mg | Milligram | 0.001 g |
| | g | Gram | 1 (base) |
| | kg | Kilogram | 1000 g |
| | lb | Pound | 453.592 g |
| | oz | Ounce | 28.3495 g |
| **Volume** | mL | Milliliter | 1 (base) |
| | L | Liter | 1000 mL |
| | gal | Gallon | 3785.41 mL |
| | cup | Cup | 236.588 mL |
| | tbsp | Tablespoon | 14.787 mL |
| | tsp | Teaspoon | 4.929 mL |
| **Count** | pcs | Pieces | 1 (base) |
| | units | Units | 1 (equivalent to pcs) |
| | dozen | Dozen | 12 pcs |
| **Packaging** | pack | Pack | valid, not auto-convertible |
| | case | Case | valid, not auto-convertible |
| | carton | Carton | valid, not auto-convertible |
| | box | Box | valid, not auto-convertible |
| | tray | Tray | valid, not auto-convertible |
| | sack | Sack | valid, not auto-convertible |
| | bottle | Bottle | valid, not auto-convertible |
| | can | Can | valid, not auto-convertible |
| | pouch | Pouch | valid, not auto-convertible |
| | bag | Bag | valid, not auto-convertible |
| **Presentation** | serving | Serving | valid, not auto-convertible |
| | portion | Portion | valid, not auto-convertible |
| | service | Service | valid, not auto-convertible |
| | session | Session | valid, not auto-convertible |
| | booking | Booking | valid, not auto-convertible |
| | ticket | Ticket | valid, not auto-convertible |
| | room_night | Room night | valid, not auto-convertible |
| **Time** | minute | Minute | valid, not auto-convertible |
| | hour | Hour | valid, not auto-convertible |
| | day | Day | valid, not auto-convertible |

**Conversion Rules:**
- Only weight, volume, and count are convertible groups.
- Units within the same group convert automatically (e.g., kg ↔ g, L ↔ mL)
- Units in different groups are **incompatible** (e.g., kg ↔ L = error)
- `pcs` and `units` are treated as equivalent (1:1)
- Packaging, presentation, and time units are valid for item display, menu/service sales, ticketing, and supplier packaging, but they do not convert automatically. For example, `serving` cannot become `kg`, and `case` cannot become `pcs`, unless a future item/vendor conversion table explicitly defines that relationship.
- Legacy values (e.g., "Kilogram", "liters") are normalized via migration script

**Mode-Aware Item Taxonomy (2026-05-06):**
- Food Manufacturing uses Raw Material/Ingredient (`raw_material`), Packaging (`packaging`), Supplies (`supplies`), and Finished Product (`product` + `finished_goods`).
- MSME uses Products (`product` + `finished_goods`) and Supplies (`supplies`), preserving legacy raw/packaging records without destructive recategorization.
- Services uses Service (`service`, stock-exempt), Physical Add-on/Product (`product` + `finished_goods`), and Supplies (`supplies`).
- Food & Beverage uses Menu Item (`product` + `finished_goods`, default `serving`), Ingredient (`raw_material`, default `kg`), Packaged Beverage/Retail Item (`product` + `finished_goods`, default `bottle`), and Packaging/To-go Supply (`packaging`, default `pcs`).
- New corrected-mode rows persist `mode_item_preset`; legacy rows without it remain readable through category/product/UOM inference until the operator selects a corrected preset.
- Retail, Hospitality, Healthcare, Ticketing & Transport, Logistics & Distribution, and Education & Institutions remain placeholder item-taxonomy modes until their own governed mode pass defines item presets and UOM rules.

### 4. FIFO Batches Table

```sql
CREATE TABLE fifo_batches (
    batch_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    location_id INT NULL,
    quantity DECIMAL(12, 2) NOT NULL,
    cost_per_unit DECIMAL(10, 4),
    received_date DATE NOT NULL,
    expiry_date DATE,
    po_number VARCHAR(50),
    notes TEXT,
    quantity_consumed DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES tenant_locations(location_id) ON DELETE SET NULL,
    INDEX idx_item_id (item_id),
    INDEX idx_location_id (location_id),
    INDEX idx_item_location (item_id, location_id),
    INDEX idx_expiry_date (expiry_date),
    INDEX idx_received_date (received_date)
);
```

**Special Values:**
- `po_number = 'LEGACY-STOCK'`: Auto-created batch for legacy items that had `current_stock` but no FIFO batches. Created during JO completion when consumption is attempted on items without batches.

**Location Scope Note (2026-04-18):**
- FIFO batches are location-scoped when `location_id` is present.
- Batch reads for inventory operations can be filtered by `location_id` to preserve per-location FIFO depletion.

### Multi-Location Ledger Tables (2026-04-18)

```sql
CREATE TABLE tenant_locations (
    location_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    address_line TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    delivery_radius_km DECIMAL(5, 2) NOT NULL DEFAULT 5,
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_primary_storefront BOOLEAN NOT NULL DEFAULT FALSE,
    operating_hours JSON NULL,
    current_wait_time_minutes INT NOT NULL DEFAULT 15,
    allow_out_of_stock_sales BOOLEAN NOT NULL DEFAULT FALSE,
    supports_delivery BOOLEAN NOT NULL DEFAULT TRUE,
    supports_pickup BOOLEAN NOT NULL DEFAULT TRUE,
    supports_dine_in BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_is_active (is_active),
    INDEX idx_is_open (is_open),
    INDEX idx_primary_active (is_primary_storefront, is_active),
    INDEX idx_lat_lng (latitude, longitude)
);

CREATE TABLE item_location_stocks (
    item_location_stock_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    location_id INT NOT NULL,
    quantity_on_hand DECIMAL(24, 12) NOT NULL DEFAULT 0,
    updated_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_item_location_stock (item_id, location_id),
    INDEX idx_item_id (item_id),
    INDEX idx_location_id (location_id)
);

CREATE TABLE user_location_grants (
    user_location_grant_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    location_id INT NOT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_location_grant (user_id, location_id),
    INDEX idx_user_id (user_id),
    INDEX idx_location_id (location_id)
);
```

### 5. Item Nutrition Table

```sql
CREATE TABLE item_nutrition (
    nutrition_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL UNIQUE,
    serving_size VARCHAR(50),
    calories DECIMAL(8, 2),
    total_fat DECIMAL(8, 2),
    saturated_fat DECIMAL(8, 2),
    cholesterol DECIMAL(8, 2),
    sodium DECIMAL(8, 2),
    total_carbohydrates DECIMAL(8, 2),
    dietary_fiber DECIMAL(8, 2),
    sugars DECIMAL(8, 2),
    protein DECIMAL(8, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    INDEX idx_item_id (item_id)
);
```

### 5. Item Allergens Table

```sql
CREATE TABLE item_allergens (
    allergen_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    allergen_name VARCHAR(100) NOT NULL,
    is_cross_contamination BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    INDEX idx_item_id (item_id),
    UNIQUE KEY unique_allergen (item_id, allergen_name)
);
```

### 6. Product Composition Table

```sql
CREATE TABLE product_composition (
    composition_id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    ingredient_id INT NOT NULL,
    quantity_required DECIMAL(12, 2) NOT NULL,
    unit_of_measure VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES items(item_id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES items(item_id) ON DELETE RESTRICT,
    INDEX idx_product_id (product_id),
    INDEX idx_ingredient_id (ingredient_id)
);
```

### 7. Suppliers Table

```sql
CREATE TABLE suppliers (
    supplier_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    address TEXT,
    quality_rating DECIMAL(3, 2),
    avg_delivery_days INT,
    status ENUM('draft', 'active', 'inactive') DEFAULT 'active',
    last_delivery_date DATE,
    notes TEXT,
    deleted_by INT NULL,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_deleted_at (deleted_at),
    CONSTRAINT fk_suppliers_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(user_id)
);
```

**Soft Delete Notes (Suppliers):**
- Soft delete writes `status = 'inactive'`, `deleted_at`, and `deleted_by`.
- Default list/detail/mutation behavior excludes soft-deleted suppliers.

### 8. Supplier Items Table

```sql
CREATE TABLE supplier_items (
    supplier_item_id INT PRIMARY KEY AUTO_INCREMENT,
    supplier_id INT NOT NULL,
    item_id INT NOT NULL,
    moq DECIMAL(12, 2),
    price_per_unit DECIMAL(10, 4),
    last_price_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_preferred BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    INDEX idx_supplier_id (supplier_id),
    INDEX idx_item_id (item_id),
    UNIQUE KEY unique_supplier_item (supplier_id, item_id)
);
```

### 9. Bulk Discounts Table

```sql
CREATE TABLE bulk_discounts (
    discount_id INT PRIMARY KEY AUTO_INCREMENT,
    supplier_id INT NOT NULL,
    min_quantity DECIMAL(12, 2) NOT NULL,
    discount_percent DECIMAL(5, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
    INDEX idx_supplier_id (supplier_id)
);
```

### 10. Purchase Orders Table

```sql
CREATE TABLE purchase_orders (
    po_id INT PRIMARY KEY AUTO_INCREMENT,
    po_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id INT NOT NULL,
    order_date DATE NOT NULL,
    expected_delivery_date DATE,
    received_date DATE,
    status ENUM('pending', 'partial', 'received', 'cancelled') DEFAULT 'pending',
    subtotal DECIMAL(12, 2),
    discount DECIMAL(12, 2),
    total_amount DECIMAL(12, 2),
    delivery_rating DECIMAL(3, 2),
    notes TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
    FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX idx_po_number (po_number),
    INDEX idx_supplier_id (supplier_id),
    INDEX idx_status (status),
    INDEX idx_order_date (order_date)
);
```

### 11. PO Line Items Table

```sql
CREATE TABLE po_line_items (
    line_item_id INT PRIMARY KEY AUTO_INCREMENT,
    po_id INT NOT NULL,
    item_id INT NOT NULL,
    quantity_ordered DECIMAL(12, 2) NOT NULL,
    quantity_received DECIMAL(12, 2) DEFAULT 0,
    unit_price DECIMAL(10, 4) NOT NULL,
    total_price DECIMAL(12, 2),
    quality_check_status ENUM('pending', 'passed', 'failed') DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(item_id),
    INDEX idx_po_id (po_id),
    INDEX idx_item_id (item_id)
);
```

### 12. Job Orders Table

```sql
CREATE TABLE job_orders (
    jo_id INT PRIMARY KEY AUTO_INCREMENT,
    jo_number VARCHAR(50) UNIQUE NULL,
    product_id INT NOT NULL,
    quantity_to_produce DECIMAL(24, 12) NOT NULL,
    status ENUM('draft', 'in_progress', 'partial', 'completed', 'cancelled') DEFAULT 'draft',
    quantity_produced DECIMAL(24, 12) NOT NULL DEFAULT 0,
    quality_check ENUM('pass', 'fail', 'pending') NULL,
    completed_by INT NULL,
    archived_by INT NULL,
    archived_at TIMESTAMP NULL,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completion_date TIMESTAMP NULL,
    responsible_user INT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES items(item_id),
    FOREIGN KEY (responsible_user) REFERENCES users(user_id),
    INDEX idx_jo_number (jo_number),
    INDEX idx_product_id (product_id),
    INDEX idx_status (status),
    INDEX idx_created_date (created_date)
);
```

**Status Lifecycle:**
- `draft` → JO created but not finalized (no JO number assigned)
- `in_progress` → JO finalized and ready for production
- `partial` → Production partially completed (quantity_produced < quantity_to_produce)
- `completed` → Production fully completed
- `cancelled` → JO cancelled

**Partial Completion Support:**
- `quantity_produced` tracks how much has been produced so far
- Multiple completion operations can be performed until `quantity_produced = quantity_to_produce`
- Each partial completion consumes proportional ingredients

**Alignment Note (2026-04-07):**
- `20260407000004-align-job-orders-schema-with-model.cjs` adds missing `quality_check` and aligns `quantity_produced` precision with the runtime model contract.

### 13. JO Ingredients Table

```sql
CREATE TABLE jo_ingredients (
    jo_ingredient_id INT PRIMARY KEY AUTO_INCREMENT,
    jo_id INT NOT NULL,
    item_id INT NOT NULL,
    quantity_required DECIMAL(12, 2) NOT NULL,
    unit_of_measure VARCHAR(20),          -- Recipe UOM (may differ from item's stock UOM)
    quantity_consumed DECIMAL(12, 2),
    stock_before DECIMAL(12, 2),
    stock_after DECIMAL(12, 2),
    batch_id INT NULL,                    -- Primary FIFO batch used for consumption
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (jo_id) REFERENCES job_orders(jo_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(item_id),
    FOREIGN KEY (batch_id) REFERENCES fifo_batches(batch_id),
    INDEX idx_jo_id (jo_id),
    INDEX idx_item_id (item_id)
);
```

### 14. Stock Movements Table

```sql
CREATE TABLE stock_movements (
    movement_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    location_id INT NULL,
    source_location_id INT NULL,
    destination_location_id INT NULL,
    movement_type ENUM('production_consumption', 'purchase_receipt', 'return', 'transfer', 'calculated_loss', 'adjustment', 'production_output', 'goods_issue') NOT NULL,
    quantity DECIMAL(24, 12) NOT NULL,
    from_location VARCHAR(100),
    to_location VARCHAR(100),
    reference_id VARCHAR(50),
    reference_type ENUM('PO', 'JO', 'MANUAL', 'RETURN', 'DO', 'POS') DEFAULT 'MANUAL',
    user_responsible INT,
    notes TEXT,
    loss_reason ENUM('waste', 'spoilage', 'damage', 'pilferage', NULL) NULL,
    weighted_average_cost DECIMAL(10, 4),
    batch_id INT NULL,
    expiry_date DATE NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (item_id) REFERENCES items(item_id),
    FOREIGN KEY (location_id) REFERENCES tenant_locations(location_id) ON DELETE SET NULL,
    FOREIGN KEY (source_location_id) REFERENCES tenant_locations(location_id) ON DELETE SET NULL,
    FOREIGN KEY (destination_location_id) REFERENCES tenant_locations(location_id) ON DELETE SET NULL,
    FOREIGN KEY (user_responsible) REFERENCES users(user_id),
    INDEX idx_item_id (item_id),
    INDEX idx_location_id (location_id),
    INDEX idx_source_location_id (source_location_id),
    INDEX idx_destination_location_id (destination_location_id),
    INDEX idx_movement_type (movement_type),
    INDEX idx_timestamp (timestamp),
    INDEX idx_reference_id (reference_id),
    INDEX idx_item_type_timestamp (item_id, movement_type, timestamp)
);
```

**Current Implementation Note (2026-05-07):**
- Runtime movement usage includes `goods_issue` for outbound sales/dispatch.
- `reference_type` includes `POS` and `DO` in addition to legacy reference types.
- Transfer movements require `source_location_id` and `destination_location_id` with different values.
- Non-transfer movements use `location_id` for location-scoped stock and FIFO handling.
- Pure service rows (`items.category = service` or `items.mode_item_preset = service`) are stock-exempt and must not create manual stock movement, transfer, FIFO, weighted-cost, or inventory-valuation rows. Physical service add-ons/products and supplies remain normal stock-bearing inventory rows.

### 15. Batch Transactions Table

```sql
CREATE TABLE batch_transactions (
    transaction_id INT PRIMARY KEY AUTO_INCREMENT,
    movement_id INT NOT NULL,
    batch_id INT NOT NULL,
    quantity_consumed DECIMAL(12, 2) NOT NULL,
    remaining_after DECIMAL(12, 2),
    cost_per_unit DECIMAL(10, 4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (movement_id) REFERENCES stock_movements(movement_id) ON DELETE CASCADE,
    FOREIGN KEY (batch_id) REFERENCES fifo_batches(batch_id),
    INDEX idx_movement_id (movement_id),
    INDEX idx_batch_id (batch_id)
);
```

### 16. Audit Logs Table

```sql
CREATE TABLE audit_logs (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT,
    action ENUM('CREATE', 'UPDATE', 'DELETE', 'VIEW') NOT NULL,
    changes JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_entity_type (entity_type),
    INDEX idx_timestamp (timestamp)
);
```

### 17. System Settings Table

```sql
CREATE TABLE system_settings (
    setting_id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    data_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_setting_key (setting_key)
);
```

**Current Implementation Note (2026-03):**
- POS receipt/compliance settings are stored tenant-locally in this table:
  - `pos_business_name`
  - `pos_tin_branch`
  - `pos_address`
  - `pos_ptu_number`
  - `pos_min_number`
  - `pos_accreditation_number`
  - `pos_receipt_footer_message`
  - `pos_discount_profiles` (JSON array with named percentage presets)
  - `pos_order_method_fees` (deprecated, retained only for historical compatibility; no runtime pricing effect)
  - `pos_petty_cash_symbol` (string, e.g. `PHP`)
  - `pos_petty_cash_amount` (number, operational float for reconciliation)
- Compliance lifecycle is tenant-level (`tenants.compliance_mode_state`, `tenants.compliance_mode_choice_required`, `tenants.compliance_profile`) and no longer driven by a strict-toggle setting.

- POS discount and service-fee audit snapshots are stored in `pos_transactions`:
  - `discount_label_snapshot` (string, nullable)
  - `discount_rate_snapshot` (`DECIMAL(7,4)`, nullable, supports `0.0000` to `100.0000`)
  - `service_fee_amount` (decimal, default 0)
  - `service_fee_label_snapshot` (string, nullable)
  - `service_fee_method_snapshot` (enum `dine_in|takeout|pickup|delivery`, nullable; legacy `online` remains read-compatible for historical data)
  - `service_fee_overridden` (boolean, default false)

### 18. POS Catalog Overrides Table

```sql
CREATE TABLE pos_catalog_overrides (
    pos_catalog_override_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL UNIQUE,
    pos_visible BOOLEAN NOT NULL DEFAULT TRUE,
    pos_image_path VARCHAR(500) NULL,
    pos_image_url VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_item_id (item_id)
);
```

**Current Implementation Note (2026-03):**
- This table is tenant-local and optional-per-item.
- POS catalog read behavior:
  1. Base eligibility from `items` (active status/visibility constraints; all categories supported).
  2. Apply override if row exists:
     - `pos_visible=false` hides item from POS catalog.
     - `pos_image_url` provides terminal/in-house POS image override.
- Missing override row means category-aware default behavior (no image override):
  - `product + finished_goods` => visible
  - other categories/types => hidden until explicitly enabled

### 19. POS Terminal Shifts Table

```sql
CREATE TABLE pos_terminal_shifts (
    pos_terminal_shift_id INT PRIMARY KEY AUTO_INCREMENT,
    terminal_id VARCHAR(100) NOT NULL,
    opened_by INT NOT NULL,
    opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    opening_float_amount DECIMAL(14, 4) NOT NULL DEFAULT 0,
    opening_note TEXT NULL,
    closed_by INT NULL,
    closed_at TIMESTAMP NULL,
    closing_cash_amount DECIMAL(14, 4) NULL,
    closing_note TEXT NULL,
    expected_cash_amount DECIMAL(14, 4) NULL,
    variance_amount DECIMAL(14, 4) NULL,
    status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    business_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (opened_by) REFERENCES users(user_id),
    FOREIGN KEY (closed_by) REFERENCES users(user_id),
    INDEX idx_terminal_id (terminal_id),
    INDEX idx_status (status),
    INDEX idx_business_date (business_date)
);
```

**Current Implementation Note (2026-03):**
- Tracks cashier/session accountability for isolated terminal workflows.
- Checkout flow can require an active open shift before allowing POS transactions.

### 20. POS Cash Drawer Events Table

```sql
CREATE TABLE pos_cash_drawer_events (
    pos_cash_drawer_event_id INT PRIMARY KEY AUTO_INCREMENT,
    pos_terminal_shift_id INT NOT NULL,
    event_type ENUM('cash_in', 'cash_out') NOT NULL,
    amount DECIMAL(14, 4) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    recorded_by INT NOT NULL,
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (pos_terminal_shift_id) REFERENCES pos_terminal_shifts(pos_terminal_shift_id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(user_id),
    INDEX idx_shift_id (pos_terminal_shift_id),
    INDEX idx_recorded_at (recorded_at)
);
```

**Current Implementation Note (2026-03):**
- Used for shift-level cash-in/cash-out adjustments.
- Included in terminal cash summary and variance calculations.

---

## Key Indexes & Performance Optimization

### Primary Indexes
- All tables have primary keys for unique identification
- Foreign keys are indexed for join performance
- Frequently queried columns are indexed

### Runtime/CI Index Guard (2026-03-03)
- Backend enforces a required index contract for:
  - `items`: `sku_code`, `category`, `folder_id`, `deleted_at`, `status`
  - `stock_movements`: `item_id`, `batch_id`, `movement_type`, `timestamp`, `(item_id,movement_type,timestamp)`
  - `job_orders`: `product_id`, `status`
  - `jo_ingredients`: `item_id`, `batch_id`
- CI command: `npm run audit:indexes` (fails build on missing required indexes).
- Runtime guard: `/health` includes `services.schemaIndexes`; health becomes `503` when audit is degraded.
- Audit cadence/config:
  - `SCHEMA_INDEX_AUDIT_ENABLED`
  - `SCHEMA_INDEX_AUDIT_INTERVAL_MINUTES` (default `360`)
  - `SCHEMA_INDEX_AUDIT_TIMEOUT_MS` (default `5000`)

### Composite Indexes (for optimization)
```sql
-- For finding items by category and stock level
CREATE INDEX idx_category_stock ON items(category, current_stock);

-- For finding movements by item and date range
CREATE INDEX idx_item_timestamp ON stock_movements(item_id, timestamp);

-- For PO status tracking
CREATE INDEX idx_po_status_date ON purchase_orders(status, order_date);

-- For JO tracking
CREATE INDEX idx_jo_status_date ON job_orders(status, created_date);
```

---

## Data Integrity Constraints

### Referential Integrity
- All foreign keys enforce referential integrity
- Cascade delete for dependent records where appropriate
- Restrict delete for items referenced in compositions

### Business Rules
- Stock levels cannot go negative (enforced at application level)
- FIFO batches must have received_date before expiry_date
- Purchase order total must equal sum of line items
- Job order completion requires all ingredients to be available

### Unique Constraints
- SKU codes are globally unique
- PO numbers are unique
- JO numbers are unique
- Usernames and emails are unique

---

## Initial Data Setup

### Default System Settings
```sql
INSERT INTO system_settings (setting_key, setting_value, data_type, description) VALUES
('min_stock_threshold_percent', '40', 'number', 'Minimum stock as percentage of capacity'),
('purchase_allowance_percent', '20', 'number', 'Purchase allowance as percentage of capacity'),
('low_stock_alert_threshold', '30', 'number', 'Days before low stock alert'),
('forecast_days_ahead', '30', 'number', 'Number of days for forecasting'),
('currency', 'PHP', 'string', 'Default currency for financial tracking'),
('system_timezone', 'Asia/Manila', 'string', 'System timezone');
```

---

## Backup & Recovery Strategy

- Daily automated backups
- Point-in-time recovery capability
- Separate backup storage
- Regular backup integrity tests

---

## Migration Strategy

### Phase 1: Schema Creation
- Create all tables with relationships
- Create indexes and constraints
- Create views for reporting

### Phase 2: Data Migration
- Migrate from frontend mock data to database
- Validate data integrity
- Create audit trail for initial data

### Phase 3: Optimization
- Monitor query performance
- Add additional indexes if needed
- Optimize slow queries
