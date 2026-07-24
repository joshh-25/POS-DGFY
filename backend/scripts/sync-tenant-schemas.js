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
        })
    }),
    pos_transaction_lines: Object.freeze({
        stock_effect_type: Object.freeze({
            sql: "ALTER TABLE `pos_transaction_lines` ADD COLUMN `stock_effect_type` ENUM('inventory_issue','stock_exempt') NOT NULL DEFAULT 'inventory_issue' COMMENT 'Immutable checkout-time stock-effect classification'"
        }),
        stock_exempt_reason: Object.freeze({
            sql: "ALTER TABLE `pos_transaction_lines` ADD COLUMN `stock_exempt_reason` VARCHAR(80) NULL COMMENT 'Immutable reason when a POS sale line intentionally creates no inventory movement'"
        })
    }),
    items: Object.freeze({
        senior_pwd_discount_eligible: Object.freeze({
            sql: "ALTER TABLE `items` ADD COLUMN `senior_pwd_discount_eligible` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Admin-controlled eligibility for statutory Senior Citizen/PWD discounts'"
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
        })
    }),
    pos_terminal_shifts: Object.freeze({
        active_terminal_id: Object.freeze({
            sql: "ALTER TABLE `pos_terminal_shifts` ADD COLUMN `active_terminal_id` VARCHAR(100) GENERATED ALWAYS AS (CASE WHEN `status` = 'open' THEN UPPER(TRIM(`terminal_id`)) ELSE NULL END) STORED"
        })
    }),
    pos_transaction_discounts: Object.freeze({
        promo_code: Object.freeze({
            sql: "ALTER TABLE `pos_transaction_discounts` ADD COLUMN `promo_code` VARCHAR(40) NULL COMMENT 'Commercial promo code validated by the server at checkout'"
        })
    })
});

// Whole tables that a migration created but that never got backfilled onto pre-existing tenant
// schemas (only the landlord DB and tenants provisioned after the migration have them). DDL is
// copied verbatim from `SHOW CREATE TABLE` against the landlord DB so tenant clones match exactly
// (column types, defaults, keys, FK constraints) — declaration order matters, since later tables
// have foreign keys pointing at earlier ones.
export const REQUIRED_TENANT_SCHEMA_TABLES = Object.freeze({
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
    delivery_jobs: Object.freeze({
        sql: "CREATE TABLE `delivery_jobs` (\n"
            + "  `delivery_job_id` int NOT NULL AUTO_INCREMENT,\n"
            + "  `pos_transaction_id` int NOT NULL,\n"
            + "  `location_id` int DEFAULT NULL,\n"
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
        })
    }),
    pos_transaction_discounts: Object.freeze({
        idx_pos_transaction_discounts_promo_code: Object.freeze({
            sql: "ALTER TABLE `pos_transaction_discounts` ADD INDEX `idx_pos_transaction_discounts_promo_code` (`promo_code`)"
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
    })
});

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
    const report = {
        generated_at: new Date().toISOString(),
        landlord_db: MAIN_DB,
        host: DB_HOST,
        mode: normalizedMode,
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
                    const tableRepairSql = buildTenantSchemaTableRepairSql(missingTables);
                    if (normalizedMode === 'repair-apply') {
                        for (const repair of tableRepairSql) {
                            await useTenantDb();
                            await connection.query(repair.sql);
                        }
                    }

                    const missingColumns = await inspectRequiredTenantSchemaColumns(connection, tenant.db_name);
                    const columnRepairSql = buildTenantSchemaRepairSql(missingColumns);
                    if (normalizedMode === 'repair-apply') {
                        for (const repair of columnRepairSql) {
                            await useTenantDb();
                            await connection.query(repair.sql);
                        }
                        await repairItemFolderCategoryLifecycleSchema(connection, tenant.db_name);
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
                    mode: normalizedMode
                });
                console.log(`[TenantSchemaSync] ok tenant=${tenant.db_name}`);
            } catch (error) {
                report.summary.failed += 1;
                const failure = createSyncFailureRecord(tenant, error);
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
