import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

import {
    parseCommercialPromoConfigs,
    STOREFRONT_PROMO_SETTING_KEY,
    STOREFRONT_PROMOS_SETTING_KEY
} from '../src/modules/shared/utils/commercialPromoPolicy.js';

// #695 (epic #453). Read-only per-tenant inventory of the live `storefront_promo(s)` settings JSON,
// run BEFORE the promo->voucher migration is even drafted -- Pat reviews this output first, per the
// approved implementation plan's checkpoint. This script makes NO writes anywhere: it opens a plain
// SELECT-only connection, parses each tenant's promo config through the SAME
// `parseCommercialPromoConfigs` the live checkout path uses (not a hand-rolled reimplementation, so
// the inventory can't silently drift from what the promo engine actually does), and reports every
// fidelity risk the migration would need to resolve one way or another.
//
// Mirrors sync-tenant-schemas.js's connection/env conventions (DB_HOST/DB_USER/DB_PASSWORD/DB_NAME,
// `tenants WHERE status = 'active'`) rather than inventing a new pattern.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const MAIN_DB = process.env.DB_NAME || 'sku_inventory_manager';

const VOUCHER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,39}$/;

const parseSettingValue = (rawValue, dataType) => {
    if (rawValue === null || rawValue === undefined) return null;
    if (dataType !== 'json') return rawValue;
    try {
        return JSON.parse(rawValue);
    } catch {
        return { __unparseable__: true, raw: rawValue };
    }
};

const tableExists = async (connection, dbName, tableName) => {
    const [rows] = await connection.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = ? AND table_name = ?`,
        [dbName, tableName]
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
};

async function inventoryTenant(connection, tenant) {
    const { db_name: dbName, name: tenantName, id: tenantId } = tenant;
    const findings = {
        tenant_id: tenantId,
        tenant_name: tenantName,
        db_name: dbName,
        promo_count: 0,
        legacy_single_promo_used: false,
        promos_array_used: false,
        unparseable_settings: [],
        code_format_failures: [],
        degenerate_time_window: [],
        nonzero_used_count: [],
        inactive_promos: [],
        blank_or_zero_percent_promos: [],
        duplicate_codes_within_tenant: [],
        code_collides_with_existing_voucher: [],
        channel_restricted: [],
        fulfillment_restricted: [],
        order_timing_restricted: [],
        target_item_ids_referencing_missing_items: [],
        errors: []
    };

    await connection.query(`USE \`${dbName.replace(/`/g, '``')}\``);

    const hasSystemSettings = await tableExists(connection, dbName, 'system_settings');
    if (!hasSystemSettings) {
        findings.errors.push('system_settings table does not exist for this tenant');
        return findings;
    }

    const [settingRows] = await connection.query(
        `SELECT setting_key, setting_value, data_type FROM system_settings WHERE setting_key IN (?, ?)`,
        [STOREFRONT_PROMO_SETTING_KEY, STOREFRONT_PROMOS_SETTING_KEY]
    );

    const settings = {};
    for (const row of settingRows) {
        const parsed = parseSettingValue(row.setting_value, row.data_type);
        if (parsed && typeof parsed === 'object' && parsed.__unparseable__) {
            findings.unparseable_settings.push({ setting_key: row.setting_key, raw: parsed.raw });
            continue;
        }
        settings[row.setting_key] = parsed;
        if (row.setting_key === STOREFRONT_PROMO_SETTING_KEY && parsed) findings.legacy_single_promo_used = true;
        if (row.setting_key === STOREFRONT_PROMOS_SETTING_KEY && Array.isArray(parsed) && parsed.length > 0) {
            findings.promos_array_used = true;
        }
    }

    let configs = [];
    try {
        configs = parseCommercialPromoConfigs(settings);
    } catch (error) {
        findings.errors.push(`parseCommercialPromoConfigs threw: ${error.message}`);
        return findings;
    }

    findings.promo_count = configs.length;

    const hasVouchersTable = await tableExists(connection, dbName, 'vouchers');
    let existingVoucherCodes = new Set();
    if (hasVouchersTable) {
        const [voucherRows] = await connection.query(`SELECT code FROM vouchers`);
        existingVoucherCodes = new Set(voucherRows.map((row) => String(row.code || '').toUpperCase()));
    } else {
        findings.errors.push('vouchers table does not exist for this tenant (pre-#455 tenant?)');
    }

    const hasItemsTable = await tableExists(connection, dbName, 'items');
    let existingItemIds = new Set();
    if (hasItemsTable) {
        const [itemRows] = await connection.query(`SELECT item_id FROM items`);
        existingItemIds = new Set(itemRows.map((row) => Number(row.item_id)));
    }

    const seenCodesThisTenant = new Map();

    for (const config of configs) {
        const descriptor = {
            source_key: config.sourceKey,
            source_index: config.sourceIndex,
            promo_code: config.promoCode || '(blank)',
            title: config.title
        };

        if (!config.promoCode || !VOUCHER_CODE_PATTERN.test(config.promoCode)) {
            findings.code_format_failures.push(descriptor);
        }

        if (config.validTimeStart && config.validTimeEnd && config.validTimeStart === config.validTimeEnd) {
            findings.degenerate_time_window.push({ ...descriptor, valid_time_start: config.validTimeStart, valid_time_end: config.validTimeEnd });
        }

        if (config.usedCount > 0) {
            findings.nonzero_used_count.push({ ...descriptor, used_count: config.usedCount });
        }

        if (!config.active) {
            findings.inactive_promos.push(descriptor);
        }

        if (!config.promoCode || config.discountPercent <= 0) {
            findings.blank_or_zero_percent_promos.push({ ...descriptor, discount_percent: config.discountPercent });
        }

        if (config.promoCode) {
            if (seenCodesThisTenant.has(config.promoCode)) {
                findings.duplicate_codes_within_tenant.push({
                    code: config.promoCode,
                    first: seenCodesThisTenant.get(config.promoCode),
                    duplicate: descriptor
                });
            } else {
                seenCodesThisTenant.set(config.promoCode, descriptor);
            }

            if (existingVoucherCodes.has(config.promoCode)) {
                findings.code_collides_with_existing_voucher.push(descriptor);
            }
        }

        if (config.channels && (config.channels.storefront === false || config.channels.pos === false)) {
            findings.channel_restricted.push({ ...descriptor, channels: config.channels });
        }

        if (config.fulfillmentMethods && (config.fulfillmentMethods.delivery === false || config.fulfillmentMethods.pickup === false)) {
            findings.fulfillment_restricted.push({ ...descriptor, fulfillment_methods: config.fulfillmentMethods });
        }

        if (config.orderTimings && (config.orderTimings.asap === false || config.orderTimings.scheduled === false)) {
            findings.order_timing_restricted.push({ ...descriptor, order_timing: config.orderTimings });
        }

        if (config.targetItemIds.length > 0 && hasItemsTable) {
            const missing = config.targetItemIds.filter((itemId) => !existingItemIds.has(itemId));
            if (missing.length > 0) {
                findings.target_item_ids_referencing_missing_items.push({ ...descriptor, missing_item_ids: missing });
            }
        }
    }

    return findings;
}

