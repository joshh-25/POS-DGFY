import crypto from 'crypto';
import fs from 'fs/promises';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Sequelize } from 'sequelize';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const MAIN_DB = process.env.DB_NAME || 'sku_inventory_manager';

const isExplicitlyApproved = (value) => String(value || '').trim().toLowerCase() === 'true';

// Report mode is safe in every environment. Any tenant DDL needs an operator to
// opt in explicitly so a copied command or deploy configuration cannot mutate
// every active tenant by accident.
export function assertTenantSchemaMutationModeAllowed(mode, environment = process.env) {
    if (!['repair-apply', 'alter'].includes(mode)) {
        return;
    }

    if (!isExplicitlyApproved(environment.TENANT_SCHEMA_MUTATION_APPROVED)) {
        throw new Error(
            `Tenant schema mode "${mode}" changes active tenant databases. Set TENANT_SCHEMA_MUTATION_APPROVED=true after backup and review.`
        );
    }

    if (mode === 'alter' && String(environment.NODE_ENV || '').trim().toLowerCase() === 'production') {
        throw new Error(
            'Tenant schema mode "alter" is blocked in production. Use reviewed additive migrations or repair-apply with explicit approval.'
        );
    }
}

export const REQUIRED_TENANT_SCHEMA_COLUMNS = Object.freeze({
    storefront_catalog_overrides: Object.freeze({
        image_fingerprint: Object.freeze({
            sql: "ALTER TABLE `storefront_catalog_overrides` ADD COLUMN `image_fingerprint` VARCHAR(64) NULL COMMENT 'SHA-256 fingerprint of the source catalog image asset'"
        }),
        optimization_version: Object.freeze({
            sql: "ALTER TABLE `storefront_catalog_overrides` ADD COLUMN `optimization_version` INT NULL COMMENT 'Image optimization version (2 for responsive v2)'"
        }),
        processing_status: Object.freeze({
            sql: "ALTER TABLE `storefront_catalog_overrides` ADD COLUMN `processing_status` VARCHAR(20) NULL COMMENT 'Image optimization status (optimized|legacy|pending|failed)'"
        }),
        variant_metadata: Object.freeze({
            sql: "ALTER TABLE `storefront_catalog_overrides` ADD COLUMN `variant_metadata` JSON NULL COMMENT 'Semantic image variant paths and metadata'"
        })
    }),
    pos_catalog_overrides: Object.freeze({
        pos_always_available: Object.freeze({
            sql: "ALTER TABLE `pos_catalog_overrides` ADD COLUMN `pos_always_available` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'POS-only stock exemption; never changes Storefront visibility or Inventory stock truth'"
        }),
        pos_best_seller_mode: Object.freeze({
            sql: "ALTER TABLE `pos_catalog_overrides` ADD COLUMN `pos_best_seller_mode` VARCHAR(10) NOT NULL DEFAULT 'auto' COMMENT 'POS best seller override: auto uses completed paid sales, force always tags, never suppresses the tag'"
        })
    }),
    users: Object.freeze({
        pos_approval_pin_hash: Object.freeze({
            sql: "ALTER TABLE `users` ADD COLUMN `pos_approval_pin_hash` VARCHAR(255) NULL"
        }),
        pos_day_close_pin_hash: Object.freeze({
            sql: "ALTER TABLE `users` ADD COLUMN `pos_day_close_pin_hash` VARCHAR(255) NULL"
        })
    }),
    audit_logs: Object.freeze({
        event_type: Object.freeze({
            sql: "ALTER TABLE `audit_logs` ADD COLUMN `event_type` VARCHAR(100) NULL"
        }),
        actor_username: Object.freeze({
            sql: "ALTER TABLE `audit_logs` ADD COLUMN `actor_username` VARCHAR(120) NULL"
        }),
        terminal_id: Object.freeze({
            sql: "ALTER TABLE `audit_logs` ADD COLUMN `terminal_id` VARCHAR(100) NULL"
        }),
        shift_id: Object.freeze({
            sql: "ALTER TABLE `audit_logs` ADD COLUMN `shift_id` BIGINT NULL"
        }),
        location_id: Object.freeze({
            sql: "ALTER TABLE `audit_logs` ADD COLUMN `location_id` INTEGER NULL"
        }),
        reason: Object.freeze({
            sql: "ALTER TABLE `audit_logs` ADD COLUMN `reason` VARCHAR(500) NULL"
        }),
        request_id: Object.freeze({
            sql: "ALTER TABLE `audit_logs` ADD COLUMN `request_id` VARCHAR(100) NULL"
        })
    }),
    pos_z_reading_snapshots: Object.freeze({
        location_id: Object.freeze({
            sql: "ALTER TABLE `pos_z_reading_snapshots` ADD COLUMN `location_id` INTEGER NULL"
        }),
        closed_by_user_id: Object.freeze({
            sql: "ALTER TABLE `pos_z_reading_snapshots` ADD COLUMN `closed_by_user_id` INTEGER NULL"
        }),
        closed_from_terminal_id: Object.freeze({
            sql: "ALTER TABLE `pos_z_reading_snapshots` ADD COLUMN `closed_from_terminal_id` VARCHAR(100) NULL"
        }),
        day_close_pin_confirmed_at: Object.freeze({
            sql: "ALTER TABLE `pos_z_reading_snapshots` ADD COLUMN `day_close_pin_confirmed_at` DATETIME NULL"
        })
    }),
    pos_transaction_lines: Object.freeze({
        stock_effect_type: Object.freeze({
            sql: "ALTER TABLE `pos_transaction_lines` ADD COLUMN `stock_effect_type` ENUM('inventory_issue','stock_exempt') NOT NULL DEFAULT 'inventory_issue' COMMENT 'Immutable checkout-time stock-effect classification'"
        }),
        stock_exempt_reason: Object.freeze({
            sql: "ALTER TABLE `pos_transaction_lines` ADD COLUMN `stock_exempt_reason` VARCHAR(80) NULL COMMENT 'Immutable reason when a POS sale line intentionally creates no inventory movement'"
        }),
        item_name_snapshot: Object.freeze({
            sql: "ALTER TABLE `pos_transaction_lines` ADD COLUMN `item_name_snapshot` VARCHAR(255) NULL COMMENT 'Sale-time item name snapshot; immune to later item renames (issue #178 phase 5)'"
        }),
        sku_snapshot: Object.freeze({
            sql: "ALTER TABLE `pos_transaction_lines` ADD COLUMN `sku_snapshot` VARCHAR(100) NULL COMMENT 'Sale-time SKU snapshot; immune to later item edits (issue #178 phase 5)'"
        }),
        item_discount_snapshot: Object.freeze({
            sql: "ALTER TABLE `pos_transaction_lines` ADD COLUMN `item_discount_snapshot` JSON NULL COMMENT 'Server-calculated item-specific discount snapshot; global sale discounts remain separate'"
        })
    }),
    items: Object.freeze({
        senior_pwd_discount_eligible: Object.freeze({
            sql: "ALTER TABLE `items` ADD COLUMN `senior_pwd_discount_eligible` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Admin-controlled eligibility for statutory Senior Citizen/PWD discounts'"
        }),
        tracking_mode: Object.freeze({
            sql: "ALTER TABLE `items` ADD COLUMN `tracking_mode` VARCHAR(20) NULL COMMENT 'Axis 4 availability/tracking mode (untracked|count_ledger|full_fifo|toggle|capacity|external_ims|recipe_derived); NULL falls back to legacy derivation'"
        }),
        tracking_toggle_available: Object.freeze({
            sql: "ALTER TABLE `items` ADD COLUMN `tracking_toggle_available` TINYINT(1) NULL DEFAULT 1 COMMENT 'Operator-declared availability, only meaningful when tracking_mode=toggle'"
        })
    }),
    fnb_item_modifier_groups: Object.freeze({
        is_excluded: Object.freeze({
            sql: "ALTER TABLE `fnb_item_modifier_groups` ADD COLUMN `is_excluded` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Explicit item-level opt-out from folder-inherited modifier groups'"
        })
    }),
    item_folders: Object.freeze({
        is_active: Object.freeze({
            sql: "ALTER TABLE `item_folders` ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `show_in_pos_filter`"
        }),
        deleted_at: Object.freeze({
            sql: "ALTER TABLE `item_folders` ADD COLUMN `deleted_at` DATETIME NULL"
        }),
        deleted_by: Object.freeze({
            sql: "ALTER TABLE `item_folders` ADD COLUMN `deleted_by` INTEGER NULL"
        }),
        active_name_key: Object.freeze({
            sql: "ALTER TABLE `item_folders` ADD COLUMN `active_name_key` VARCHAR(100) GENERATED ALWAYS AS (CASE WHEN `is_active` = 1 AND `deleted_at` IS NULL THEN LOWER(TRIM(`name`)) ELSE NULL END) STORED"
        })
    }),
    pos_transactions: Object.freeze({
        cash_received: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `cash_received` DECIMAL(14,4) NULL AFTER `payment_type`"
        }),
        change_amount: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `change_amount` DECIMAL(14,4) NULL AFTER `cash_received`"
        }),
        payment_timing: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `payment_timing` ENUM('upfront','on_pickup','on_delivery') NOT NULL DEFAULT 'upfront' AFTER `payment_type`"
        }),
        // Phase 137 (#819) -- ADR 0069 clause 4a. Flat DEFAULT, no CASE backfill, matching the
        // payment_timing repair entry above -- a repaired tenant's historical rows land on the
        // default rather than a computed backfill; this is existing registry convention, not a
        // gap introduced here.
        amount_paid: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `amount_paid` DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER `total_amount`"
        }),
        balance_due: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `balance_due` DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER `amount_paid`"
        }),
        payment_collected_at: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `payment_collected_at` DATETIME NULL AFTER `payment_status`"
        }),
        payment_collected_by: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `payment_collected_by` INTEGER NULL AFTER `payment_collected_at`"
        }),
        payment_collected_shift_id: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `payment_collected_shift_id` INTEGER NULL AFTER `payment_collected_by`"
        }),
        payment_collected_terminal_id: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `payment_collected_terminal_id` VARCHAR(100) NULL AFTER `payment_collected_shift_id`"
        }),
        employee_credit_account_id: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `employee_credit_account_id` INTEGER NULL"
        }),
        employee_credit_user_id: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `employee_credit_user_id` INTEGER NULL"
        }),
        employee_credit_employee_id: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `employee_credit_employee_id` INTEGER NULL"
        }),
        employee_credit_employee_name_snapshot: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `employee_credit_employee_name_snapshot` VARCHAR(255) NULL"
        }),
        employee_credit_account_code_snapshot: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `employee_credit_account_code_snapshot` VARCHAR(40) NULL"
        }),
        employee_credit_amount: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `employee_credit_amount` DECIMAL(14,4) NULL"
        }),
        employee_credit_balance_after: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `employee_credit_balance_after` DECIMAL(14,4) NULL"
        }),
        employee_credit_outstanding_after: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `employee_credit_outstanding_after` DECIMAL(14,4) NULL AFTER `employee_credit_balance_after`"
        }),
        employee_credit_authorization_reference: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `employee_credit_authorization_reference` VARCHAR(80) NULL"
        }),
        payment_breakdown: Object.freeze({
            sql: "ALTER TABLE `pos_transactions` ADD COLUMN `payment_breakdown` JSON NULL COMMENT 'Immutable successful tender allocation snapshot for receipts and reports'"
        })
    }),
    pos_parked_sales: Object.freeze({
        revision: Object.freeze({
            sql: "ALTER TABLE `pos_parked_sales` ADD COLUMN `revision` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `status`"
        }),
        origin_cashier_id: Object.freeze({
            sql: "ALTER TABLE `pos_parked_sales` ADD COLUMN `origin_cashier_id` INTEGER NULL AFTER `cashier_id`"
        }),
        origin_shift_id: Object.freeze({
            sql: "ALTER TABLE `pos_parked_sales` ADD COLUMN `origin_shift_id` INTEGER NULL AFTER `shift_id`"
        })
    }),
    pos_payment_allocations: Object.freeze({
        provider_event_id: Object.freeze({
            sql: "ALTER TABLE `pos_payment_allocations` ADD COLUMN `provider_event_id` VARCHAR(120) NULL COMMENT 'Provider event identity accepted by server reconciliation'"
        }),
        provider_refund_ids: Object.freeze({
            sql: "ALTER TABLE `pos_payment_allocations` ADD COLUMN `provider_refund_ids` JSON NULL COMMENT 'Provider refund identities observed during reconciliation'"
        }),
        provider_refund_event_id: Object.freeze({
            sql: "ALTER TABLE `pos_payment_allocations` ADD COLUMN `provider_refund_event_id` VARCHAR(255) NULL COMMENT 'Stable provider refund event identity used for replay protection'"
        }),
        provider_refund_status: Object.freeze({
            sql: "ALTER TABLE `pos_payment_allocations` ADD COLUMN `provider_refund_status` VARCHAR(40) NULL"
        }),
        provider_refunded_at: Object.freeze({
            sql: "ALTER TABLE `pos_payment_allocations` ADD COLUMN `provider_refunded_at` DATETIME NULL"
        }),
        reversed_amount: Object.freeze({
            sql: "ALTER TABLE `pos_payment_allocations` ADD COLUMN `reversed_amount` DECIMAL(14,4) NOT NULL DEFAULT 0 COMMENT 'Successful allocation amount reversed through append-only adjustment evidence'"
        }),
        reversal_status: Object.freeze({
            sql: "ALTER TABLE `pos_payment_allocations` ADD COLUMN `reversal_status` ENUM('none','pending','partial','completed','manual_review_required') NOT NULL DEFAULT 'none'"
        })
    }),
    pos_transaction_adjustments: Object.freeze({
        pos_payment_allocation_id: Object.freeze({
            sql: "ALTER TABLE `pos_transaction_adjustments` ADD COLUMN `pos_payment_allocation_id` INTEGER NULL COMMENT 'Allocation-level reversal attribution for split-tender refunds'"
        })
    }),
    pos_terminal_shifts: Object.freeze({
        active_terminal_id: Object.freeze({
            sql: "ALTER TABLE `pos_terminal_shifts` ADD COLUMN `active_terminal_id` VARCHAR(100) GENERATED ALWAYS AS (CASE WHEN `status` = 'open' THEN UPPER(TRIM(`terminal_id`)) ELSE NULL END) STORED"
        }),
        active_operator_user_id: Object.freeze({
            sql: "ALTER TABLE `pos_terminal_shifts` ADD COLUMN `active_operator_user_id` INTEGER GENERATED ALWAYS AS (CASE WHEN `status` = 'open' THEN `cashier_id` ELSE NULL END) STORED"
        })
    }),
    service_item_details: Object.freeze({
        addons_enabled: Object.freeze({
            sql: "ALTER TABLE `service_item_details` ADD COLUMN `addons_enabled` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Per-service switch controlling add-on option availability'"
        })
    }),
    fnb_modifier_groups: Object.freeze({
        visible_in_pos: Object.freeze({
            sql: "ALTER TABLE `fnb_modifier_groups` ADD COLUMN `visible_in_pos` TINYINT(1) NOT NULL DEFAULT 1"
        }),
        visible_in_storefront: Object.freeze({
            sql: "ALTER TABLE `fnb_modifier_groups` ADD COLUMN `visible_in_storefront` TINYINT(1) NOT NULL DEFAULT 1"
        }),
        group_kind: Object.freeze({
            sql: "ALTER TABLE `fnb_modifier_groups` ADD COLUMN `group_kind` VARCHAR(24) NOT NULL DEFAULT 'modifier'"
        }),
        parent_modifier_option_id: Object.freeze({
            sql: "ALTER TABLE `fnb_modifier_groups` ADD COLUMN `parent_modifier_option_id` INT NULL, ADD CONSTRAINT `fk_fnb_modifier_groups_parent_option` FOREIGN KEY (`parent_modifier_option_id`) REFERENCES `fnb_modifier_options` (`modifier_option_id`) ON DELETE SET NULL"
        })
    }),
    fnb_modifier_options: Object.freeze({
        visible_in_pos: Object.freeze({
            sql: "ALTER TABLE `fnb_modifier_options` ADD COLUMN `visible_in_pos` TINYINT(1) NOT NULL DEFAULT 1"
        }),
        visible_in_storefront: Object.freeze({
            sql: "ALTER TABLE `fnb_modifier_options` ADD COLUMN `visible_in_storefront` TINYINT(1) NOT NULL DEFAULT 1"
        }),
        is_sold_out: Object.freeze({
            sql: "ALTER TABLE `fnb_modifier_options` ADD COLUMN `is_sold_out` TINYINT(1) NOT NULL DEFAULT 0"
        })
    }),
    pos_transaction_discounts: Object.freeze({
        promo_code: Object.freeze({
            sql: "ALTER TABLE `pos_transaction_discounts` ADD COLUMN `promo_code` VARCHAR(40) NULL COMMENT 'Commercial promo code validated by the server at checkout'"
        })
    }),
    delivery_jobs: Object.freeze({
        delivery_personnel_id: Object.freeze({
            sql: "ALTER TABLE `delivery_jobs` ADD COLUMN `delivery_personnel_id` INT NULL"
        }),
        delivery_personnel_name: Object.freeze({
            sql: "ALTER TABLE `delivery_jobs` ADD COLUMN `delivery_personnel_name` VARCHAR(255) NULL"
        }),
        assigned_by: Object.freeze({
            sql: "ALTER TABLE `delivery_jobs` ADD COLUMN `assigned_by` INT NULL"
        }),
        assigned_at: Object.freeze({
            sql: "ALTER TABLE `delivery_jobs` ADD COLUMN `assigned_at` DATETIME NULL"
        }),
        assigned_shift_id: Object.freeze({
            sql: "ALTER TABLE `delivery_jobs` ADD COLUMN `assigned_shift_id` INT NULL"
        })
    }),
    // Added by migration 20260809000003-add-disabled-capabilities-to-workflow-mode-change-log.cjs
    // (issue #178 phase 16): audits the new ops_disabled_capabilities
    // subtractive overlay alongside the pre-existing enabled-capabilities pair.
    workflow_mode_change_log: Object.freeze({
        from_disabled_capabilities: Object.freeze({
            sql: "ALTER TABLE `workflow_mode_change_log` ADD COLUMN `from_disabled_capabilities` JSON NULL"
        }),
        to_disabled_capabilities: Object.freeze({
            sql: "ALTER TABLE `workflow_mode_change_log` ADD COLUMN `to_disabled_capabilities` JSON NULL"
        })
    }),
    // #696: added to the pre-existing `vouchers` table rather than folded into that table's own
    // CREATE TABLE entry above, matching how every other post-creation column addition in this repo
    // is repaired. Safe to add the FK inline here (unlike `voucher_scopes.scope_ref_id`) because the
    // table-repair pass that creates `pricelists` (below) always runs before this column-repair pass
    // -- confirmed against this script's own driver, which applies missing tables first, then
    // missing columns, in that fixed order.
    // #713: same repair-only mechanism #696's `pricelist_id` entry above already established --
    // REQUIRED_TENANT_SCHEMA_TABLES' `vouchers` CREATE TABLE string is a verbatim landlord-DB
    // snapshot from before this column existed, and is deliberately not edited to add it. Every
    // tenant (new or pre-existing) gets it from this repair pass instead, since table-creation
    // always runs before column-repair, unconditionally.
    vouchers: Object.freeze({
        pricelist_id: Object.freeze({
            sql: "ALTER TABLE `vouchers` ADD COLUMN `pricelist_id` INT NULL, ADD CONSTRAINT `fk_vouchers_pricelist` FOREIGN KEY (`pricelist_id`) REFERENCES `pricelists` (`pricelist_id`)"
        }),
        is_publicly_listed: Object.freeze({
            sql: "ALTER TABLE `vouchers` ADD COLUMN `is_publicly_listed` TINYINT(1) NOT NULL DEFAULT 0"
        })
    })
});