async function main() {
    const connection = await mysql.createConnection({ host: DB_HOST, user: DB_USER, password: DB_PASSWORD });
    const report = {
        generated_at: new Date().toISOString(),
        landlord_db: MAIN_DB,
        host: DB_HOST,
        summary: {
            tenants_total: 0,
            tenants_with_promos: 0,
            total_promo_count: 0
        },
        results: []
    };

    try {
        await connection.query(`USE \`${MAIN_DB}\``);
        const [tenants] = await connection.query(
            `SELECT id, name, db_name, company_token FROM tenants WHERE status = 'active'`
        );
        report.summary.tenants_total = tenants.length;
        console.log(`[PromoMigrationInventory] active tenants=${tenants.length}`);

        for (const tenant of tenants) {
            try {
                const findings = await inventoryTenant(connection, tenant);
                report.results.push(findings);
                if (findings.promo_count > 0) report.summary.tenants_with_promos += 1;
                report.summary.total_promo_count += findings.promo_count;
                console.log(
                    `[PromoMigrationInventory] tenant=${tenant.name} (${tenant.db_name}) `
                    + `promos=${findings.promo_count} `
                    + `format_failures=${findings.code_format_failures.length} `
                    + `degenerate_window=${findings.degenerate_time_window.length} `
                    + `nonzero_used=${findings.nonzero_used_count.length} `
                    + `collisions=${findings.code_collides_with_existing_voucher.length} `
                    + `errors=${findings.errors.length}`
                );
            } catch (error) {
                report.results.push({
                    tenant_id: tenant.id,
                    tenant_name: tenant.name,
                    db_name: tenant.db_name,
                    errors: [`inventoryTenant threw: ${error.message}`]
                });
                console.error(`[PromoMigrationInventory] tenant=${tenant.name} FAILED: ${error.message}`);
            }
        }
    } finally {
        await connection.end();
    }

    const reportFile = process.env.PROMO_INVENTORY_REPORT_FILE
        || join(__dirname, '..', '..', '..', 'do-not-commit', `promo-migration-inventory-${Date.now()}.json`);
    await fs.mkdir(dirname(reportFile), { recursive: true });
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8');
    console.log(`[PromoMigrationInventory] report written to ${reportFile}`);
    console.log(`[PromoMigrationInventory] summary: ${JSON.stringify(report.summary)}`);
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
    main().catch((error) => {
        console.error('[PromoMigrationInventory] fatal:', error);
        process.exitCode = 1;
    });
}

export { inventoryTenant, main as runPromoMigrationInventory };