// Whole tables that a migration created but that never got backfilled onto pre-existing tenant
// schemas (only the landlord DB and tenants provisioned after the migration have them). DDL is
// copied verbatim from `SHOW CREATE TABLE` against the landlord DB so tenant clones match exactly
// (column types, defaults, keys, FK constraints) — declaration order matters, since later tables
// have foreign keys pointing at earlier ones.
export const REQUIRED_TENANT_SCHEMA_TABLES = Object.freeze({
    // #539: the three base F&B modifier tables. A tenant provisioned before
    // 20260505000002-create-fnb-restaurant-mode-tables.cjs and never otherwise migrated forward can
    // be missing all three entirely - REQUIRED_TENANT_SCHEMA_COLUMNS/_INDEXES already carry entries
    // for later additions to these tables (visible_in_pos, group_kind, is_sold_out, is_excluded,
    // idx_fnb_modifier_groups_parent_option, ...) but had no CREATE TABLE fallback for the base
    // tables themselves. Same failure shape as storefront_catalog_overrides below: the first
    // column-level ALTER TABLE against a wholly-missing table fails with "table doesn't exist" (or,
    // observed live, a downstream child table's FK reporting "Failed to open the referenced table"),
    // which fails the tenant schema preflight and crash-loops the whole backend for every tenant,
    // not just the one missing these tables. Declared first in this registry, in dependency order,
    // since fnb_modifier_group_location_availability/fnb_modifier_option_location_availability/
    // fnb_folder_modifier_groups below all FK-reference fnb_modifier_groups/fnb_modifier_options.
    //
    // fnb_modifier_groups deliberately omits parent_modifier_option_id and its FK to
    // fnb_modifier_options here - fnb_modifier_options doesn't exist yet at this point in the
    // repair sequence, and the column was genuinely added later in real history (matching how the
    // original migration created this table before that FK existed). The existing
    // REQUIRED_TENANT_SCHEMA_COLUMNS.fnb_modifier_groups.parent_modifier_option_id entry and the
    // existing REQUIRED_TENANT_SCHEMA_INDEXES.fnb_modifier_groups.idx_fnb_modifier_groups_parent_option
    // entry add the column, its FK, and its index afterward, once both tables exist.
    fnb_modifier_groups: Object.freeze({
        sql: "CREATE TABLE `fnb_modifier_groups` ("
            + " `modifier_group_id` INT NOT NULL AUTO_INCREMENT,"
            + " `name` VARCHAR(120) NOT NULL, `display_name` VARCHAR(120) DEFAULT NULL,"
            + " `min_select` INT NOT NULL DEFAULT 0, `max_select` INT NOT NULL DEFAULT 1,"
            + " `required` TINYINT(1) NOT NULL DEFAULT 0, `is_active` TINYINT(1) NOT NULL DEFAULT 1,"
            + " `sort_order` INT NOT NULL DEFAULT 0,"
            + " `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL,"
            + " `visible_in_pos` TINYINT(1) NOT NULL DEFAULT 1,"
            + " `visible_in_storefront` TINYINT(1) NOT NULL DEFAULT 1,"
            + " `group_kind` VARCHAR(24) NOT NULL DEFAULT 'modifier',"
            + " PRIMARY KEY (`modifier_group_id`),"
            + " KEY `fnb_modifier_groups_is_active` (`is_active`),"
            + " KEY `fnb_modifier_groups_sort_order` (`sort_order`)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    fnb_modifier_options: Object.freeze({
        sql: "CREATE TABLE `fnb_modifier_options` ("
            + " `modifier_option_id` INT NOT NULL AUTO_INCREMENT, `modifier_group_id` INT NOT NULL,"
            + " `name` VARCHAR(120) NOT NULL, `price_delta` DECIMAL(14,4) NOT NULL DEFAULT 0,"
            + " `sku_item_id` INT DEFAULT NULL, `is_default` TINYINT(1) NOT NULL DEFAULT 0,"
            + " `is_active` TINYINT(1) NOT NULL DEFAULT 1,"
            + " `allergen_notes` LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,"
            + " `sort_order` INT NOT NULL DEFAULT 0,"
            + " `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL,"
            + " `visible_in_pos` TINYINT(1) NOT NULL DEFAULT 1,"
            + " `visible_in_storefront` TINYINT(1) NOT NULL DEFAULT 1,"
            + " `is_sold_out` TINYINT(1) NOT NULL DEFAULT 0,"
            + " PRIMARY KEY (`modifier_option_id`),"
            + " KEY `fnb_modifier_options_modifier_group_id` (`modifier_group_id`),"
            + " KEY `fnb_modifier_options_sku_item_id` (`sku_item_id`),"
            + " KEY `fnb_modifier_options_is_active` (`is_active`),"
            + " CONSTRAINT `fk_fnb_modifier_options_group` FOREIGN KEY (`modifier_group_id`) REFERENCES `fnb_modifier_groups` (`modifier_group_id`) ON DELETE CASCADE ON UPDATE CASCADE,"
            + " CONSTRAINT `fk_fnb_modifier_options_sku_item` FOREIGN KEY (`sku_item_id`) REFERENCES `items` (`item_id`) ON DELETE SET NULL ON UPDATE CASCADE"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    fnb_item_modifier_groups: Object.freeze({
        sql: "CREATE TABLE `fnb_item_modifier_groups` ("
            + " `item_modifier_group_id` INT NOT NULL AUTO_INCREMENT,"
            + " `item_id` INT NOT NULL, `modifier_group_id` INT NOT NULL,"
            + " `is_required_override` TINYINT(1) DEFAULT NULL, `sort_order` INT NOT NULL DEFAULT 0,"
            + " `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL,"
            + " `is_excluded` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Explicit item-level opt-out from folder-inherited modifier groups',"
            + " PRIMARY KEY (`item_modifier_group_id`),"
            + " UNIQUE KEY `uq_fnb_item_modifier_groups_item_group` (`item_id`,`modifier_group_id`),"
            + " KEY `fnb_item_modifier_groups_item_id` (`item_id`),"
            + " KEY `fnb_item_modifier_groups_modifier_group_id` (`modifier_group_id`),"
            + " CONSTRAINT `fk_fnb_item_modifier_groups_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE CASCADE ON UPDATE CASCADE,"
            + " CONSTRAINT `fk_fnb_item_modifier_groups_group` FOREIGN KEY (`modifier_group_id`) REFERENCES `fnb_modifier_groups` (`modifier_group_id`) ON DELETE CASCADE ON UPDATE CASCADE"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    fnb_modifier_group_location_availability: Object.freeze({
        sql: "CREATE TABLE `fnb_modifier_group_location_availability` ("
            + " `modifier_group_location_availability_id` INT NOT NULL AUTO_INCREMENT,"
            + " `modifier_group_id` INT NOT NULL, `location_id` INT NOT NULL,"
            + " `is_available` TINYINT(1) NOT NULL DEFAULT 1,"
            + " `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
            + " `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
            + " PRIMARY KEY (`modifier_group_location_availability_id`),"
            + " UNIQUE KEY `uq_fnb_modifier_group_location` (`modifier_group_id`,`location_id`),"
            + " KEY `idx_fnb_modifier_group_location_location` (`location_id`),"
            + " CONSTRAINT `fk_fnb_modifier_group_location_group` FOREIGN KEY (`modifier_group_id`) REFERENCES `fnb_modifier_groups` (`modifier_group_id`) ON DELETE CASCADE,"
            + " CONSTRAINT `fk_fnb_modifier_group_location_location` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE CASCADE"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    fnb_modifier_option_location_availability: Object.freeze({
        sql: "CREATE TABLE `fnb_modifier_option_location_availability` ("
            + " `modifier_option_location_availability_id` INT NOT NULL AUTO_INCREMENT,"
            + " `modifier_option_id` INT NOT NULL, `location_id` INT NOT NULL,"
            + " `is_available` TINYINT(1) NOT NULL DEFAULT 1,"
            + " `is_sold_out` TINYINT(1) NOT NULL DEFAULT 0,"
            + " `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
            + " `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
            + " PRIMARY KEY (`modifier_option_location_availability_id`),"
            + " UNIQUE KEY `uq_fnb_modifier_option_location` (`modifier_option_id`,`location_id`),"
            + " KEY `idx_fnb_modifier_option_location_location` (`location_id`),"
            + " CONSTRAINT `fk_fnb_modifier_option_location_option` FOREIGN KEY (`modifier_option_id`) REFERENCES `fnb_modifier_options` (`modifier_option_id`) ON DELETE CASCADE,"
            + " CONSTRAINT `fk_fnb_modifier_option_location_location` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE CASCADE"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    fnb_folder_modifier_groups: Object.freeze({
        sql: "CREATE TABLE `fnb_folder_modifier_groups` ("
            + " `folder_modifier_group_id` INT NOT NULL AUTO_INCREMENT,"
            + " `folder_id` INT NOT NULL, `modifier_group_id` INT NOT NULL,"
            + " `is_required_override` TINYINT(1) NULL, `sort_order` INT NOT NULL DEFAULT 0,"
            + " `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
            + " `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
            + " PRIMARY KEY (`folder_modifier_group_id`),"
            + " UNIQUE KEY `uq_fnb_folder_modifier_groups_folder_group` (`folder_id`,`modifier_group_id`),"
            + " KEY `idx_fnb_folder_modifier_groups_folder` (`folder_id`),"
            + " KEY `idx_fnb_folder_modifier_groups_group` (`modifier_group_id`),"
            + " CONSTRAINT `fk_fnb_folder_modifier_groups_folder` FOREIGN KEY (`folder_id`) REFERENCES `item_folders` (`folder_id`) ON DELETE CASCADE,"
            + " CONSTRAINT `fk_fnb_folder_modifier_groups_group` FOREIGN KEY (`modifier_group_id`) REFERENCES `fnb_modifier_groups` (`modifier_group_id`) ON DELETE CASCADE"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    // Created by migration 20260503000002-create-storefront-catalog-overrides.cjs but never
    // added to this registry at the time — that drift sat harmless (no repair-apply ever needed
    // to touch a tenant missing the whole table) until 20260801000001-add-image-lifecycle-metadata
    // added REQUIRED_TENANT_SCHEMA_COLUMNS entries assuming the table already exists everywhere.
    // On a tenant DB missing it entirely, the column-level ALTER TABLE fails with "table doesn't
    // exist", which fails the tenant schema preflight and crash-loops the whole backend for every
    // tenant, not just the ones missing this table. Same shape as the service_item_details /
    // service_booking_lines gap below — see that comment for the general failure mode.
    storefront_catalog_overrides: Object.freeze({
        sql: "CREATE TABLE `storefront_catalog_overrides` (\n"
            + "  `storefront_catalog_override_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `item_id` int NOT NULL,\n"
            + "  `storefront_visible` tinyint(1) NOT NULL DEFAULT '1',\n"
            + "  `storefront_image_path` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,\n"
            + "  `storefront_image_url` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,\n"
            + "  `storefront_image_gallery` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  `image_fingerprint` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'SHA-256 fingerprint of the source catalog image asset',\n"
            + "  `optimization_version` int DEFAULT NULL COMMENT 'Image optimization version (2 for responsive v2)',\n"
            + "  `processing_status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Image optimization status (optimized|legacy|pending|failed)',\n"
            + "  `variant_metadata` json DEFAULT NULL COMMENT 'Semantic image variant paths and metadata',\n"
            + "  PRIMARY KEY (`storefront_catalog_override_id`),\n"
            + "  UNIQUE KEY `item_id` (`item_id`),\n"
            + "  UNIQUE KEY `storefront_catalog_overrides_item_id` (`item_id`),\n"
            + "  CONSTRAINT `storefront_catalog_overrides_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE CASCADE ON UPDATE CASCADE\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    // Created by migration 20260808190000-create-workflow-mode-change-log.cjs
    // (issue #178 phase 5): tenant-scoped, append-only audit trail for
    // ops_workflow_mode / ops_enabled_capabilities changes. Registered here
    // from the start so tenants provisioned before this migration ran get
    // the table via the same repair-apply path as any other backfilled gap.
    workflow_mode_change_log: Object.freeze({
        sql: "CREATE TABLE `workflow_mode_change_log` (\n"
            + "  `workflow_mode_change_log_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `actor_user_id` int DEFAULT NULL,\n"
            + "  `actor_username_snapshot` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL,\n"
            + "  `from_workflow_mode` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,\n"
            + "  `to_workflow_mode` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,\n"
            + "  `from_enabled_capabilities` json DEFAULT NULL,\n"
            + "  `to_enabled_capabilities` json DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`workflow_mode_change_log_id`),\n"
            + "  KEY `workflow_mode_change_log_created_at` (`created_at`)\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    // Created by the original landlord migration 20240101000016-create-audit-logs.js.
    // Audit rows are tenant-local because the POS audit workspace reads activity from the
    // active tenant database. Register the complete shape here so older tenant databases
    // receive the table and the later POS event-context columns through one idempotent path.
    audit_logs: Object.freeze({
        sql: "CREATE TABLE `audit_logs` (\n"
            + "  `log_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `user_id` int DEFAULT NULL,\n"
            + "  `entity_type` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,\n"
            + "  `entity_id` int DEFAULT NULL,\n"
            + "  `action` enum('CREATE','UPDATE','DELETE','VIEW') COLLATE utf8mb4_general_ci NOT NULL,\n"
            + "  `event_type` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,\n"
            + "  `actor_username` varchar(120) COLLATE utf8mb4_general_ci DEFAULT NULL,\n"
            + "  `terminal_id` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,\n"
            + "  `shift_id` bigint DEFAULT NULL,\n"
            + "  `location_id` int DEFAULT NULL,\n"
            + "  `reason` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,\n"
            + "  `request_id` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,\n"
            + "  `changes` json DEFAULT NULL,\n"
            + "  `ip_address` varchar(45) COLLATE utf8mb4_general_ci DEFAULT NULL,\n"
            + "  `user_agent` text COLLATE utf8mb4_general_ci,\n"
            + "  `timestamp` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`log_id`),\n"
            + "  KEY `idx_user_id` (`user_id`),\n"
            + "  KEY `idx_entity_type` (`entity_type`),\n"
            + "  KEY `idx_timestamp` (`timestamp`),\n"
            + "  KEY `idx_audit_event_timestamp` (`event_type`,`timestamp`),\n"
            + "  KEY `idx_audit_terminal_timestamp` (`terminal_id`,`timestamp`),\n"
            + "  KEY `idx_audit_shift_timestamp` (`shift_id`,`timestamp`),\n"
            + "  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    // Created by migration 20260812000001-create-pos-parked-sales.cjs.
    // Parked carts are tenant-local work items and must be backfilled onto
    // tenants provisioned before the migration ran.
    pos_parked_sales: Object.freeze({
        sql: "CREATE TABLE `pos_parked_sales` (\n"
            + "  `pos_parked_sale_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `park_reference` varchar(40) NOT NULL,\n"
            + "  `idempotency_key` varchar(120) NOT NULL,\n"
            + "  `request_hash` varchar(64) NOT NULL,\n"
            + "  `status` enum('parked','claimed','completed','cancelled') NOT NULL DEFAULT 'parked',\n"
            + "  `revision` int unsigned NOT NULL DEFAULT 1,\n"
            + "  `cashier_id` int NOT NULL,\n"
            + "  `shift_id` int NOT NULL,\n"
            + "  `origin_cashier_id` int DEFAULT NULL,\n"
            + "  `origin_shift_id` int DEFAULT NULL,\n"
            + "  `terminal_id` varchar(100) NOT NULL,\n"
            + "  `location_id` int NOT NULL,\n"
            + "  `snapshot` json NOT NULL,\n"
            + "  `line_count` int NOT NULL DEFAULT 0,\n"
            + "  `quantity_total` decimal(24,12) NOT NULL DEFAULT 0,\n"
            + "  `subtotal_amount` decimal(14,4) NOT NULL DEFAULT 0,\n"
            + "  `total_amount` decimal(14,4) NOT NULL DEFAULT 0,\n"
            + "  `claimed_by` int DEFAULT NULL,\n"
            + "  `claimed_terminal_id` varchar(100) DEFAULT NULL,\n"
            + "  `claimed_at` datetime DEFAULT NULL,\n"
            + "  `completed_transaction_id` int DEFAULT NULL,\n"
            + "  `completed_at` datetime DEFAULT NULL,\n"
            + "  `cancelled_by` int DEFAULT NULL,\n"
            + "  `cancelled_at` datetime DEFAULT NULL,\n"
            + "  `cancel_reason` varchar(255) DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`pos_parked_sale_id`),\n"
            + "  UNIQUE KEY `park_reference` (`park_reference`),\n"
            + "  UNIQUE KEY `idempotency_key` (`idempotency_key`),\n"
            + "  KEY `idx_pos_parked_sales_status` (`status`),\n"
            + "  KEY `idx_pos_parked_sales_shift_status` (`shift_id`,`status`),\n"
            + "  KEY `idx_pos_parked_sales_cashier_status` (`cashier_id`,`status`),\n"
            + "  KEY `idx_pos_parked_sales_location_status` (`location_id`,`status`),\n"
            + "  KEY `idx_pos_parked_sales_claimed_by_status` (`claimed_by`,`status`),\n"
            + "  KEY `idx_pos_parked_sales_origin_cashier_status` (`origin_cashier_id`,`status`),\n"
            + "  KEY `idx_pos_parked_sales_origin_shift_status` (`origin_shift_id`,`status`),\n"
            + "  KEY `idx_pos_parked_sales_created_at` (`created_at`),\n"
            + "  CONSTRAINT `pos_parked_sales_ibfk_1` FOREIGN KEY (`cashier_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_parked_sales_ibfk_2` FOREIGN KEY (`shift_id`) REFERENCES `pos_terminal_shifts` (`pos_terminal_shift_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_parked_sales_ibfk_3` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_parked_sales_ibfk_4` FOREIGN KEY (`origin_cashier_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_parked_sales_ibfk_5` FOREIGN KEY (`origin_shift_id`) REFERENCES `pos_terminal_shifts` (`pos_terminal_shift_id`) ON DELETE SET NULL ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_parked_sales_ibfk_6` FOREIGN KEY (`claimed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_parked_sales_ibfk_7` FOREIGN KEY (`completed_transaction_id`) REFERENCES `pos_transactions` (`pos_transaction_id`) ON DELETE SET NULL ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_parked_sales_ibfk_8` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE RESTRICT\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    // Created by migration 20260812000006-create-pos-split-payment-sessions.cjs.
    // Split-payment sessions and allocations are tenant-local financial
    // evidence and must be backfilled onto tenants provisioned before Phase 58.
    pos_payment_sessions: Object.freeze({
        sql: "CREATE TABLE `pos_payment_sessions` (\n"
            + "  `pos_payment_session_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `session_reference` varchar(40) NOT NULL,\n"
            + "  `idempotency_key` varchar(120) NOT NULL,\n"
            + "  `request_hash` varchar(64) NOT NULL,\n"
            + "  `status` enum('open','partially_paid','ready_to_complete','completed','cancelled') NOT NULL DEFAULT 'open',\n"
            + "  `cashier_id` int NOT NULL,\n"
            + "  `shift_id` int NOT NULL,\n"
            + "  `terminal_id` varchar(100) NOT NULL,\n"
            + "  `location_id` int NOT NULL,\n"
            + "  `parked_sale_id` int DEFAULT NULL,\n"
            + "  `snapshot` json NOT NULL,\n"
            + "  `line_count` int NOT NULL DEFAULT 0,\n"
            + "  `quantity_total` decimal(24,12) NOT NULL DEFAULT 0,\n"
            + "  `subtotal_amount` decimal(14,4) NOT NULL DEFAULT 0,\n"
            + "  `total_amount` decimal(14,4) NOT NULL DEFAULT 0,\n"
            + "  `paid_amount` decimal(14,4) NOT NULL DEFAULT 0,\n"
            + "  `remaining_amount` decimal(14,4) NOT NULL DEFAULT 0,\n"
            + "  `completed_transaction_id` int DEFAULT NULL,\n"
            + "  `completed_at` datetime DEFAULT NULL,\n"
            + "  `cancelled_by` int DEFAULT NULL,\n"
            + "  `cancelled_at` datetime DEFAULT NULL,\n"
            + "  `cancel_reason` varchar(255) DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL,\n"
            + "  `updated_at` datetime NOT NULL,\n"
            + "  PRIMARY KEY (`pos_payment_session_id`),\n"
            + "  UNIQUE KEY `session_reference` (`session_reference`),\n"
            + "  UNIQUE KEY `idempotency_key` (`idempotency_key`),\n"
            + "  KEY `idx_pos_payment_sessions_status` (`status`),\n"
            + "  KEY `idx_pos_payment_sessions_shift_status` (`shift_id`,`status`),\n"
            + "  KEY `idx_pos_payment_sessions_cashier_status` (`cashier_id`,`status`),\n"
            + "  KEY `idx_pos_payment_sessions_location_status` (`location_id`,`status`),\n"
            + "  KEY `idx_pos_payment_sessions_parked_sale` (`parked_sale_id`),\n"
            + "  KEY `idx_pos_payment_sessions_completed_transaction` (`completed_transaction_id`),\n"
            + "  KEY `idx_pos_payment_sessions_created_at` (`created_at`),\n"
            + "  CONSTRAINT `pos_payment_sessions_ibfk_1` FOREIGN KEY (`cashier_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_payment_sessions_ibfk_2` FOREIGN KEY (`shift_id`) REFERENCES `pos_terminal_shifts` (`pos_terminal_shift_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_payment_sessions_ibfk_3` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_payment_sessions_ibfk_4` FOREIGN KEY (`parked_sale_id`) REFERENCES `pos_parked_sales` (`pos_parked_sale_id`) ON DELETE SET NULL ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_payment_sessions_ibfk_5` FOREIGN KEY (`completed_transaction_id`) REFERENCES `pos_transactions` (`pos_transaction_id`) ON DELETE SET NULL ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_payment_sessions_ibfk_6` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE RESTRICT\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    pos_payment_allocations: Object.freeze({
        sql: "CREATE TABLE `pos_payment_allocations` (\n"
            + "  `pos_payment_allocation_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `allocation_reference` varchar(40) NOT NULL,\n"
            + "  `session_id` int NOT NULL,\n"
            + "  `idempotency_key` varchar(120) NOT NULL,\n"
            + "  `request_hash` varchar(64) NOT NULL,\n"
            + "  `status` enum('pending','successful','failed','cancelled','reversed') NOT NULL DEFAULT 'pending',\n"
            + "  `payment_method` enum('cash','gcash','maya','card','bank_transfer') NOT NULL,\n"
            + "  `payment_handoff_mode` enum('external','internal') DEFAULT NULL,\n"
            + "  `applied_amount` decimal(14,4) NOT NULL,\n"
            + "  `cash_tendered` decimal(14,4) DEFAULT NULL,\n"
            + "  `change_amount` decimal(14,4) DEFAULT NULL,\n"
            + "  `payment_reference` varchar(120) DEFAULT NULL,\n"
            + "  `payment_provider` varchar(40) DEFAULT NULL,\n"
            + "  `provider_event_id` varchar(120) DEFAULT NULL,\n"
            + "  `provider_refund_ids` json DEFAULT NULL,\n"
            + "  `provider_refund_event_id` varchar(255) DEFAULT NULL,\n"
            + "  `provider_refund_status` varchar(40) DEFAULT NULL,\n"
            + "  `provider_refunded_at` datetime DEFAULT NULL,\n"
            + "  `reversed_amount` decimal(14,4) NOT NULL DEFAULT '0.0000',\n"
            + "  `reversal_status` enum('none','pending','partial','completed','manual_review_required') NOT NULL DEFAULT 'none',\n"
            + "  `failure_code` varchar(80) DEFAULT NULL,\n"
            + "  `failure_reason` varchar(255) DEFAULT NULL,\n"
            + "  `cashier_id` int NOT NULL,\n"
            + "  `shift_id` int NOT NULL,\n"
            + "  `terminal_id` varchar(100) NOT NULL,\n"
            + "  `location_id` int NOT NULL,\n"
            + "  `confirmed_at` datetime DEFAULT NULL,\n"
            + "  `cancelled_by` int DEFAULT NULL,\n"
            + "  `cancelled_at` datetime DEFAULT NULL,\n"
            + "  `cancel_reason` varchar(255) DEFAULT NULL,\n"
            + "  `reversed_by` int DEFAULT NULL,\n"
            + "  `reversed_at` datetime DEFAULT NULL,\n"
            + "  `reversal_reason` varchar(255) DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL,\n"
            + "  `updated_at` datetime NOT NULL,\n"
            + "  PRIMARY KEY (`pos_payment_allocation_id`),\n"
            + "  UNIQUE KEY `allocation_reference` (`allocation_reference`),\n"
            + "  UNIQUE KEY `uq_pos_payment_allocations_session_idempotency` (`session_id`,`idempotency_key`),\n"
            + "  UNIQUE KEY `uq_pos_payment_allocations_provider_event_id` (`provider_event_id`),\n"
            + "  UNIQUE KEY `uq_pos_payment_allocations_provider_refund_event_id` (`provider_refund_event_id`),\n"
            + "  KEY `idx_pos_payment_allocations_session_status` (`session_id`,`status`),\n"
            + "  KEY `idx_pos_payment_allocations_session_created` (`session_id`,`created_at`),\n"
            + "  KEY `idx_pos_payment_allocations_shift_status` (`shift_id`,`status`),\n"
            + "  KEY `idx_pos_payment_allocations_location_status` (`location_id`,`status`),\n"
            + "  KEY `idx_pos_payment_allocations_method_status` (`payment_method`,`status`),\n"
            + "  KEY `idx_pos_payment_allocations_session_reversal_status` (`session_id`,`reversal_status`),\n"
            + "  KEY `idx_pos_payment_allocations_created_at` (`created_at`),\n"
            + "  CONSTRAINT `pos_payment_allocations_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `pos_payment_sessions` (`pos_payment_session_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_payment_allocations_ibfk_2` FOREIGN KEY (`cashier_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_payment_allocations_ibfk_3` FOREIGN KEY (`shift_id`) REFERENCES `pos_terminal_shifts` (`pos_terminal_shift_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_payment_allocations_ibfk_4` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_payment_allocations_ibfk_5` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `pos_payment_allocations_ibfk_6` FOREIGN KEY (`reversed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE RESTRICT\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    // Created by migration 20260813000001-create-pos-merchant-tender-reconciliations.cjs.
    // Manager review evidence is tenant-local, append-only, and never changes
    // the underlying transaction or payment-allocation ledgers.
    pos_merchant_tender_reconciliations: Object.freeze({
        sql: "CREATE TABLE `pos_merchant_tender_reconciliations` (\n"
            + "  `pos_merchant_tender_reconciliation_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `reconciliation_reference` varchar(40) NOT NULL,\n"
            + "  `shift_id` int NOT NULL,\n"
            + "  `location_id` int DEFAULT NULL,\n"
            + "  `terminal_id` varchar(100) NOT NULL,\n"
            + "  `idempotency_key` varchar(120) NOT NULL,\n"
            + "  `request_hash` varchar(64) NOT NULL,\n"
            + "  `status` enum('balanced','variance_reviewed') NOT NULL,\n"
            + "  `expected_breakdown` json NOT NULL,\n"
            + "  `observed_breakdown` json NOT NULL,\n"
            + "  `variance_breakdown` json NOT NULL,\n"
            + "  `expected_total` decimal(14,4) NOT NULL,\n"
            + "  `observed_total` decimal(14,4) NOT NULL,\n"
            + "  `variance_total` decimal(14,4) NOT NULL,\n"
            + "  `review_note` varchar(500) DEFAULT NULL,\n"
            + "  `reviewed_by` int NOT NULL,\n"
            + "  `reviewed_at` datetime NOT NULL,\n"
            + "  `supersedes_reconciliation_id` int DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`pos_merchant_tender_reconciliation_id`),\n"
            + "  UNIQUE KEY `reconciliation_reference` (`reconciliation_reference`),\n"
            + "  UNIQUE KEY `uq_pos_merchant_tender_reconciliations_shift_idempotency` (`shift_id`,`idempotency_key`),\n"
            + "  KEY `idx_pos_merchant_tender_reconciliations_shift_reviewed` (`shift_id`,`reviewed_at`),\n"
            + "  KEY `idx_pos_merchant_tender_reconciliations_location_reviewed` (`location_id`,`reviewed_at`),\n"
            + "  KEY `idx_pos_merchant_tender_reconciliations_status_reviewed` (`status`,`reviewed_at`),\n"
            + "  CONSTRAINT `fk_pos_merchant_tender_reconciliations_shift` FOREIGN KEY (`shift_id`) REFERENCES `pos_terminal_shifts` (`pos_terminal_shift_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `fk_pos_merchant_tender_reconciliations_location` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE SET NULL ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `fk_pos_merchant_tender_reconciliations_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `fk_pos_merchant_tender_reconciliations_superseded` FOREIGN KEY (`supersedes_reconciliation_id`) REFERENCES `pos_merchant_tender_reconciliations` (`pos_merchant_tender_reconciliation_id`) ON DELETE SET NULL ON UPDATE RESTRICT\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    employees: Object.freeze({
        sql: "CREATE TABLE `employees` (\n"
            + "  `employee_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `employee_code` varchar(40) NOT NULL,\n"
            + "  `full_name` varchar(255) NOT NULL,\n"
            + "  `email` varchar(255) DEFAULT NULL,\n"
            + "  `phone` varchar(40) DEFAULT NULL,\n"
            + "  `location_id` int DEFAULT NULL,\n"
            + "  `is_active` tinyint(1) NOT NULL DEFAULT '1',\n"
            + "  `created_by` int DEFAULT NULL,\n"
            + "  `updated_by` int DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL,\n"
            + "  `updated_at` datetime NOT NULL,\n"
            + "  PRIMARY KEY (`employee_id`),\n"
            + "  UNIQUE KEY `uq_employees_code` (`employee_code`),\n"
            + "  KEY `idx_employees_name` (`full_name`),\n"
            + "  KEY `idx_employees_location_active` (`location_id`,`is_active`),\n"
            + "  CONSTRAINT `fk_employees_location` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE SET NULL ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `fk_employees_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `fk_employees_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE RESTRICT\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    }),
    employee_credit_accounts: Object.freeze({
        sql: "CREATE TABLE `employee_credit_accounts` (\n"
            + "  `account_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `user_id` int DEFAULT NULL,\n"
            + "  `employee_id` int DEFAULT NULL,\n"
            + "  `account_code` varchar(40) NOT NULL,\n"
            + "  `is_eligible` tinyint(1) NOT NULL DEFAULT '0',\n"
            + "  `balance` decimal(14,4) NOT NULL DEFAULT '0.0000',\n"
            + "  `outstanding_balance` decimal(14,4) NOT NULL DEFAULT '0.0000',\n"
            + "  `credit_limit` decimal(14,4) DEFAULT NULL,\n"
            + "  `authorization_pin_hash` varchar(255) DEFAULT NULL,\n"
            + "  `version` int NOT NULL DEFAULT '0',\n"
            + "  `created_at` datetime NOT NULL,\n"
            + "  `updated_at` datetime NOT NULL,\n"
            + "  PRIMARY KEY (`account_id`),\n"
            + "  UNIQUE KEY `uq_employee_credit_accounts_user` (`user_id`),\n"
            + "  UNIQUE KEY `uq_employee_credit_accounts_employee` (`employee_id`),\n"
            + "  UNIQUE KEY `uq_employee_credit_accounts_code` (`account_code`),\n"
            + "  CONSTRAINT `fk_employee_credit_accounts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `fk_employee_credit_accounts_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    }),
    employee_credit_ledger_entries: Object.freeze({
        sql: "CREATE TABLE `employee_credit_ledger_entries` (\n"
            + "  `ledger_entry_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `account_id` int NOT NULL,\n"
            + "  `pos_transaction_id` int DEFAULT NULL,\n"
            + "  `entry_type` enum('grant','debit','charge','repayment','reversal','adjustment','expiration') NOT NULL,\n"
            + "  `amount` decimal(14,4) NOT NULL,\n"
            + "  `balance_before` decimal(14,4) NOT NULL,\n"
            + "  `balance_after` decimal(14,4) NOT NULL,\n"
            + "  `actor_user_id` int DEFAULT NULL,\n"
            + "  `shift_id` int DEFAULT NULL,\n"
            + "  `terminal_id` varchar(100) DEFAULT NULL,\n"
            + "  `location_id` int DEFAULT NULL,\n"
            + "  `authorization_reference` varchar(80) DEFAULT NULL,\n"
            + "  `idempotency_key` varchar(160) NOT NULL,\n"
            + "  `reason` varchar(500) DEFAULT NULL,\n"
            + "  `metadata` json DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL,\n"
            + "  PRIMARY KEY (`ledger_entry_id`),\n"
            + "  UNIQUE KEY `uq_employee_credit_ledger_idempotency` (`idempotency_key`),\n"
            + "  KEY `idx_employee_credit_ledger_account_created` (`account_id`,`created_at`),\n"
            + "  KEY `idx_employee_credit_ledger_transaction` (`pos_transaction_id`),\n"
            + "  CONSTRAINT `fk_employee_credit_ledger_account` FOREIGN KEY (`account_id`) REFERENCES `employee_credit_accounts` (`account_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `fk_employee_credit_ledger_transaction` FOREIGN KEY (`pos_transaction_id`) REFERENCES `pos_transactions` (`pos_transaction_id`) ON DELETE RESTRICT ON UPDATE RESTRICT\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    }),
    pos_discount_rules: Object.freeze({
        sql: "CREATE TABLE `pos_discount_rules` (\n"
            + "  `id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `name` varchar(100) NOT NULL,\n"
            + "  `type` enum('senior','pwd','employee','promo','manual') NOT NULL,\n"
            + "  `method` enum('percentage','fixed') NOT NULL DEFAULT 'percentage',\n"
            + "  `rate` decimal(7,4) DEFAULT NULL,\n"
            + "  `fixed_amount` decimal(14,4) DEFAULT NULL,\n"
            + "  `is_vat_exempt` tinyint(1) NOT NULL DEFAULT '0',\n"
            + "  `requires_customer_id` tinyint(1) NOT NULL DEFAULT '0',\n"
            + "  `requires_employee_id` tinyint(1) NOT NULL DEFAULT '0',\n"
            + "  `requires_manager_approval` tinyint(1) NOT NULL DEFAULT '0',\n"
            + "  `max_discount_amount` decimal(14,4) DEFAULT NULL,\n"
            + "  `is_active` tinyint(1) NOT NULL DEFAULT '1',\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`id`),\n"
            + "  KEY `idx_pos_discount_rules_type_active` (`type`,`is_active`)\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    pos_transaction_discounts: Object.freeze({
        sql: "CREATE TABLE `pos_transaction_discounts` (\n"
            + "  `id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `transaction_id` int NOT NULL,\n"
            + "  `discount_rule_id` int DEFAULT NULL,\n"
            + "  `discount_type` varchar(40) NOT NULL,\n"
            + "  `discount_method` varchar(20) NOT NULL,\n"
            + "  `discount_rate` decimal(7,4) DEFAULT NULL,\n"
            + "  `discount_amount` decimal(14,4) NOT NULL DEFAULT '0.0000',\n"
            + "  `vat_removed` decimal(14,4) NOT NULL DEFAULT '0.0000',\n"
            + "  `vat_exempt_amount` decimal(14,4) NOT NULL DEFAULT '0.0000',\n"
            + "  `customer_name` varchar(255) DEFAULT NULL,\n"
            + "  `senior_pwd_id_number` varchar(100) DEFAULT NULL,\n"
            + "  `employee_name` varchar(255) DEFAULT NULL,\n"
            + "  `employee_id` varchar(100) DEFAULT NULL,\n"
            + "  `manager_approval_id` int DEFAULT NULL,\n"
            + "  `manager_approved_at` datetime DEFAULT NULL,\n"
            + "  `self_approved` tinyint(1) NOT NULL DEFAULT '0',\n"
            + "  `reason` varchar(500) DEFAULT NULL,\n"
            + "  `calculation_version` varchar(30) NOT NULL DEFAULT 'pos-discount.v1',\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`id`),\n"
            + "  UNIQUE KEY `uq_pos_transaction_discount_transaction` (`transaction_id`),\n"
            + "  KEY `discount_rule_id` (`discount_rule_id`),\n"
            + "  KEY `manager_approval_id` (`manager_approval_id`),\n"
            + "  CONSTRAINT `pos_transaction_discounts_ibfk_1` FOREIGN KEY (`transaction_id`) REFERENCES `pos_transactions` (`pos_transaction_id`) ON DELETE CASCADE,\n"
            + "  CONSTRAINT `pos_transaction_discounts_ibfk_2` FOREIGN KEY (`discount_rule_id`) REFERENCES `pos_discount_rules` (`id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `pos_transaction_discounts_ibfk_3` FOREIGN KEY (`manager_approval_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    delivery_personnel: Object.freeze({
        sql: "CREATE TABLE `delivery_personnel` (\n"
            + "  `delivery_personnel_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `display_name` varchar(255) NOT NULL,\n"
            + "  `phone` varchar(40) DEFAULT NULL,\n"
            + "  `location_id` int DEFAULT NULL,\n"
            + "  `is_active` tinyint(1) NOT NULL DEFAULT '1',\n"
            + "  `notes` text,\n"
            + "  `created_by` int DEFAULT NULL,\n"
            + "  `updated_by` int DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`delivery_personnel_id`),\n"
            + "  KEY `idx_delivery_personnel_name` (`display_name`),\n"
            + "  KEY `idx_delivery_personnel_location_active` (`location_id`,`is_active`),\n"
            + "  CONSTRAINT `delivery_personnel_ibfk_1` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE SET NULL ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `delivery_personnel_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE RESTRICT,\n"
            + "  CONSTRAINT `delivery_personnel_ibfk_3` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE RESTRICT\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    delivery_jobs: Object.freeze({
        sql: "CREATE TABLE `delivery_jobs` (\n"
            + "  `delivery_job_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `pos_transaction_id` int NOT NULL,\n"
            + "  `location_id` int DEFAULT NULL,\n"
            + "  `delivery_personnel_name` varchar(255) DEFAULT NULL,\n"
            + "  `provider` varchar(40) NOT NULL DEFAULT 'manual',\n"
            + "  `provider_delivery_id` varchar(120) DEFAULT NULL,\n"
            + "  `status` enum('pending_dispatch','assigned','picked_up','delivered','failed','cancelled') NOT NULL DEFAULT 'pending_dispatch',\n"
            + "  `tracking_url` varchar(1000) DEFAULT NULL,\n"
            + "  `pickup_ready_at` datetime DEFAULT NULL,\n"
            + "  `picked_up_at` datetime DEFAULT NULL,\n"
            + "  `delivered_at` datetime DEFAULT NULL,\n"
            + "  `failure_reason` varchar(500) DEFAULT NULL,\n"
            + "  `provider_payload` json DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`delivery_job_id`),\n"
            + "  UNIQUE KEY `pos_transaction_id` (`pos_transaction_id`),\n"
            + "  UNIQUE KEY `provider_delivery_id` (`provider_delivery_id`),\n"
            + "  KEY `idx_delivery_jobs_location_status` (`location_id`,`status`),\n"
            + "  KEY `idx_delivery_jobs_provider_reference` (`provider`,`provider_delivery_id`),\n"
            + "  CONSTRAINT `delivery_jobs_ibfk_1` FOREIGN KEY (`pos_transaction_id`) REFERENCES `pos_transactions` (`pos_transaction_id`) ON DELETE CASCADE,\n"
            + "  CONSTRAINT `delivery_jobs_ibfk_2` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE SET NULL\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    pos_transaction_discount_lines: Object.freeze({
        sql: "CREATE TABLE `pos_transaction_discount_lines` (\n"
            + "  `id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `transaction_discount_id` int NOT NULL,\n"
            + "  `transaction_line_id` int NOT NULL,\n"
            + "  `item_id` int NOT NULL,\n"
            + "  `eligible_quantity` decimal(24,12) NOT NULL DEFAULT '0.000000000000',\n"
            + "  `gross_eligible_amount` decimal(14,4) NOT NULL DEFAULT '0.0000',\n"
            + "  `vat_removed` decimal(14,4) NOT NULL DEFAULT '0.0000',\n"
            + "  `vat_exempt_amount` decimal(14,4) NOT NULL DEFAULT '0.0000',\n"
            + "  `discount_amount` decimal(14,4) NOT NULL DEFAULT '0.0000',\n"
            + "  `final_line_amount` decimal(14,4) NOT NULL DEFAULT '0.0000',\n"
            + "  `eligibility_override_reason` varchar(500) DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`id`),\n"
            + "  KEY `transaction_line_id` (`transaction_line_id`),\n"
            + "  KEY `idx_pos_discount_lines_discount` (`transaction_discount_id`),\n"
            + "  CONSTRAINT `pos_transaction_discount_lines_ibfk_1` FOREIGN KEY (`transaction_discount_id`) REFERENCES `pos_transaction_discounts` (`id`) ON DELETE CASCADE,\n"
            + "  CONSTRAINT `pos_transaction_discount_lines_ibfk_2` FOREIGN KEY (`transaction_line_id`) REFERENCES `pos_transaction_lines` (`line_id`) ON DELETE CASCADE\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    // The five tables below were created by migration
    // 20260502000001-add-services-mode-booking-tables.cjs but were never added to this
    // registry at the time — that drift sat harmless until service_booking_lines (below)
    // became the first services table with a FOREIGN KEY pointing at service_bookings.
    // On a tenant DB missing these, repair-apply's CREATE TABLE service_booking_lines fails
    // with MySQL errno 1824 ("Failed to open the referenced table"), leaving the table
    // missing, which fails the tenant schema preflight and crash-loops the whole backend
    // (not just that one tenant). Order matters: inspectRequiredTenantSchemaTables /
    // buildTenantSchemaTableRepairSql preserve declaration order because later tables have
    // FKs pointing at earlier ones.
    service_item_details: Object.freeze({
        sql: "CREATE TABLE `service_item_details` (\n"
            + "  `service_detail_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `item_id` int NOT NULL,\n"
            + "  `service_category` varchar(120) DEFAULT NULL,\n"
            + "  `duration_minutes` int NOT NULL DEFAULT '60',\n"
            + "  `buffer_before_minutes` int NOT NULL DEFAULT '0',\n"
            + "  `buffer_after_minutes` int NOT NULL DEFAULT '0',\n"
            + "  `lead_time_minutes` int NOT NULL DEFAULT '0',\n"
            + "  `cancellation_window_hours` int NOT NULL DEFAULT '24',\n"
            + "  `bookable` tinyint(1) NOT NULL DEFAULT '1',\n"
            + "  `visible_in_storefront` tinyint(1) NOT NULL DEFAULT '1',\n"
            + "  `visible_in_pos` tinyint(1) NOT NULL DEFAULT '1',\n"
            + "  `addons_enabled` tinyint(1) NOT NULL DEFAULT '0',\n"
            + "  `payment_policy` enum('customer_choice','prepaid_required','postpaid_only','deposit_allowed') NOT NULL DEFAULT 'customer_choice',\n"
            + "  `service_area_type` enum('in_store','customer_location','online','hybrid','item_handoff') NOT NULL DEFAULT 'in_store',\n"
            + "  `intake_form_schema` json DEFAULT NULL,\n"
            + "  `client_notes_template` text,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`service_detail_id`),\n"
            + "  UNIQUE KEY `uq_service_item_details_item_id` (`item_id`),\n"
            + "  KEY `idx_service_item_details_category` (`service_category`),\n"
            + "  KEY `idx_service_item_details_bookable` (`bookable`),\n"
            + "  KEY `idx_service_item_details_storefront_visible` (`visible_in_storefront`),\n"
            + "  KEY `idx_service_item_details_pos_visible` (`visible_in_pos`),\n"
            + "  CONSTRAINT `service_item_details_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE CASCADE\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    service_resources: Object.freeze({
        sql: "CREATE TABLE `service_resources` (\n"
            + "  `resource_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `name` varchar(255) NOT NULL,\n"
            + "  `resource_type` enum('provider','room','equipment','vehicle','station') NOT NULL DEFAULT 'provider',\n"
            + "  `location_id` int DEFAULT NULL,\n"
            + "  `capacity` int NOT NULL DEFAULT '1',\n"
            + "  `is_active` tinyint(1) NOT NULL DEFAULT '1',\n"
            + "  `weekly_availability` json DEFAULT NULL,\n"
            + "  `blackout_dates` json DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`resource_id`),\n"
            + "  KEY `idx_service_resources_type` (`resource_type`),\n"
            + "  KEY `idx_service_resources_location` (`location_id`),\n"
            + "  KEY `idx_service_resources_active` (`is_active`),\n"
            + "  CONSTRAINT `service_resources_ibfk_1` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE SET NULL\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    service_provider_assignments: Object.freeze({
        sql: "CREATE TABLE `service_provider_assignments` (\n"
            + "  `assignment_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `item_id` int NOT NULL,\n"
            + "  `user_id` int DEFAULT NULL,\n"
            + "  `resource_id` int DEFAULT NULL,\n"
            + "  `location_id` int DEFAULT NULL,\n"
            + "  `is_active` tinyint(1) NOT NULL DEFAULT '1',\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`assignment_id`),\n"
            + "  KEY `idx_service_assignments_item` (`item_id`),\n"
            + "  KEY `idx_service_assignments_user` (`user_id`),\n"
            + "  KEY `idx_service_assignments_resource` (`resource_id`),\n"
            + "  KEY `idx_service_assignments_location` (`location_id`),\n"
            + "  CONSTRAINT `service_provider_assignments_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE CASCADE,\n"
            + "  CONSTRAINT `service_provider_assignments_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `service_provider_assignments_ibfk_3` FOREIGN KEY (`resource_id`) REFERENCES `service_resources` (`resource_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `service_provider_assignments_ibfk_4` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE SET NULL\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    service_bookings: Object.freeze({
        sql: "CREATE TABLE `service_bookings` (\n"
            + "  `booking_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `public_reference` varchar(40) NOT NULL,\n"
            + "  `service_item_id` int NOT NULL,\n"
            + "  `service_detail_id` int DEFAULT NULL,\n"
            + "  `store_customer_id` int DEFAULT NULL,\n"
            + "  `customer_name` varchar(255) NOT NULL,\n"
            + "  `customer_email` varchar(255) DEFAULT NULL,\n"
            + "  `customer_phone` varchar(50) DEFAULT NULL,\n"
            + "  `quantity` int NOT NULL DEFAULT '1',\n"
            + "  `provider_user_id` int DEFAULT NULL,\n"
            + "  `resource_id` int DEFAULT NULL,\n"
            + "  `location_id` int DEFAULT NULL,\n"
            + "  `start_at` datetime NOT NULL,\n"
            + "  `end_at` datetime NOT NULL,\n"
            + "  `status` enum('requested','confirmed','checked_in','in_service','completed','cancelled','no_show','for_pickup','pickup_completed','out_for_return','ready_for_collection') NOT NULL DEFAULT 'requested',\n"
            + "  `payment_timing` enum('prepaid','postpaid','deposit') NOT NULL DEFAULT 'postpaid',\n"
            + "  `payment_status` enum('unpaid','payment_pending','paid','deposit_paid','failed','refunded') NOT NULL DEFAULT 'unpaid',\n"
            + "  `payment_reference` varchar(120) DEFAULT NULL,\n"
            + "  `payment_checkout_url` varchar(1000) DEFAULT NULL,\n"
            + "  `pos_transaction_id` int DEFAULT NULL,\n"
            + "  `source` enum('storefront','pos','admin') NOT NULL DEFAULT 'storefront',\n"
            + "  `idempotency_key` varchar(120) DEFAULT NULL,\n"
            + "  `request_hash` varchar(64) DEFAULT NULL,\n"
            + "  `claim_token_hash` varchar(128) DEFAULT NULL,\n"
            + "  `claim_token_expires_at` datetime DEFAULT NULL,\n"
            + "  `notes` text,\n"
            + "  `intake_responses` json DEFAULT NULL,\n"
            + "  `cancellation_reason` varchar(500) DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`booking_id`),\n"
            + "  UNIQUE KEY `uq_service_bookings_public_reference` (`public_reference`),\n"
            + "  KEY `idx_service_bookings_item` (`service_item_id`),\n"
            + "  KEY `idx_service_bookings_detail` (`service_detail_id`),\n"
            + "  KEY `idx_service_bookings_customer` (`store_customer_id`),\n"
            + "  KEY `idx_service_bookings_provider` (`provider_user_id`),\n"
            + "  KEY `idx_service_bookings_resource` (`resource_id`),\n"
            + "  KEY `idx_service_bookings_location` (`location_id`),\n"
            + "  KEY `idx_service_bookings_status` (`status`),\n"
            + "  KEY `idx_service_bookings_start_at` (`start_at`),\n"
            + "  KEY `idx_service_bookings_payment_status` (`payment_status`),\n"
            + "  KEY `idx_service_bookings_idempotency` (`idempotency_key`),\n"
            + "  KEY `idx_service_bookings_pos_transaction` (`pos_transaction_id`),\n"
            + "  CONSTRAINT `service_bookings_ibfk_1` FOREIGN KEY (`service_item_id`) REFERENCES `items` (`item_id`),\n"
            + "  CONSTRAINT `service_bookings_ibfk_2` FOREIGN KEY (`service_detail_id`) REFERENCES `service_item_details` (`service_detail_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `service_bookings_ibfk_3` FOREIGN KEY (`store_customer_id`) REFERENCES `store_customers` (`customer_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `service_bookings_ibfk_4` FOREIGN KEY (`provider_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `service_bookings_ibfk_5` FOREIGN KEY (`resource_id`) REFERENCES `service_resources` (`resource_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `service_bookings_ibfk_6` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `service_bookings_ibfk_7` FOREIGN KEY (`pos_transaction_id`) REFERENCES `pos_transactions` (`pos_transaction_id`) ON DELETE SET NULL\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    service_waitlist_entries: Object.freeze({
        sql: "CREATE TABLE `service_waitlist_entries` (\n"
            + "  `waitlist_entry_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `service_item_id` int NOT NULL,\n"
            + "  `store_customer_id` int DEFAULT NULL,\n"
            + "  `customer_name` varchar(255) NOT NULL,\n"
            + "  `customer_email` varchar(255) DEFAULT NULL,\n"
            + "  `customer_phone` varchar(50) DEFAULT NULL,\n"
            + "  `preferred_start_at` datetime DEFAULT NULL,\n"
            + "  `preferred_end_at` datetime DEFAULT NULL,\n"
            + "  `status` enum('waiting','notified','booked','expired','cancelled') NOT NULL DEFAULT 'waiting',\n"
            + "  `notes` text,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`waitlist_entry_id`),\n"
            + "  KEY `idx_service_waitlist_item` (`service_item_id`),\n"
            + "  KEY `idx_service_waitlist_customer` (`store_customer_id`),\n"
            + "  KEY `idx_service_waitlist_status` (`status`),\n"
            + "  CONSTRAINT `service_waitlist_entries_ibfk_1` FOREIGN KEY (`service_item_id`) REFERENCES `items` (`item_id`),\n"
            + "  CONSTRAINT `service_waitlist_entries_ibfk_2` FOREIGN KEY (`store_customer_id`) REFERENCES `store_customers` (`customer_id`) ON DELETE SET NULL\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    service_booking_lines: Object.freeze({
        sql: "CREATE TABLE `service_booking_lines` (\n"
            + "  `booking_line_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `booking_id` int NOT NULL,\n"
            + "  `line_type` enum('service','part') NOT NULL DEFAULT 'service',\n"
            + "  `item_id` int NOT NULL,\n"
            + "  `name_snapshot` varchar(255) NOT NULL,\n"
            + "  `quantity` decimal(24,12) NOT NULL DEFAULT '1.000000000000',\n"
            + "  `unit_price` decimal(14,4) NOT NULL DEFAULT '0.0000',\n"
            + "  `line_amount` decimal(14,4) NOT NULL DEFAULT '0.0000',\n"
            + "  `vat_type_snapshot` enum('vatable','vat_exempt','zero_rated') NOT NULL DEFAULT 'vatable',\n"
            + "  `stock_effect_type` enum('inventory_issue','stock_exempt') NOT NULL DEFAULT 'stock_exempt',\n"
            + "  `stock_exempt_reason` varchar(80) DEFAULT NULL,\n"
            + "  `stock_movement_id` int DEFAULT NULL,\n"
            + "  `pos_transaction_line_id` int DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`booking_line_id`),\n"
            + "  KEY `idx_service_booking_lines_booking` (`booking_id`),\n"
            + "  KEY `idx_service_booking_lines_item` (`item_id`),\n"
            + "  KEY `idx_service_booking_lines_type` (`line_type`),\n"
            + "  KEY `idx_service_booking_lines_pos_line` (`pos_transaction_line_id`),\n"
            + "  CONSTRAINT `service_booking_lines_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `service_bookings` (`booking_id`) ON DELETE CASCADE,\n"
            + "  CONSTRAINT `service_booking_lines_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT,\n"
            + "  CONSTRAINT `service_booking_lines_ibfk_3` FOREIGN KEY (`pos_transaction_line_id`) REFERENCES `pos_transaction_lines` (`line_id`) ON DELETE SET NULL\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    // Phase 88 of #482 (ADR 0064 decision 2) - the handoff-leg entity, keyed to service_bookings.
    service_booking_handoff_legs: Object.freeze({
        sql: "CREATE TABLE `service_booking_handoff_legs` (\n"
            + "  `handoff_leg_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `booking_id` int NOT NULL,\n"
            + "  `direction` enum('inbound','outbound') NOT NULL,\n"
            + "  `method` enum('business_pickup','business_delivery','customer_dropoff','customer_collection') NOT NULL,\n"
            + "  `address_line` text,\n"
            + "  `latitude` decimal(10,8) DEFAULT NULL,\n"
            + "  `longitude` decimal(11,8) DEFAULT NULL,\n"
            + "  `customer_address_id` int DEFAULT NULL,\n"
            + "  `location_id` int DEFAULT NULL,\n"
            + "  `scheduled_from` datetime DEFAULT NULL,\n"
            + "  `scheduled_to` datetime DEFAULT NULL,\n"
            + "  `contact_name` varchar(255) DEFAULT NULL,\n"
            + "  `contact_phone` varchar(50) DEFAULT NULL,\n"
            + "  `instructions` varchar(500) DEFAULT NULL,\n"
            + "  `status` enum('pending','scheduled','in_transit','completed','cancelled') NOT NULL DEFAULT 'pending',\n"
            + "  `completed_at` datetime DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`handoff_leg_id`),\n"
            + "  UNIQUE KEY `uq_service_booking_handoff_legs_booking_direction` (`booking_id`,`direction`),\n"
            + "  KEY `idx_service_booking_handoff_legs_customer_address` (`customer_address_id`),\n"
            + "  KEY `idx_service_booking_handoff_legs_location` (`location_id`),\n"
            + "  KEY `idx_service_booking_handoff_legs_status` (`status`),\n"
            + "  KEY `idx_service_booking_handoff_legs_scheduled_from` (`scheduled_from`),\n"
            + "  CONSTRAINT `service_booking_handoff_legs_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `service_bookings` (`booking_id`) ON DELETE CASCADE,\n"
            + "  CONSTRAINT `service_booking_handoff_legs_ibfk_2` FOREIGN KEY (`customer_address_id`) REFERENCES `customer_addresses` (`address_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `service_booking_handoff_legs_ibfk_3` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE SET NULL\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    // Phase 88 of #482 (ADR 0064 decision 4) - the status transition-event table.
    service_booking_status_events: Object.freeze({
        sql: "CREATE TABLE `service_booking_status_events` (\n"
            + "  `status_event_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `booking_id` int NOT NULL,\n"
            + "  `from_status` enum('requested','confirmed','checked_in','in_service','completed','cancelled','no_show','for_pickup','pickup_completed','out_for_return','ready_for_collection') DEFAULT NULL,\n"
            + "  `to_status` enum('requested','confirmed','checked_in','in_service','completed','cancelled','no_show','for_pickup','pickup_completed','out_for_return','ready_for_collection') NOT NULL,\n"
            + "  `handoff_leg_id` int DEFAULT NULL,\n"
            + "  `actor_type` enum('customer','staff','system') NOT NULL DEFAULT 'system',\n"
            + "  `actor_user_id` int DEFAULT NULL,\n"
            + "  `source` enum('storefront','pos','admin','system') NOT NULL DEFAULT 'system',\n"
            + "  `reason` varchar(500) DEFAULT NULL,\n"
            + "  `occurred_at` datetime NOT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`status_event_id`),\n"
            + "  KEY `idx_service_booking_status_events_booking_occurred` (`booking_id`,`occurred_at`),\n"
            + "  KEY `idx_service_booking_status_events_handoff_leg` (`handoff_leg_id`),\n"
            + "  KEY `idx_service_booking_status_events_actor_user` (`actor_user_id`),\n"
            + "  CONSTRAINT `service_booking_status_events_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `service_bookings` (`booking_id`) ON DELETE CASCADE,\n"
            + "  CONSTRAINT `service_booking_status_events_ibfk_2` FOREIGN KEY (`handoff_leg_id`) REFERENCES `service_booking_handoff_legs` (`handoff_leg_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `service_booking_status_events_ibfk_3` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    }),
    // Phase 102 of #455 (ADR 0066) - the voucher campaign, its scopes, and its redemption ledger.
    // Declared in FK-dependency order: vouchers -> voucher_scopes -> voucher_redemptions ->
    // voucher_redemption_lines. Money is integer centavos (ADR 0066 decision 2); cumulative columns
    // are bigint because a campaign budget in centavos overflows int at only ~21.5M pesos.
    // Eligibility is a tinyint bitmask, not MySQL SET: `DataTypes.SET` does not exist in Sequelize
    // 6.x, so a SET column cannot be expressed in the model layer that `sequelize.sync()` uses to
    // provision new tenants. NOT NULL with an explicit default is the property that matters -
    // "eligible everywhere" must not be producible by omission (#459).
    vouchers: Object.freeze({
        sql: "CREATE TABLE `vouchers` (\n"
            + "  `voucher_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `code` varchar(64) NOT NULL,\n"
            + "  `voucher_kind` enum('promo_code') NOT NULL DEFAULT 'promo_code',\n"
            + "  `title` varchar(255) NOT NULL,\n"
            + "  `subtitle` varchar(255) DEFAULT NULL,\n"
            + "  `badge` varchar(80) DEFAULT NULL,\n"
            + "  `validity_text` varchar(255) DEFAULT NULL,\n"
            + "  `benefit_class` enum('percent_off','amount_off','fixed_price') NOT NULL,\n"
            + "  `percent_off_bps` int DEFAULT NULL,\n"
            + "  `amount_off_centavos` bigint DEFAULT NULL,\n"
            + "  `fixed_unit_price_centavos` bigint DEFAULT NULL,\n"
            + "  `max_discount_centavos` bigint DEFAULT NULL,\n"
            + "  `min_spend_centavos` bigint DEFAULT NULL,\n"
            + "  `min_quantity` int DEFAULT NULL,\n"
            + "  `allow_below_cost` tinyint(1) NOT NULL DEFAULT '0',\n"
            + "  `stackable_with_statutory` tinyint(1) NOT NULL DEFAULT '0',\n"
            + "  `valid_from` date DEFAULT NULL,\n"
            + "  `valid_until` date DEFAULT NULL,\n"
            + "  `valid_time_start` varchar(5) DEFAULT NULL,\n"
            + "  `valid_time_end` varchar(5) DEFAULT NULL,\n"
            + "  `weekday_mask` tinyint unsigned NOT NULL DEFAULT '127',\n"
            + "  `channels_mask` tinyint unsigned NOT NULL DEFAULT '1',\n"
            + "  `fulfillment_methods_mask` tinyint unsigned NOT NULL DEFAULT '3',\n"
            + "  `order_timings_mask` tinyint unsigned NOT NULL DEFAULT '3',\n"
            + "  `max_redemptions` int DEFAULT NULL,\n"
            + "  `max_total_discount_centavos` bigint DEFAULT NULL,\n"
            + "  `max_benefit_quantity` int DEFAULT NULL,\n"
            + "  `redeemed_count` int NOT NULL DEFAULT '0',\n"
            + "  `redeemed_value_centavos` bigint NOT NULL DEFAULT '0',\n"
            + "  `redeemed_quantity` int NOT NULL DEFAULT '0',\n"
            + "  `conditions` json DEFAULT NULL,\n"
            + "  `status` enum('draft','active','paused','expired','archived') NOT NULL DEFAULT 'draft',\n"
            + "  `version` int NOT NULL DEFAULT '0',\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`voucher_id`),\n"
            + "  UNIQUE KEY `uq_vouchers_code` (`code`),\n"
            + "  KEY `idx_vouchers_status_validity` (`status`,`valid_from`,`valid_until`),\n"
            + "  KEY `idx_vouchers_kind` (`voucher_kind`)\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    }),
    // `scope_ref_id` is polymorphic across items(item_id) and item_folders(folder_id) depending on
    // `scope_type`, so it deliberately carries no FK - validated in voucherRepository instead.
    voucher_scopes: Object.freeze({
        sql: "CREATE TABLE `voucher_scopes` (\n"
            + "  `voucher_scope_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `voucher_id` int NOT NULL,\n"
            + "  `scope_type` enum('item','item_folder') NOT NULL,\n"
            + "  `scope_ref_id` int NOT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`voucher_scope_id`),\n"
            + "  UNIQUE KEY `uq_voucher_scopes_voucher_type_ref` (`voucher_id`,`scope_type`,`scope_ref_id`),\n"
            + "  KEY `idx_voucher_scopes_type_ref` (`scope_type`,`scope_ref_id`),\n"
            + "  CONSTRAINT `voucher_scopes_ibfk_1` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers` (`voucher_id`) ON DELETE CASCADE\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    }),
    // The redemption ledger - authoritative, append-only (no `updated_at`). `idempotency_key` is
    // NOT NULL UNIQUE and its row is inserted before the counter UPDATE, so a replay is rejected
    // here rather than double-counting. `dgfy_account_id` is a landlord-side pointer with no FK.
    voucher_redemptions: Object.freeze({
        sql: "CREATE TABLE `voucher_redemptions` (\n"
            + "  `voucher_redemption_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `voucher_id` int NOT NULL,\n"
            + "  `entry_type` enum('redemption','reversal','adjustment') NOT NULL DEFAULT 'redemption',\n"
            + "  `pos_transaction_id` int DEFAULT NULL,\n"
            + "  `channel` enum('storefront','pos') NOT NULL,\n"
            + "  `location_id` int DEFAULT NULL,\n"
            + "  `cashier_user_id` int DEFAULT NULL,\n"
            + "  `terminal_id` varchar(100) DEFAULT NULL,\n"
            + "  `store_customer_id` int DEFAULT NULL,\n"
            + "  `dgfy_account_id` int DEFAULT NULL,\n"
            + "  `code_snapshot` varchar(64) NOT NULL,\n"
            + "  `benefit_config_snapshot` json NOT NULL,\n"
            + "  `subtotal_centavos` bigint NOT NULL DEFAULT '0',\n"
            + "  `discount_centavos` bigint NOT NULL DEFAULT '0',\n"
            + "  `benefit_quantity` int NOT NULL DEFAULT '0',\n"
            + "  `redeemed_count_before` int NOT NULL,\n"
            + "  `redeemed_count_after` int NOT NULL,\n"
            + "  `redeemed_value_before_centavos` bigint NOT NULL,\n"
            + "  `redeemed_value_after_centavos` bigint NOT NULL,\n"
            + "  `redeemed_quantity_before` int NOT NULL,\n"
            + "  `redeemed_quantity_after` int NOT NULL,\n"
            + "  `idempotency_key` varchar(160) NOT NULL,\n"
            + "  `reversal_of_redemption_id` int DEFAULT NULL,\n"
            + "  `reason` varchar(500) DEFAULT NULL,\n"
            + "  `metadata` json DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`voucher_redemption_id`),\n"
            + "  UNIQUE KEY `uq_voucher_redemptions_idempotency` (`idempotency_key`),\n"
            + "  KEY `idx_voucher_redemptions_voucher_created` (`voucher_id`,`created_at`),\n"
            + "  KEY `idx_voucher_redemptions_transaction` (`pos_transaction_id`),\n"
            + "  KEY `idx_voucher_redemptions_store_customer` (`store_customer_id`),\n"
            + "  KEY `idx_voucher_redemptions_channel` (`channel`),\n"
            + "  KEY `idx_voucher_redemptions_reversal_of` (`reversal_of_redemption_id`),\n"
            + "  KEY `idx_voucher_redemptions_location` (`location_id`),\n"
            + "  KEY `idx_voucher_redemptions_cashier` (`cashier_user_id`),\n"
            + "  CONSTRAINT `voucher_redemptions_ibfk_1` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers` (`voucher_id`),\n"
            + "  CONSTRAINT `voucher_redemptions_ibfk_2` FOREIGN KEY (`pos_transaction_id`) REFERENCES `pos_transactions` (`pos_transaction_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `voucher_redemptions_ibfk_3` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `voucher_redemptions_ibfk_4` FOREIGN KEY (`cashier_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `voucher_redemptions_ibfk_5` FOREIGN KEY (`store_customer_id`) REFERENCES `store_customers` (`customer_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `voucher_redemptions_ibfk_6` FOREIGN KEY (`reversal_of_redemption_id`) REFERENCES `voucher_redemptions` (`voucher_redemption_id`) ON DELETE SET NULL\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    }),
    // Per-item allocation. Both base and voucher unit prices are stored because
    // Item.default_sale_price moves with Dispatch Order dispatches - without the base snapshot,
    // "what did this campaign cost us" is unanswerable after the first dispatch.
    voucher_redemption_lines: Object.freeze({
        sql: "CREATE TABLE `voucher_redemption_lines` (\n"
            + "  `voucher_redemption_line_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `voucher_redemption_id` int NOT NULL,\n"
            + "  `item_id` int NOT NULL,\n"
            + "  `quantity` decimal(24,12) NOT NULL DEFAULT '0.000000000000',\n"
            + "  `base_unit_price_centavos` bigint NOT NULL DEFAULT '0',\n"
            + "  `voucher_unit_price_centavos` bigint NOT NULL DEFAULT '0',\n"
            + "  `discount_centavos` bigint NOT NULL DEFAULT '0',\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`voucher_redemption_line_id`),\n"
            + "  KEY `idx_voucher_redemption_lines_redemption` (`voucher_redemption_id`),\n"
            + "  KEY `idx_voucher_redemption_lines_item` (`item_id`),\n"
            + "  CONSTRAINT `voucher_redemption_lines_ibfk_1` FOREIGN KEY (`voucher_redemption_id`) REFERENCES `voucher_redemptions` (`voucher_redemption_id`) ON DELETE CASCADE,\n"
            + "  CONSTRAINT `voucher_redemption_lines_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`)\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    }),
    // Phase 111 of #696 (extends #584/ADR 0066) - a per-item pricelist a fixed_price voucher may
    // attach instead of a single fixed_unit_price_centavos. Declared after the voucher tables so
    // vouchers.pricelist_id's own column-repair FK (below) has something to reference; declared
    // before pricelist_items so that table's own FK to pricelists resolves.
    // `draft_of_pricelist_id` is a self-FK: a non-null value marks this row as the open draft
    // revision of the published pricelist it references (#698's draft -> publish cycle).
    pricelists: Object.freeze({
        sql: "CREATE TABLE `pricelists` (\n"
            + "  `pricelist_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `name` varchar(120) NOT NULL,\n"
            + "  `description` varchar(255) DEFAULT NULL,\n"
            + "  `status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',\n"
            + "  `draft_of_pricelist_id` int DEFAULT NULL,\n"
            + "  `version` int NOT NULL DEFAULT '0',\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`pricelist_id`),\n"
            + "  UNIQUE KEY `uq_pricelists_draft_of` (`draft_of_pricelist_id`),\n"
            + "  KEY `idx_pricelists_status` (`status`),\n"
            + "  CONSTRAINT `pricelists_ibfk_1` FOREIGN KEY (`draft_of_pricelist_id`) REFERENCES `pricelists` (`pricelist_id`) ON DELETE CASCADE\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    }),
    // Intent, not a delta (same reasoning as vouchers.fixed_unit_price_centavos, ADR 0066 decision
    // 5) - Item.default_sale_price moves with Dispatch Order dispatches. `is_manual_override`
    // distinguishes a deliberately-typed price from #698's SRP prefill; without it there is no way
    // to tell an untouched row (which drifts as default_sale_price moves) from one the merchant
    // actually priced.
    pricelist_items: Object.freeze({
        sql: "CREATE TABLE `pricelist_items` (\n"
            + "  `pricelist_item_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `pricelist_id` int NOT NULL,\n"
            + "  `item_id` int NOT NULL,\n"
            + "  `unit_price_centavos` bigint NOT NULL,\n"
            + "  `is_manual_override` tinyint(1) NOT NULL DEFAULT '0',\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`pricelist_item_id`),\n"
            + "  UNIQUE KEY `uq_pricelist_items_pricelist_item` (`pricelist_id`,`item_id`),\n"
            + "  KEY `idx_pricelist_items_item` (`item_id`),\n"
            + "  CONSTRAINT `pricelist_items_ibfk_1` FOREIGN KEY (`pricelist_id`) REFERENCES `pricelists` (`pricelist_id`) ON DELETE CASCADE,\n"
            + "  CONSTRAINT `pricelist_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`)\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    }),
    // Phase 118: additive transaction-linked adjustment evidence. The table is
    // intentionally registered as a complete repair unit so older tenant
    // schemas can receive the same foreign keys and indexes as new tenants.
    pos_transaction_adjustments: Object.freeze({
        sql: "CREATE TABLE `pos_transaction_adjustments` (\n"
            + "  `pos_transaction_adjustment_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `adjustment_reference` varchar(40) NOT NULL,\n"
            + "  `pos_transaction_id` int NOT NULL,\n"
            + "  `pos_payment_allocation_id` int DEFAULT NULL,\n"
            + "  `original_cashier_id` int DEFAULT NULL,\n"
            + "  `original_shift_id` int DEFAULT NULL,\n"
            + "  `original_terminal_id` varchar(100) DEFAULT NULL,\n"
            + "  `original_location_id` int DEFAULT NULL,\n"
            + "  `actor_user_id` int NOT NULL,\n"
            + "  `actor_shift_id` int DEFAULT NULL,\n"
            + "  `actor_terminal_id` varchar(100) DEFAULT NULL,\n"
            + "  `actor_location_id` int DEFAULT NULL,\n"
            + "  `adjustment_type` enum('void','cash_refund','external_refund','provider_refund','employee_credit_reversal') NOT NULL,\n"
            + "  `tender_type` varchar(40) NOT NULL,\n"
            + "  `amount` decimal(14,4) NOT NULL,\n"
            + "  `currency` varchar(3) NOT NULL DEFAULT 'PHP',\n"
            + "  `status` enum('pending','succeeded','failed','cancelled','manual_review_required') NOT NULL DEFAULT 'pending',\n"
            + "  `reason` varchar(255) NOT NULL,\n"
            + "  `idempotency_key` varchar(120) NOT NULL,\n"
            + "  `request_hash` varchar(64) NOT NULL,\n"
            + "  `approved_by` int DEFAULT NULL,\n"
            + "  `approved_at` datetime DEFAULT NULL,\n"
            + "  `external_reference` varchar(255) DEFAULT NULL,\n"
            + "  `provider` varchar(40) DEFAULT NULL,\n"
            + "  `provider_reference` varchar(120) DEFAULT NULL,\n"
            + "  `provider_event_id` varchar(255) DEFAULT NULL,\n"
            + "  `cash_drawer_event_id` int DEFAULT NULL,\n"
            + "  `failure_code` varchar(80) DEFAULT NULL,\n"
            + "  `failure_reason` varchar(500) DEFAULT NULL,\n"
            + "  `retry_count` int NOT NULL DEFAULT '0',\n"
            + "  `last_retry_at` datetime DEFAULT NULL,\n"
            + "  `completed_at` datetime DEFAULT NULL,\n"
            + "  `failed_at` datetime DEFAULT NULL,\n"
            + "  `cancelled_at` datetime DEFAULT NULL,\n"
            + "  `metadata` json DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`pos_transaction_adjustment_id`),\n"
            + "  UNIQUE KEY `adjustment_reference` (`adjustment_reference`),\n"
            + "  UNIQUE KEY `uq_pos_transaction_adjustments_transaction_idempotency` (`pos_transaction_id`,`idempotency_key`),\n"
            + "  UNIQUE KEY `uq_pos_transaction_adjustments_provider_event_id` (`provider_event_id`),\n"
            + "  KEY `idx_pos_transaction_adjustments_transaction_created` (`pos_transaction_id`,`created_at`),\n"
            + "  KEY `idx_pos_transaction_adjustments_allocation_created` (`pos_payment_allocation_id`,`created_at`),\n"
            + "  KEY `idx_pos_transaction_adjustments_original_shift_created` (`original_shift_id`,`created_at`),\n"
            + "  KEY `idx_pos_transaction_adjustments_actor_created` (`actor_user_id`,`created_at`),\n"
            + "  KEY `idx_pos_transaction_adjustments_status_created` (`status`,`created_at`),\n"
            + "  KEY `idx_pos_transaction_adjustments_cash_drawer_event` (`cash_drawer_event_id`),\n"
            + "  CONSTRAINT `pos_transaction_adjustments_ibfk_1` FOREIGN KEY (`pos_transaction_id`) REFERENCES `pos_transactions` (`pos_transaction_id`) ON DELETE RESTRICT,\n"
            + "  CONSTRAINT `pos_transaction_adjustments_ibfk_2` FOREIGN KEY (`pos_payment_allocation_id`) REFERENCES `pos_payment_allocations` (`pos_payment_allocation_id`) ON DELETE RESTRICT,\n"
            + "  CONSTRAINT `pos_transaction_adjustments_ibfk_3` FOREIGN KEY (`original_cashier_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `pos_transaction_adjustments_ibfk_4` FOREIGN KEY (`original_shift_id`) REFERENCES `pos_terminal_shifts` (`pos_terminal_shift_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `pos_transaction_adjustments_ibfk_5` FOREIGN KEY (`original_location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `pos_transaction_adjustments_ibfk_6` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,\n"
            + "  CONSTRAINT `pos_transaction_adjustments_ibfk_7` FOREIGN KEY (`actor_shift_id`) REFERENCES `pos_terminal_shifts` (`pos_terminal_shift_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `pos_transaction_adjustments_ibfk_8` FOREIGN KEY (`actor_location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `pos_transaction_adjustments_ibfk_9` FOREIGN KEY (`approved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `pos_transaction_adjustments_ibfk_10` FOREIGN KEY (`cash_drawer_event_id`) REFERENCES `pos_cash_drawer_events` (`pos_cash_drawer_event_id`) ON DELETE SET NULL\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    }),
    // Phase 137 (#819) -- ADR 0069 clause 4b (carried over verbatim from ADR 0068 clause 4b).
    // This DDL was originally hand-authored from the 20260821000004 migration's column defs (no
    // local MySQL was available in the drafting session). pr-reviewer independently verified it
    // byte-for-byte against a real `SHOW CREATE TABLE` output from a scratch MySQL 8.0 run of all
    // 263 migrations (PR #829 review, 2026-08-21) -- confirmed structurally correct; only
    // cosmetic differences (key ordering, MySQL's implicit `ON UPDATE RESTRICT`). Verified, not
    // provisional.
    pos_order_payments: Object.freeze({
        sql: "CREATE TABLE `pos_order_payments` (\n"
            + "  `pos_order_payment_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `pos_transaction_id` int NOT NULL,\n"
            + "  `kind` enum('downpayment','balance','refund','forfeiture') NOT NULL,\n"
            + "  `status` enum('pending','successful','failed','cancelled','reversed') NOT NULL DEFAULT 'pending',\n"
            + "  `amount` decimal(14,4) NOT NULL,\n"
            + "  `payment_method` enum('cash','gcash','maya','card','bank_transfer','qrph','employee_credit','grab_pay','shopeepay') NOT NULL,\n"
            + "  `idempotency_key` varchar(120) NOT NULL,\n"
            + "  `payment_reference` varchar(120) DEFAULT NULL,\n"
            + "  `payment_provider` varchar(40) DEFAULT NULL,\n"
            + "  `provider_event_id` varchar(120) DEFAULT NULL,\n"
            + "  `related_pos_order_payment_id` int DEFAULT NULL,\n"
            + "  `recorded_by` int DEFAULT NULL,\n"
            + "  `confirmed_at` datetime DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`pos_order_payment_id`),\n"
            + "  UNIQUE KEY `uq_pos_order_payments_transaction_idempotency` (`pos_transaction_id`,`idempotency_key`),\n"
            + "  UNIQUE KEY `uq_pos_order_payments_provider_event_id` (`provider_event_id`),\n"
            + "  KEY `idx_pos_order_payments_transaction_status` (`pos_transaction_id`,`status`),\n"
            + "  KEY `idx_pos_order_payments_transaction_kind` (`pos_transaction_id`,`kind`),\n"
            + "  KEY `idx_pos_order_payments_created_at` (`created_at`),\n"
            + "  KEY `related_pos_order_payment_id` (`related_pos_order_payment_id`),\n"
            + "  KEY `recorded_by` (`recorded_by`),\n"
            + "  CONSTRAINT `pos_order_payments_ibfk_1` FOREIGN KEY (`pos_transaction_id`) REFERENCES `pos_transactions` (`pos_transaction_id`) ON DELETE RESTRICT,\n"
            + "  CONSTRAINT `pos_order_payments_ibfk_2` FOREIGN KEY (`related_pos_order_payment_id`) REFERENCES `pos_order_payments` (`pos_order_payment_id`) ON DELETE SET NULL,\n"
            + "  CONSTRAINT `pos_order_payments_ibfk_3` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    }),
    // Online inventory reservations are tenant-local and must be repaired for tenants that
    // predate the reservation migration. Keep this DDL aligned with
    // 20260822000001-create-inventory-reservations.cjs; the runner uses the same additive shape.
    inventory_reservations: Object.freeze({
        sql: "CREATE TABLE `inventory_reservations` (\n"
            + "  `inventory_reservation_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `source_type` enum('online_order') NOT NULL,\n"
            + "  `source_id` int NOT NULL,\n"
            + "  `location_id` int NOT NULL,\n"
            + "  `status` enum('active','released','expired','converted') NOT NULL DEFAULT 'active',\n"
            + "  `expires_at` datetime NOT NULL,\n"
            + "  `released_at` datetime DEFAULT NULL,\n"
            + "  `release_reason` varchar(80) DEFAULT NULL,\n"
            + "  `converted_at` datetime DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`inventory_reservation_id`),\n"
            + "  UNIQUE KEY `uq_inventory_reservations_source` (`source_type`,`source_id`),\n"
            + "  KEY `idx_inventory_reservations_location_status_expiry` (`location_id`,`status`,`expires_at`),\n"
            + "  KEY `idx_inventory_reservations_status_expiry` (`status`,`expires_at`),\n"
            + "  CONSTRAINT `inventory_reservations_ibfk_1` FOREIGN KEY (`source_id`) REFERENCES `pos_transactions` (`pos_transaction_id`) ON DELETE RESTRICT,\n"
            + "  CONSTRAINT `inventory_reservations_ibfk_2` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE RESTRICT\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    }),
    inventory_reservation_lines: Object.freeze({
        sql: "CREATE TABLE `inventory_reservation_lines` (\n"
            + "  `inventory_reservation_line_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `inventory_reservation_id` int NOT NULL,\n"
            + "  `item_id` int NOT NULL,\n"
            + "  `quantity` decimal(24,12) NOT NULL,\n"
            + "  `effect_type` enum('line_item','recipe_ingredient','modifier') NOT NULL,\n"
            + "  `source_line_reference` varchar(120) NOT NULL,\n"
            + "  `metadata` json DEFAULT NULL,\n"
            + "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            + "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
            + "  PRIMARY KEY (`inventory_reservation_line_id`),\n"
            + "  KEY `idx_inventory_reservation_lines_reservation` (`inventory_reservation_id`),\n"
            + "  KEY `idx_inventory_reservation_lines_item` (`item_id`),\n"
            + "  KEY `idx_inventory_reservation_lines_item_created` (`item_id`,`created_at`),\n"
            + "  CONSTRAINT `inventory_reservation_lines_ibfk_1` FOREIGN KEY (`inventory_reservation_id`) REFERENCES `inventory_reservations` (`inventory_reservation_id`) ON DELETE CASCADE,\n"
            + "  CONSTRAINT `inventory_reservation_lines_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT\n"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    })
});

// Indexes that must exist once their owning column is present. Tracked separately from
// REQUIRED_TENANT_SCHEMA_COLUMNS because MySQL enforces this one as UNIQUE and a plain
// column-presence check can't tell "column added, index still missing" apart from "both present".
export const REQUIRED_TENANT_SCHEMA_INDEXES = Object.freeze({
    item_folders: Object.freeze({
        uq_item_folders_active_name: Object.freeze({
            sql: "ALTER TABLE `item_folders` ADD UNIQUE INDEX `uq_item_folders_active_name` (`active_name_key`)"
        })
    }),
    pos_terminal_shifts: Object.freeze({
        uq_pos_terminal_shifts_active_terminal: Object.freeze({
            sql: "ALTER TABLE `pos_terminal_shifts` ADD UNIQUE INDEX `uq_pos_terminal_shifts_active_terminal` (`active_terminal_id`)"
        }),
        uq_pos_terminal_shifts_active_operator: Object.freeze({
            sql: "ALTER TABLE `pos_terminal_shifts` ADD UNIQUE INDEX `uq_pos_terminal_shifts_active_operator` (`active_operator_user_id`)"
        })
    }),
    pos_z_reading_snapshots: Object.freeze({
        uq_pos_z_reading_snapshots_business_date_location: Object.freeze({
            sql: "ALTER TABLE `pos_z_reading_snapshots` ADD UNIQUE INDEX `uq_pos_z_reading_snapshots_business_date_location` (`business_date`,`location_id`)"
        }),
        idx_pos_z_reading_snapshots_closed_by_user: Object.freeze({
            sql: "ALTER TABLE `pos_z_reading_snapshots` ADD INDEX `idx_pos_z_reading_snapshots_closed_by_user` (`closed_by_user_id`)"
        })
    }),
    pos_transaction_discounts: Object.freeze({
        idx_pos_transaction_discounts_promo_code: Object.freeze({
            sql: "ALTER TABLE `pos_transaction_discounts` ADD INDEX `idx_pos_transaction_discounts_promo_code` (`promo_code`)"
        })
    }),
    pos_payment_allocations: Object.freeze({
        idx_pos_payment_allocations_session_reversal_status: Object.freeze({
            sql: "ALTER TABLE `pos_payment_allocations` ADD INDEX `idx_pos_payment_allocations_session_reversal_status` (`session_id`,`reversal_status`)"
        }),
        uq_pos_payment_allocations_provider_event_id: Object.freeze({
            sql: "ALTER TABLE `pos_payment_allocations` ADD UNIQUE INDEX `uq_pos_payment_allocations_provider_event_id` (`provider_event_id`)"
        }),
        uq_pos_payment_allocations_provider_refund_event_id: Object.freeze({
            sql: "ALTER TABLE `pos_payment_allocations` ADD UNIQUE INDEX `uq_pos_payment_allocations_provider_refund_event_id` (`provider_refund_event_id`)"
        })
    }),
    pos_transaction_adjustments: Object.freeze({
        idx_pos_transaction_adjustments_allocation_created: Object.freeze({
            sql: "ALTER TABLE `pos_transaction_adjustments` ADD INDEX `idx_pos_transaction_adjustments_allocation_created` (`pos_payment_allocation_id`,`created_at`)"
        })
    }),
    delivery_personnel: Object.freeze({
        idx_delivery_personnel_name: Object.freeze({
            sql: "ALTER TABLE `delivery_personnel` ADD INDEX `idx_delivery_personnel_name` (`display_name`)"
        }),
        idx_delivery_personnel_location_active: Object.freeze({
            sql: "ALTER TABLE `delivery_personnel` ADD INDEX `idx_delivery_personnel_location_active` (`location_id`,`is_active`)"
        })
    }),
    delivery_jobs: Object.freeze({
        idx_delivery_jobs_personnel_status: Object.freeze({
            sql: "ALTER TABLE `delivery_jobs` ADD INDEX `idx_delivery_jobs_personnel_status` (`delivery_personnel_id`,`status`)"
        }),
        idx_delivery_jobs_assignment_shift: Object.freeze({
            sql: "ALTER TABLE `delivery_jobs` ADD INDEX `idx_delivery_jobs_assignment_shift` (`assigned_shift_id`)"
        })
    }),
    fnb_modifier_groups: Object.freeze({
        idx_fnb_modifier_groups_parent_option: Object.freeze({
            sql: "ALTER TABLE `fnb_modifier_groups` ADD INDEX `idx_fnb_modifier_groups_parent_option` (`parent_modifier_option_id`)"
        })
    }),
    audit_logs: Object.freeze({
        idx_audit_event_timestamp: Object.freeze({
            sql: "ALTER TABLE `audit_logs` ADD INDEX `idx_audit_event_timestamp` (`event_type`,`timestamp`)"
        }),
        idx_audit_terminal_timestamp: Object.freeze({
            sql: "ALTER TABLE `audit_logs` ADD INDEX `idx_audit_terminal_timestamp` (`terminal_id`,`timestamp`)"
        }),
        idx_audit_shift_timestamp: Object.freeze({
            sql: "ALTER TABLE `audit_logs` ADD INDEX `idx_audit_shift_timestamp` (`shift_id`,`timestamp`)"
        })
    }),
    pos_parked_sales: Object.freeze({
        idx_pos_parked_sales_origin_cashier_status: Object.freeze({
            sql: "ALTER TABLE `pos_parked_sales` ADD INDEX `idx_pos_parked_sales_origin_cashier_status` (`origin_cashier_id`,`status`)"
        }),
        idx_pos_parked_sales_origin_shift_status: Object.freeze({
            sql: "ALTER TABLE `pos_parked_sales` ADD INDEX `idx_pos_parked_sales_origin_shift_status` (`origin_shift_id`,`status`)"
        })
    }),
    // Voucher indexes (#455). A tenant that gets these tables from REQUIRED_TENANT_SCHEMA_TABLES
    // above already has every index inline in the CREATE TABLE, so these entries only fire for a
    // tenant whose tables came from sequelize.sync() -- which, before the model `indexes` blocks were
    // added alongside this, created none of them.
    //
    // uq_voucher_scopes_voucher_type_ref is the one that can legitimately fail here: adding a unique
    // index to a table that already holds duplicate (voucher_id, scope_type, scope_ref_id) rows
    // errors rather than silently dropping rows. That is the correct outcome -- it needs a human to
    // decide which duplicate survives -- and it is reported per-tenant like any other repair failure.
    vouchers: Object.freeze({
        uq_vouchers_code: Object.freeze({
            sql: "ALTER TABLE `vouchers` ADD UNIQUE INDEX `uq_vouchers_code` (`code`)"
        }),
        idx_vouchers_status_validity: Object.freeze({
            sql: "ALTER TABLE `vouchers` ADD INDEX `idx_vouchers_status_validity` (`status`,`valid_from`,`valid_until`)"
        }),
        idx_vouchers_kind: Object.freeze({
            sql: "ALTER TABLE `vouchers` ADD INDEX `idx_vouchers_kind` (`voucher_kind`)"
        }),
        idx_vouchers_pricelist: Object.freeze({
            sql: "ALTER TABLE `vouchers` ADD INDEX `idx_vouchers_pricelist` (`pricelist_id`)"
        })
    }),
    voucher_scopes: Object.freeze({
        uq_voucher_scopes_voucher_type_ref: Object.freeze({
            sql: "ALTER TABLE `voucher_scopes` ADD UNIQUE INDEX `uq_voucher_scopes_voucher_type_ref` (`voucher_id`,`scope_type`,`scope_ref_id`)"
        }),
        idx_voucher_scopes_type_ref: Object.freeze({
            sql: "ALTER TABLE `voucher_scopes` ADD INDEX `idx_voucher_scopes_type_ref` (`scope_type`,`scope_ref_id`)"
        })
    }),
    voucher_redemptions: Object.freeze({
        uq_voucher_redemptions_idempotency: Object.freeze({
            sql: "ALTER TABLE `voucher_redemptions` ADD UNIQUE INDEX `uq_voucher_redemptions_idempotency` (`idempotency_key`)"
        }),
        idx_voucher_redemptions_voucher_created: Object.freeze({
            sql: "ALTER TABLE `voucher_redemptions` ADD INDEX `idx_voucher_redemptions_voucher_created` (`voucher_id`,`created_at`)"
        }),
        idx_voucher_redemptions_transaction: Object.freeze({
            sql: "ALTER TABLE `voucher_redemptions` ADD INDEX `idx_voucher_redemptions_transaction` (`pos_transaction_id`)"
        }),
        idx_voucher_redemptions_store_customer: Object.freeze({
            sql: "ALTER TABLE `voucher_redemptions` ADD INDEX `idx_voucher_redemptions_store_customer` (`store_customer_id`)"
        }),
        idx_voucher_redemptions_channel: Object.freeze({
            sql: "ALTER TABLE `voucher_redemptions` ADD INDEX `idx_voucher_redemptions_channel` (`channel`)"
        }),
        idx_voucher_redemptions_reversal_of: Object.freeze({
            sql: "ALTER TABLE `voucher_redemptions` ADD INDEX `idx_voucher_redemptions_reversal_of` (`reversal_of_redemption_id`)"
        }),
        idx_voucher_redemptions_location: Object.freeze({
            sql: "ALTER TABLE `voucher_redemptions` ADD INDEX `idx_voucher_redemptions_location` (`location_id`)"
        }),
        idx_voucher_redemptions_cashier: Object.freeze({
            sql: "ALTER TABLE `voucher_redemptions` ADD INDEX `idx_voucher_redemptions_cashier` (`cashier_user_id`)"
        })
    }),
    voucher_redemption_lines: Object.freeze({
        idx_voucher_redemption_lines_redemption: Object.freeze({
            sql: "ALTER TABLE `voucher_redemption_lines` ADD INDEX `idx_voucher_redemption_lines_redemption` (`voucher_redemption_id`)"
        }),
        idx_voucher_redemption_lines_item: Object.freeze({
            sql: "ALTER TABLE `voucher_redemption_lines` ADD INDEX `idx_voucher_redemption_lines_item` (`item_id`)"
        })
    }),
    // Pricelist indexes (#696). Same rationale as the voucher block above -- only fires for a
    // tenant whose tables came from sequelize.sync() rather than REQUIRED_TENANT_SCHEMA_TABLES.
    pricelists: Object.freeze({
        idx_pricelists_status: Object.freeze({
            sql: "ALTER TABLE `pricelists` ADD INDEX `idx_pricelists_status` (`status`)"
        }),
        uq_pricelists_draft_of: Object.freeze({
            sql: "ALTER TABLE `pricelists` ADD UNIQUE INDEX `uq_pricelists_draft_of` (`draft_of_pricelist_id`)"
        })
    }),
    pricelist_items: Object.freeze({
        uq_pricelist_items_pricelist_item: Object.freeze({
            sql: "ALTER TABLE `pricelist_items` ADD UNIQUE INDEX `uq_pricelist_items_pricelist_item` (`pricelist_id`,`item_id`)"
        }),
        idx_pricelist_items_item: Object.freeze({
            sql: "ALTER TABLE `pricelist_items` ADD INDEX `idx_pricelist_items_item` (`item_id`)"
        })
    })
});

const quoteIdentifier = (value) => `\`${String(value).replace(/`/g, '``')}\``;

const queryWithReplacements = (connection, sql, replacements = []) => {
    const isSequelizeConnection = typeof connection?.getDialect === 'function'
        && typeof connection?.getQueryInterface === 'function';
    return isSequelizeConnection
        ? connection.query(sql, { replacements })
        : connection.query(sql, replacements);
};

async function removeLegacyItemFolderNameUniqueIndexes(connection, tenantDb) {
    const [rows] = await queryWithReplacements(
        connection,
        `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'item_folders'`,
        [tenantDb]
    );
    const indexes = new Map();
    rows.forEach((row) => {
        const indexName = String(row.INDEX_NAME || '');
        if (!indexName || indexName === 'PRIMARY' || Number(row.NON_UNIQUE) !== 0) return;
        indexes.set(indexName, [...(indexes.get(indexName) || []), String(row.COLUMN_NAME || '')]);
    });
    for (const [indexName, columns] of indexes) {
        if (columns.length === 1 && columns[0] === 'name') {
            await connection.query(`ALTER TABLE ${quoteIdentifier(tenantDb)}.${quoteIdentifier('item_folders')} DROP INDEX ${quoteIdentifier(indexName)}`);
        }
    }
}

export async function repairItemFolderCategoryLifecycleSchema(connection, tenantDb) {
    const [columns] = await queryWithReplacements(
        connection,
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'item_folders'`,
        [tenantDb]
    );
    const existingColumns = new Set(columns.map((row) => row.COLUMN_NAME));
    if (!existingColumns.has('deleted_at')) {
        await connection.query(`ALTER TABLE ${quoteIdentifier(tenantDb)}.${quoteIdentifier('item_folders')} ADD COLUMN ${quoteIdentifier('deleted_at')} DATETIME NULL`);
    }
    if (!existingColumns.has('deleted_by')) {
        await connection.query(`ALTER TABLE ${quoteIdentifier(tenantDb)}.${quoteIdentifier('item_folders')} ADD COLUMN ${quoteIdentifier('deleted_by')} INTEGER NULL`);
    }
    await removeLegacyItemFolderNameUniqueIndexes(connection, tenantDb);
    if (!existingColumns.has('active_name_key')) {
        await connection.query(`ALTER TABLE ${quoteIdentifier(tenantDb)}.${quoteIdentifier('item_folders')} ADD COLUMN ${quoteIdentifier('active_name_key')} VARCHAR(100) GENERATED ALWAYS AS (CASE WHEN ${quoteIdentifier('is_active')} = 1 AND ${quoteIdentifier('deleted_at')} IS NULL THEN LOWER(TRIM(${quoteIdentifier('name')})) ELSE NULL END) STORED`);
    }
    const [indexes] = await queryWithReplacements(
        connection,
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'item_folders'`,
        [tenantDb]
    );
    if (!indexes.some((row) => row.INDEX_NAME === 'uq_item_folders_active_name')) {
        await connection.query(`ALTER TABLE ${quoteIdentifier(tenantDb)}.${quoteIdentifier('item_folders')} ADD UNIQUE INDEX ${quoteIdentifier('uq_item_folders_active_name')} (${quoteIdentifier('active_name_key')})`);
    }
}

// Existing parked sales predate the shared-queue handoff columns. Preserve their
// creator/shift identity before a future cashier claims the sale and the current
// ownership fields move to the new cashier/shift.
export async function repairPosParkedSaleOriginOwnership(connection, tenantDb) {
    await connection.query(
        `UPDATE ${quoteIdentifier(tenantDb)}.${quoteIdentifier('pos_parked_sales')}
            SET ${quoteIdentifier('origin_cashier_id')} = COALESCE(${quoteIdentifier('origin_cashier_id')}, ${quoteIdentifier('cashier_id')}),
                ${quoteIdentifier('origin_shift_id')} = COALESCE(${quoteIdentifier('origin_shift_id')}, ${quoteIdentifier('shift_id')})
          WHERE ${quoteIdentifier('origin_cashier_id')} IS NULL
             OR ${quoteIdentifier('origin_shift_id')} IS NULL`
    );
}

// MySQL refuses to add a STORED generated column whose base column carries an ON UPDATE
// CASCADE/SET NULL/SET DEFAULT foreign key (adding a stored generated column forces an
// ALGORITHM=COPY rebuild that re-validates the FK against this rule), surfacing only as a
// generic "Cannot add foreign key constraint" (errno 1215). pos_terminal_shifts.cashier_id
// carries exactly such an FK pointed at users.user_id, an AUTO_INCREMENT primary key that's
// never updated in place, so CASCADE there is unused. Must run BEFORE the generic
// REQUIRED_TENANT_SCHEMA_COLUMNS repair loop adds `active_operator_user_id`, on every tenant
// (constraint name varies per database: ibfk_1, ibfk_2, ibfk_4, ibfk_8, ...).
export async function relaxPosShiftCashierForeignKey(connection, tenantDb) {
    const [rows] = await queryWithReplacements(
        connection,
        `SELECT rc.CONSTRAINT_NAME AS constraintName, rc.UPDATE_RULE AS updateRule
           FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
           JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
             ON k.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
            AND k.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
          WHERE rc.CONSTRAINT_SCHEMA = ?
            AND rc.TABLE_NAME = 'pos_terminal_shifts'
            AND k.COLUMN_NAME = 'cashier_id'`,
        [tenantDb]
    );
    const foreignKey = rows[0];
    if (!foreignKey || String(foreignKey.updateRule).toUpperCase() === 'RESTRICT') return;

    const table = `${quoteIdentifier(tenantDb)}.${quoteIdentifier('pos_terminal_shifts')}`;
    const constraintName = quoteIdentifier(foreignKey.constraintName);
    await connection.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${constraintName}`);
    await connection.query(`
        ALTER TABLE ${table}
        ADD CONSTRAINT ${constraintName}
        FOREIGN KEY (${quoteIdentifier('cashier_id')}) REFERENCES ${quoteIdentifier(tenantDb)}.${quoteIdentifier('users')} (${quoteIdentifier('user_id')})
        ON UPDATE RESTRICT ON DELETE RESTRICT
    `);
}

// Seed rows that ship with a REQUIRED_TENANT_SCHEMA_TABLES table. Gated on the table being empty
// (rather than "was it just created by this run") so a prior partial failure — table created,
// seed step never ran — self-heals on the next pass instead of silently staying unseeded forever.
export const REQUIRED_TENANT_SCHEMA_SEEDS = Object.freeze({
    pos_discount_rules: Object.freeze({
        insertSql: "INSERT INTO `pos_discount_rules` "
            + "(`name`, `type`, `method`, `rate`, `is_vat_exempt`, `requires_customer_id`, `requires_employee_id`, `requires_manager_approval`, `is_active`, `created_at`, `updated_at`) VALUES "
            + "('Senior Citizen', 'senior', 'percentage', 20, 1, 1, 0, 0, 1, NOW(), NOW()), "
            + "('PWD', 'pwd', 'percentage', 20, 1, 1, 0, 0, 1, NOW(), NOW()), "
            + "('Employee Discount', 'employee', 'percentage', NULL, 0, 0, 1, 1, 1, NOW(), NOW()), "
            + "('Manual Discount', 'manual', 'percentage', NULL, 0, 0, 0, 1, 1, NOW(), NOW())"
    })
});

// Columns that already exist on older tenant schemas but whose ENUM definition has since
// widened (e.g. Services-mode support added `category = 'service'` to `items` long after the
// column itself was created). Presence checks alone won't catch this drift, so these are
// tracked separately and repaired via `ALTER ... MODIFY COLUMN` rather than `ADD COLUMN`.
export const REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS = Object.freeze({
    items: Object.freeze({
        category: Object.freeze({
            enumValues: Object.freeze(['raw_material', 'packaging', 'product', 'supplies', 'service']),
            sql: "ALTER TABLE `items` MODIFY COLUMN `category` ENUM('raw_material','packaging','product','supplies','service') NOT NULL"
        })
    }),
    // Same Services-mode migration (20260502000001) also widened both of these order_method
    // ENUMs to add 'appointment' — needed by the booking-settlement flow, which writes
    // pos_transactions.order_method = 'appointment'. Presence checks miss this the same way
    // they missed items.category above.
    pos_transactions: Object.freeze({
        payment_type: Object.freeze({
            enumValues: Object.freeze(['cash', 'gcash', 'maya', 'card', 'bank_transfer', 'qrph', 'employee_credit', 'grab_pay', 'shopeepay']),
            sql: "ALTER TABLE `pos_transactions` MODIFY COLUMN `payment_type` ENUM('cash','gcash','maya','card','bank_transfer','qrph','employee_credit','grab_pay','shopeepay') NOT NULL DEFAULT 'cash'"
        }),
        // Phase 137 (#819) -- ADR 0069 clause 4 (carried over verbatim from ADR 0068 clause 4).
        // Backstop for tenants outside the migration's own fan-out (20260821000003).
        payment_status: Object.freeze({
            enumValues: Object.freeze(['unpaid', 'payment_pending', 'paid', 'partially_paid', 'failed', 'refund_pending', 'partial_refunded', 'refunded']),
            sql: "ALTER TABLE `pos_transactions` MODIFY COLUMN `payment_status` ENUM('unpaid','payment_pending','paid','partially_paid','failed','refund_pending','partial_refunded','refunded') NOT NULL DEFAULT 'paid'"
        }),
        order_method: Object.freeze({
            enumValues: Object.freeze(['dine_in', 'takeout', 'pickup', 'delivery', 'online', 'appointment', 'walk_in']),
            sql: "ALTER TABLE `pos_transactions` MODIFY COLUMN `order_method` ENUM('dine_in','takeout','pickup','delivery','online','appointment','walk_in') NOT NULL DEFAULT 'dine_in'"
        }),
        service_fee_method_snapshot: Object.freeze({
            enumValues: Object.freeze(['dine_in', 'takeout', 'pickup', 'delivery', 'online', 'appointment', 'walk_in']),
            sql: "ALTER TABLE `pos_transactions` MODIFY COLUMN `service_fee_method_snapshot` ENUM('dine_in','takeout','pickup','delivery','online','appointment','walk_in') NULL"
        })
    }),
    employee_credit_ledger_entries: Object.freeze({
        entry_type: Object.freeze({
            enumValues: Object.freeze(['grant', 'debit', 'charge', 'repayment', 'reversal', 'adjustment', 'expiration']),
            sql: "ALTER TABLE `employee_credit_ledger_entries` MODIFY COLUMN `entry_type` ENUM('grant','debit','charge','repayment','reversal','adjustment','expiration') NOT NULL"
        })
    }),
    // Phase 88 of #482 (ADR 0064): both widened by migration 20260815000001. Older tenant
    // schemas already have these columns from earlier migrations, just with the narrower enum -
    // same drift class as items.category above.
    service_item_details: Object.freeze({
        service_area_type: Object.freeze({
            enumValues: Object.freeze(['in_store', 'customer_location', 'online', 'hybrid', 'item_handoff']),
            sql: "ALTER TABLE `service_item_details` MODIFY COLUMN `service_area_type` ENUM('in_store','customer_location','online','hybrid','item_handoff') NOT NULL DEFAULT 'in_store'"
        })
    }),
    service_bookings: Object.freeze({
        status: Object.freeze({
            enumValues: Object.freeze(['requested', 'confirmed', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show', 'for_pickup', 'pickup_completed', 'out_for_return', 'ready_for_collection']),
            sql: "ALTER TABLE `service_bookings` MODIFY COLUMN `status` ENUM('requested','confirmed','checked_in','in_service','completed','cancelled','no_show','for_pickup','pickup_completed','out_for_return','ready_for_collection') NOT NULL DEFAULT 'requested'"
        })
    })
});

export const TENANT_SCHEMA_CAPABILITY_VERSION = '2026-08-22.1';
export const TENANT_SCHEMA_REPAIR_COLLATION_POLICY = 'server-supported-utf8mb4';

export function getTenantSchemaCapabilityChecksum() {
    const manifest = {
        version: TENANT_SCHEMA_CAPABILITY_VERSION,
        repair_collation_policy: TENANT_SCHEMA_REPAIR_COLLATION_POLICY,
        tables: REQUIRED_TENANT_SCHEMA_TABLES,
        columns: REQUIRED_TENANT_SCHEMA_COLUMNS,
        indexes: REQUIRED_TENANT_SCHEMA_INDEXES,
        seeds: REQUIRED_TENANT_SCHEMA_SEEDS,
        enum_contracts: REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS
    };

    return crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

export function normalizeErrorSignature(message) {
    const raw = String(message || '').trim();
    if (!raw) {
        return {
            error_code: 'unknown_error',
            normalized_message: 'unknown error',
            fingerprint: 'unknown'
        };
    }

    const lowered = raw.toLowerCase();
    let errorCode = 'unknown_error';
    if (lowered.includes('too many keys specified; max 64 keys allowed')) {
        errorCode = 'mysql_too_many_keys';
    } else if (lowered.includes('foreign key constraint is incorrectly formed') || lowered.includes('errno: 150')) {
        errorCode = 'mysql_foreign_key_incorrectly_formed';
    }

    const normalizedMessage = lowered
        .replace(/`[^`]+`/g, '`<redacted>`')
        .replace(/\b\d+\b/g, '#')
        .replace(/\s+/g, ' ')
        .trim();

    const fingerprint = crypto
        .createHash('sha1')
        .update(`${errorCode}|${normalizedMessage}`)
        .digest('hex')
        .slice(0, 16);

    return {
        error_code: errorCode,
        normalized_message: normalizedMessage,
        fingerprint
    };
}

export function createSyncFailureRecord(tenant, error) {
    const signature = normalizeErrorSignature(error?.message || error);
    return {
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        tenant_db: tenant.db_name,
        status: 'failed',
        error_code: signature.error_code,
        error_message: String(error?.message || error || 'Unknown error'),
        normalized_message: signature.normalized_message,
        fingerprint: signature.fingerprint,
        missing_columns: Array.isArray(error?.missing_columns) ? error.missing_columns : undefined,
        missing_enum_values: Array.isArray(error?.missing_enum_values) ? error.missing_enum_values : undefined,
        repair_sql: Array.isArray(error?.repair_sql) ? error.repair_sql : undefined
    };
}

function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        reportFile: '',
        failOnError: false,
        mode: process.env.TENANT_SCHEMA_SYNC_MODE || 'report'
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--report-file') {
            options.reportFile = argv[i + 1] || '';
            i += 1;
            continue;
        }
        if (arg === '--fail-on-error') {
            options.failOnError = true;
            continue;
        }
        if (arg === '--mode') {
            options.mode = argv[i + 1] || options.mode;
            i += 1;
        }
    }
    return options;
}

export async function inspectRequiredTenantSchemaColumns(connection, tenantDb) {
    const tableNames = Object.keys(REQUIRED_TENANT_SCHEMA_COLUMNS);
    const [rows] = await connection.query(
        `SELECT TABLE_NAME, COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME IN (${tableNames.map(() => '?').join(', ')})`,
        [tenantDb, ...tableNames]
    );
    const present = new Set(rows.map((row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`));
    const missingColumns = [];

    Object.entries(REQUIRED_TENANT_SCHEMA_COLUMNS).forEach(([table, columns]) => {
        Object.keys(columns).forEach((column) => {
            if (!present.has(`${table}.${column}`)) {
                missingColumns.push({ table, column });
            }
        });
    });

    return missingColumns;
}

export function buildTenantSchemaRepairSql(missingColumns = []) {
    return (Array.isArray(missingColumns) ? missingColumns : [])
        .map(({ table, column }) => ({
            table,
            column,
            sql: REQUIRED_TENANT_SCHEMA_COLUMNS?.[table]?.[column]?.sql || ''
        }))
        .filter((entry) => entry.sql);
}

export async function inspectRequiredTenantSchemaTables(connection, tenantDb) {
    const tableNames = Object.keys(REQUIRED_TENANT_SCHEMA_TABLES);
    if (tableNames.length === 0) return [];

    const [rows] = await connection.query(
        `SELECT TABLE_NAME
           FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME IN (${tableNames.map(() => '?').join(', ')})`,
        [tenantDb, ...tableNames]
    );
    const present = new Set(rows.map((row) => row.TABLE_NAME));
    // Preserve declared order — later tables have FKs pointing at earlier ones.
    return tableNames.filter((name) => !present.has(name));
}

export function buildTenantSchemaTableRepairSql(missingTables = []) {
    return (Array.isArray(missingTables) ? missingTables : [])
        .map((table) => ({ table, sql: REQUIRED_TENANT_SCHEMA_TABLES?.[table]?.sql || '' }))
        .filter((entry) => entry.sql);
}

// The canonical table registry is copied from a MySQL 8 landlord schema, where
// utf8mb4_0900_ai_ci is available. Local and some MySQL-compatible servers
// (notably MariaDB) do not expose that collation. Keep the canonical DDL
// unchanged for parity checks, but normalize only executable repair SQL to a
// supported utf8mb4 collation for the target tenant schema.
export function normalizeTenantSchemaTableRepairSql(sql, collation) {
    const normalizedSql = String(sql || '');
    const normalizedCollation = String(collation || '').trim();
    if (!normalizedSql || !normalizedCollation) return normalizedSql;
    if (!/^utf8mb4_[A-Za-z0-9_]+$/.test(normalizedCollation)) {
        throw new Error(`Invalid tenant schema repair collation: ${normalizedCollation}`);
    }
    return normalizedSql.replace(/COLLATE=utf8mb4_0900_ai_ci/g, `COLLATE=${normalizedCollation}`);
}

export async function resolveTenantSchemaRepairCollation(connection, tenantDb) {
    if (!connection?.query) throw new Error('connection is required');

    const [mysqlEightCollations] = await connection.query(
        "SHOW COLLATION WHERE Collation = 'utf8mb4_0900_ai_ci'"
    );
    if (Array.isArray(mysqlEightCollations) && mysqlEightCollations.length > 0) {
        return 'utf8mb4_0900_ai_ci';
    }

    const [schemaRows] = await connection.query(
        `SELECT DEFAULT_COLLATION_NAME
           FROM INFORMATION_SCHEMA.SCHEMATA
          WHERE SCHEMA_NAME = ?`,
        [tenantDb]
    );
    const schemaCollation = String(schemaRows?.[0]?.DEFAULT_COLLATION_NAME || '').trim();
    if (/^utf8mb4_[A-Za-z0-9_]+$/.test(schemaCollation)) {
        const [supportedSchemaCollations] = await connection.query(
            'SHOW COLLATION WHERE Collation = ?',
            [schemaCollation]
        );
        if (Array.isArray(supportedSchemaCollations) && supportedSchemaCollations.length > 0) {
            return schemaCollation;
        }
    }

    return 'utf8mb4_general_ci';
}

export async function inspectRequiredTenantSchemaIndexes(connection, tenantDb) {
    const declared = [];
    Object.entries(REQUIRED_TENANT_SCHEMA_INDEXES).forEach(([table, indexes]) => {
        Object.keys(indexes).forEach((indexName) => declared.push({ table, indexName }));
    });
    if (declared.length === 0) return [];

    const tableNames = [...new Set(declared.map((entry) => entry.table))];
    const [rows] = await connection.query(
        `SELECT TABLE_NAME, INDEX_NAME
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME IN (${tableNames.map(() => '?').join(', ')})`,
        [tenantDb, ...tableNames]
    );
    const present = new Set(rows.map((row) => `${row.TABLE_NAME}.${row.INDEX_NAME}`));
    return declared.filter(({ table, indexName }) => !present.has(`${table}.${indexName}`));
}

export function buildTenantSchemaIndexRepairSql(missingIndexes = []) {
    return (Array.isArray(missingIndexes) ? missingIndexes : [])
        .map(({ table, indexName }) => ({
            table,
            index: indexName,
            sql: REQUIRED_TENANT_SCHEMA_INDEXES?.[table]?.[indexName]?.sql || ''
        }))
        .filter((entry) => entry.sql);
}

// Only inspects seeds for tables that already exist — a table missing entirely is owned by the
// table-presence check above and will be seeded on a later pass once it exists.
export async function inspectRequiredTenantSchemaSeeds(connection, tenantDb) {
    const tableNames = Object.keys(REQUIRED_TENANT_SCHEMA_SEEDS);
    if (tableNames.length === 0) return [];

    const [existingRows] = await connection.query(
        `SELECT TABLE_NAME
           FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME IN (${tableNames.map(() => '?').join(', ')})`,
        [tenantDb, ...tableNames]
    );
    const existingTables = existingRows.map((row) => row.TABLE_NAME);
    if (existingTables.length === 0) return [];

    await connection.query(`USE \`${tenantDb.replace(/`/g, '``')}\``);
    const needsSeed = [];
    for (const table of existingTables) {
        const [countRows] = await connection.query(`SELECT COUNT(*) AS cnt FROM \`${table}\``);
        if (Number(countRows[0].cnt) === 0) {
            needsSeed.push({ table });
        }
    }
    return needsSeed;
}

export function buildTenantSchemaSeedRepairSql(missingSeeds = []) {
    return (Array.isArray(missingSeeds) ? missingSeeds : [])
        .map(({ table }) => ({ table, sql: REQUIRED_TENANT_SCHEMA_SEEDS?.[table]?.insertSql || '' }))
        .filter((entry) => entry.sql);
}

function parseEnumValuesFromColumnType(columnType) {
    const type = String(columnType || '');
    return new Set(
        [...type.matchAll(/'((?:[^']|'')*)'/g)].map((match) => match[1].replace(/''/g, "'"))
    );
}

export async function inspectRequiredTenantSchemaEnumContracts(connection, tenantDb) {
    const tableNames = Object.keys(REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS);
    if (tableNames.length === 0) return [];

    const [rows] = await connection.query(
        `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME IN (${tableNames.map(() => '?').join(', ')})`,
        [tenantDb, ...tableNames]
    );
    const columnTypeByKey = new Map(
        rows.map((row) => [`${row.TABLE_NAME}.${row.COLUMN_NAME}`, row.COLUMN_TYPE])
    );

    const missingEnumEntries = [];
    Object.entries(REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS).forEach(([table, columns]) => {
        Object.entries(columns).forEach(([column, contract]) => {
            const columnType = columnTypeByKey.get(`${table}.${column}`);
            if (columnType === undefined) return; // missing column entirely — column-presence check owns that
            const actualValues = parseEnumValuesFromColumnType(columnType);
            const missingValues = contract.enumValues.filter((value) => !actualValues.has(value));
            if (missingValues.length > 0) {
                missingEnumEntries.push({ table, column, missing_values: missingValues });
            }
        });
    });

    return missingEnumEntries;
}

export function buildTenantSchemaEnumRepairSql(missingEnumEntries = []) {
    return (Array.isArray(missingEnumEntries) ? missingEnumEntries : [])
        .map(({ table, column }) => ({
            table,
            column,
            sql: REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS?.[table]?.[column]?.sql || ''
        }))
        .filter((entry) => entry.sql);
}

async function writeReport(reportFile, payload) {
    if (!reportFile) {
        return;
    }
    await fs.mkdir(dirname(reportFile), { recursive: true });
    await fs.writeFile(reportFile, JSON.stringify(payload, null, 2), 'utf8');
}

export async function runTenantSchemaSync({ reportFile = '', failOnError = false, mode = 'report' } = {}) {
    const normalizedMode = String(mode || 'report').trim().toLowerCase();
    if (!['report', 'repair-dry-run', 'repair-apply', 'alter'].includes(normalizedMode)) {
        throw new Error(`Invalid tenant schema sync mode: ${mode}`);
    }
    assertTenantSchemaMutationModeAllowed(normalizedMode);

    console.log(`[TenantSchemaSync] starting mode=${normalizedMode}`);
    const capabilityChecksum = getTenantSchemaCapabilityChecksum();
    const report = {
        generated_at: new Date().toISOString(),
        landlord_db: MAIN_DB,
        host: DB_HOST,
        mode: normalizedMode,
        schema_capability_version: TENANT_SCHEMA_CAPABILITY_VERSION,
        schema_capability_checksum: capabilityChecksum,
        summary: {
            tenants_total: 0,
            succeeded: 0,
            failed: 0
        },
        results: []
    };

    const connection = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD
    });

    try {
        console.log(`[TenantSchemaSync] fetching active tenants from ${MAIN_DB}`);
        await connection.query(`USE ${MAIN_DB}`);
        const [tenants] = await connection.query(
            `SELECT id, name, db_name, company_token FROM tenants WHERE status = 'active'`
        );

        report.summary.tenants_total = tenants.length;
        console.log(`[TenantSchemaSync] active tenants=${tenants.length}`);

        for (const tenant of tenants) {
            const tenantSequelize = new Sequelize(tenant.db_name, DB_USER, DB_PASSWORD, {
                host: DB_HOST,
                dialect: 'mysql',
                logging: false
            });

            try {
                getTenantModels(tenantSequelize);
                if (normalizedMode === 'alter') {
                    await tenantSequelize.sync({ alter: true });
                } else {
                    await tenantSequelize.authenticate();
                    const useTenantDb = () => connection.query(`USE \`${tenant.db_name.replace(/`/g, '``')}\``);

                    // Order matters: tables before columns/indexes that might reference them (e.g.
                    // pos_transaction_discounts FKs into pos_discount_rules), columns before the
                    // index that depends on a column existing, tables before their seed rows.
                    const missingTables = await inspectRequiredTenantSchemaTables(connection, tenant.db_name);
                    const tableRepairCollation = await resolveTenantSchemaRepairCollation(
                        connection,
                        tenant.db_name
                    );
                    const tableRepairSql = buildTenantSchemaTableRepairSql(missingTables)
                        .map((repair) => ({
                            ...repair,
                            sql: normalizeTenantSchemaTableRepairSql(repair.sql, tableRepairCollation)
                        }));
                    if (normalizedMode === 'repair-apply') {
                        for (const repair of tableRepairSql) {
                            await useTenantDb();
                            await connection.query(repair.sql);
                        }
                    }

                    const missingColumns = await inspectRequiredTenantSchemaColumns(connection, tenant.db_name);
                    const columnRepairSql = buildTenantSchemaRepairSql(missingColumns);
                    if (normalizedMode === 'repair-apply') {
                        // Must precede the loop below: it adds pos_terminal_shifts.active_operator_user_id
                        // as a STORED generated column, which MySQL refuses while cashier_id's FK still
                        // carries ON UPDATE CASCADE (see relaxPosShiftCashierForeignKey for why).
                        await relaxPosShiftCashierForeignKey(connection, tenant.db_name);
                        for (const repair of columnRepairSql) {
                            await useTenantDb();
                            await connection.query(repair.sql);
                        }
                        await repairItemFolderCategoryLifecycleSchema(connection, tenant.db_name);
                        if (missingColumns.some((entry) => (
                            entry.table === 'pos_parked_sales'
                            && ['origin_cashier_id', 'origin_shift_id'].includes(entry.column)
                        ))) {
                            await repairPosParkedSaleOriginOwnership(connection, tenant.db_name);
                        }
                    }

                    const missingIndexes = await inspectRequiredTenantSchemaIndexes(connection, tenant.db_name);
                    const indexRepairSql = buildTenantSchemaIndexRepairSql(missingIndexes);
                    if (normalizedMode === 'repair-apply') {
                        for (const repair of indexRepairSql) {
                            await useTenantDb();
                            await connection.query(repair.sql);
                        }
                    }

                    const missingSeeds = await inspectRequiredTenantSchemaSeeds(connection, tenant.db_name);
                    const seedRepairSql = buildTenantSchemaSeedRepairSql(missingSeeds);
                    if (normalizedMode === 'repair-apply') {
                        for (const repair of seedRepairSql) {
                            await useTenantDb();
                            await connection.query(repair.sql);
                        }
                    }

                    const missingEnumEntries = await inspectRequiredTenantSchemaEnumContracts(connection, tenant.db_name);
                    const enumRepairSql = buildTenantSchemaEnumRepairSql(missingEnumEntries);
                    if (normalizedMode === 'repair-apply') {
                        for (const repair of enumRepairSql) {
                            await useTenantDb();
                            await connection.query(repair.sql);
                        }
                    }

                    const repairSql = [...tableRepairSql, ...columnRepairSql, ...indexRepairSql, ...seedRepairSql, ...enumRepairSql];

                    const remainingMissingTables = normalizedMode === 'repair-apply'
                        ? await inspectRequiredTenantSchemaTables(connection, tenant.db_name)
                        : missingTables;
                    const remainingMissingColumns = normalizedMode === 'repair-apply'
                        ? await inspectRequiredTenantSchemaColumns(connection, tenant.db_name)
                        : missingColumns;
                    const remainingMissingIndexes = normalizedMode === 'repair-apply'
                        ? await inspectRequiredTenantSchemaIndexes(connection, tenant.db_name)
                        : missingIndexes;
                    const remainingMissingSeeds = normalizedMode === 'repair-apply'
                        ? await inspectRequiredTenantSchemaSeeds(connection, tenant.db_name)
                        : missingSeeds;
                    const remainingMissingEnumEntries = normalizedMode === 'repair-apply'
                        ? await inspectRequiredTenantSchemaEnumContracts(connection, tenant.db_name)
                        : missingEnumEntries;

                    const hasRemainingIssues = remainingMissingTables.length > 0
                        || remainingMissingColumns.length > 0
                        || remainingMissingIndexes.length > 0
                        || remainingMissingSeeds.length > 0
                        || remainingMissingEnumEntries.length > 0;

                    if (hasRemainingIssues && normalizedMode === 'report') {
                        const messageParts = [
                            ...remainingMissingTables.map((table) => `table:${table}`),
                            ...remainingMissingColumns.map((entry) => `${entry.table}.${entry.column}`),
                            ...remainingMissingIndexes.map((entry) => `${entry.table}.${entry.indexName} (index)`),
                            ...remainingMissingSeeds.map((entry) => `${entry.table} (seed data)`),
                            ...remainingMissingEnumEntries.map((entry) => `${entry.table}.${entry.column} (missing enum values: ${entry.missing_values.join(', ')})`)
                        ];
                        const error = new Error(`Missing required tenant schema objects: ${messageParts.join(', ')}`);
                        error.missing_tables = remainingMissingTables;
                        error.missing_columns = remainingMissingColumns;
                        error.missing_indexes = remainingMissingIndexes;
                        error.missing_seeds = remainingMissingSeeds;
                        error.missing_enum_values = remainingMissingEnumEntries;
                        error.repair_sql = repairSql;
                        throw error;
                    }

                    if (hasRemainingIssues && normalizedMode === 'repair-dry-run') {
                        report.summary.failed += 1;
                        report.results.push({
                            tenant_id: tenant.id,
                            tenant_name: tenant.name,
                            tenant_db: tenant.db_name,
                            status: 'repair_required',
                            mode: normalizedMode,
                            missing_tables: remainingMissingTables,
                            missing_columns: remainingMissingColumns,
                            missing_indexes: remainingMissingIndexes,
                            missing_seeds: remainingMissingSeeds,
                            missing_enum_values: remainingMissingEnumEntries,
                            repair_sql: repairSql
                        });
                        console.warn(`[TenantSchemaSync] repair_required tenant=${tenant.db_name} missing_tables=${remainingMissingTables.join(',')} missing_columns=${remainingMissingColumns.map((entry) => `${entry.table}.${entry.column}`).join(',')}`);
                        continue;
                    }
                }
                report.summary.succeeded += 1;
                report.results.push({
                    tenant_id: tenant.id,
                    tenant_name: tenant.name,
                    tenant_db: tenant.db_name,
                    status: 'ok',
                    mode: normalizedMode,
                    schema_capability_version: TENANT_SCHEMA_CAPABILITY_VERSION,
                    schema_capability_checksum: capabilityChecksum
                });
                console.log(`[TenantSchemaSync] ok tenant=${tenant.db_name}`);
            } catch (error) {
                report.summary.failed += 1;
                const failure = createSyncFailureRecord(tenant, error);
                failure.schema_capability_version = TENANT_SCHEMA_CAPABILITY_VERSION;
                failure.schema_capability_checksum = capabilityChecksum;
                report.results.push(failure);
                console.error(
                    `[TenantSchemaSync] failed tenant=${tenant.db_name} code=${failure.error_code} fingerprint=${failure.fingerprint} message=${failure.error_message}`
                );
            } finally {
                await tenantSequelize.close();
            }
        }
    } finally {
        await connection.end();
    }

    await writeReport(reportFile, report);
    if (reportFile) {
        console.log(`[TenantSchemaSync] report_file=${reportFile}`);
    }
    console.log(
        `[TenantSchemaSync] completed total=${report.summary.tenants_total} ok=${report.summary.succeeded} failed=${report.summary.failed}`
    );
    console.log(JSON.stringify(report, null, 2));

    if (failOnError && report.summary.failed > 0) {
        process.exitCode = 1;
    }

    return report;
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
    const options = parseArgs();
    runTenantSchemaSync(options).catch((error) => {
        console.error(`[TenantSchemaSync] fatal: ${error.message}`);
        process.exit(1);
    });
}
