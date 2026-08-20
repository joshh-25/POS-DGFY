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
import { VOUCHER_CHANNEL_BITS, VOUCHER_FULFILLMENT_BITS, VOUCHER_ORDER_TIMING_BITS } from '../src/modules/vouchers/domain/voucherEligibilityPolicy.js';

// #695 (epic #453). Per-tenant DATA migration: transforms the live `storefront_promo(s)` settings
// JSON into real `vouchers` (+ `voucher_scopes`) rows, then deletes the settings key. This is the
// "dangerous" migration named in the approved implementation plan -- NOT a schema change (that's a
// normal apps/dgfy-migration-runner/migrations/*.cjs file), a DATA transform across every tenant DB
// plus a DELETE of a live settings key. Mirrors sync-tenant-schemas.js's own safety posture:
// dry-run by default, an explicit env-var approval gate before any write, one transaction per
// tenant (all-or-nothing, so a mid-tenant failure never leaves a promo half-migrated), and every
// generated statement is printed as literal SQL before it runs -- not just described.
//
// Reuses parseCommercialPromoConfigs -- the SAME function inventory-promo-to-voucher-migration.js
// and the live checkout path both use -- so this script's notion of "what promos exist" can't
// silently drift from either.
//
// Deliberate refinement over the originally-approved plan: channels_mask/fulfillment_methods_mask/
// order_timings_mask are DERIVED from each promo's own config (VOUCHER_CHANNEL_BITS etc.), not
// hardcoded to a flat 3. The plan's flat-3 call was made before any real inventory existed; the
// 2026-08-20 dry-run against a restored production snapshot found zero real promos with any
// per-channel/fulfillment/timing restriction, so deriving produces an IDENTICAL result to the flat
// value on every real row seen so far, while staying correct if a restricted promo turns up
// elsewhere. is_publicly_listed stays a flat `true` per the approved plan -- the promo engine always
// advertised every active promo, and there's no per-promo field to derive that from instead.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const MAIN_DB = process.env.DB_NAME || 'sku_inventory_manager';

const VOUCHER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,39}$/;
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const isExplicitlyApproved = (value) => String(value || '').trim().toLowerCase() === 'true';

// Same shape as sync-tenant-schemas.js's assertTenantSchemaMutationModeAllowed -- an apply run
// needs an operator to opt in explicitly, so a copied command can't mutate every tenant by
// accident.
function assertApplyModeAllowed(mode, environment = process.env) {
    if (mode !== 'apply') return;
    if (!isExplicitlyApproved(environment.PROMO_MIGRATION_APPLY_APPROVED)) {
        throw new Error(
            'Promo migration mode "apply" writes to every active tenant DB and deletes a live settings '
            + 'key. Set PROMO_MIGRATION_APPLY_APPROVED=true after reviewing the dry-run output.'
        );
    }
}

const parseSettingValue = (rawValue, dataType) => {
    if (rawValue === null || rawValue === undefined) return null;
    if (dataType !== 'json') return rawValue;
    try {
        return JSON.parse(rawValue);
    } catch {
        return { __unparseable__: true };
    }
};

const tableExists = async (connection, dbName, tableName) => {
    const [rows] = await connection.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = ? AND table_name = ?`,
        [dbName, tableName]
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
};

const maskFromEligibilityMap = (map, bits) => (
    Object.entries(bits).reduce((mask, [key, bit]) => (map?.[key] === false ? mask : mask | bit), 0)
);

function buildVoucherRow(config) {
    const channelsMask = maskFromEligibilityMap(config.channels, VOUCHER_CHANNEL_BITS);
    const fulfillmentMask = maskFromEligibilityMap(config.fulfillmentMethods, VOUCHER_FULFILLMENT_BITS);
    const orderTimingMask = maskFromEligibilityMap(config.orderTimings, VOUCHER_ORDER_TIMING_BITS);

    return {
        code: config.promoCode,
        voucher_kind: 'promo_code',
        title: config.title || config.promoCode,
        subtitle: String(config.raw?.subtitle || '').trim() || null,
        badge: config.badge || null,
        // parseCommercialPromoConfig does not expose validity_text as a top-level field (only
        // valid_time_start/end and valid_from/until are parsed out) -- read it from `raw` directly,
        // matching parsePublicCommercialPromos' own precedent for this exact field.
        validity_text: String(config.raw?.validity_text || '').trim() || null,
        benefit_class: 'percent_off',
        percent_off_bps: Math.max(1, Math.min(10000, Math.round(round4(config.discountPercent) * 100))),
        amount_off_centavos: null,
        fixed_unit_price_centavos: null,
        max_discount_centavos: null,
        min_spend_centavos: null,
        min_quantity: null,
        allow_below_cost: 0,
        pricelist_id: null,
        stackable_with_statutory: 0,
        valid_from: config.validFrom || null,
        valid_until: config.validUntil || null,
        valid_time_start: config.validTimeStart || null,
        valid_time_end: config.validTimeEnd || null,
        // The promo engine has no weekday concept -- every migrated voucher stays eligible every
        // day, matching observed behavior exactly (not a narrowing).
        weekday_mask: 127,
        // Derived, not flattened -- see file header.
        channels_mask: channelsMask > 0 ? channelsMask : (VOUCHER_CHANNEL_BITS.storefront | VOUCHER_CHANNEL_BITS.pos),
        is_publicly_listed: 1,
        fulfillment_methods_mask: fulfillmentMask > 0 ? fulfillmentMask : (VOUCHER_FULFILLMENT_BITS.delivery | VOUCHER_FULFILLMENT_BITS.pickup),
        order_timings_mask: orderTimingMask > 0 ? orderTimingMask : (VOUCHER_ORDER_TIMING_BITS.asap | VOUCHER_ORDER_TIMING_BITS.scheduled),
        max_redemptions: config.usageLimit || null,
        max_benefit_quantity: null,
        // Known, documented fidelity gap: this is a derived cache in the live app
        // (voucher_redemptions is the source of truth), but no historical redemption rows exist to
        // back it -- there is no way to reconstruct per-order redemption history from the promo
        // engine's settings JSON, which only ever tracked a running total.
        redeemed_count: config.usedCount || 0,
        redeemed_value_centavos: 0,
        redeemed_quantity: 0,
        conditions: null,
        status: config.active ? 'active' : 'paused',
        version: 0
    };
}

async function planTenant(connection, tenant) {
    const { db_name: dbName } = tenant;
    const plan = {
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        db_name: dbName,
        vouchers_to_create: [],
        scopes_to_create: [],
        skipped: [],
        settings_keys_to_delete: [],
        statements: []
    };

    await connection.query(`USE \`${dbName.replace(/`/g, '``')}\``);

    const hasSettings = await tableExists(connection, dbName, 'system_settings');
    const hasVouchers = await tableExists(connection, dbName, 'vouchers');
    if (!hasSettings || !hasVouchers) {
        plan.skipped.push({ reason: !hasSettings ? 'no system_settings table' : 'no vouchers table' });
        return plan;
    }

    const [settingRows] = await connection.query(
        `SELECT setting_key, setting_value, data_type FROM system_settings WHERE setting_key IN (?, ?)`,
        [STOREFRONT_PROMO_SETTING_KEY, STOREFRONT_PROMOS_SETTING_KEY]
    );
    if (settingRows.length === 0) return plan; // nothing to migrate, already clean or never configured

    const settings = {};
    for (const row of settingRows) {
        const parsed = parseSettingValue(row.setting_value, row.data_type);
        if (parsed && typeof parsed === 'object' && parsed.__unparseable__) {
            plan.skipped.push({ reason: `unparseable ${row.setting_key}` });
            continue;
        }
        settings[row.setting_key] = parsed;
        plan.settings_keys_to_delete.push(row.setting_key);
    }
    if (plan.settings_keys_to_delete.length === 0) return plan;

    const configs = parseCommercialPromoConfigs(settings);

    const [voucherRows] = await connection.query(`SELECT code FROM vouchers`);
    const existingCodes = new Set(voucherRows.map((row) => String(row.code || '').toUpperCase()));

    const hasItems = await tableExists(connection, dbName, 'items');
    let existingItemIds = new Set();
    if (hasItems) {
        const [itemRows] = await connection.query(`SELECT item_id FROM items`);
        existingItemIds = new Set(itemRows.map((row) => Number(row.item_id)));
    }

    const seenCodesThisTenant = new Set();

    for (const config of configs) {
        const descriptor = { promo_code: config.promoCode || '(blank)', title: config.title };

        if (!config.promoCode || !VOUCHER_CODE_PATTERN.test(config.promoCode)) {
            plan.skipped.push({ ...descriptor, reason: 'blank or non-conforming code' });
            continue;
        }
        if (config.discountPercent <= 0) {
            plan.skipped.push({ ...descriptor, reason: 'zero or missing discount_percent' });
            continue;
        }
        if (seenCodesThisTenant.has(config.promoCode)) {
            plan.skipped.push({ ...descriptor, reason: 'duplicate code within tenant, first occurrence already planned' });
            continue;
        }
        if (existingCodes.has(config.promoCode)) {
            plan.skipped.push({ ...descriptor, reason: 'code collides with an existing voucher, not overwritten' });
            continue;
        }

        seenCodesThisTenant.add(config.promoCode);
        const voucherRow = buildVoucherRow(config);
        plan.vouchers_to_create.push(voucherRow);

        const validTargetItemIds = config.targetItemIds.filter((itemId) => existingItemIds.has(itemId));
        const missingTargetItemIds = config.targetItemIds.filter((itemId) => !existingItemIds.has(itemId));
        if (missingTargetItemIds.length > 0) {
            plan.skipped.push({ ...descriptor, reason: `target_item_ids referencing missing items, not scoped: ${missingTargetItemIds.join(',')}` });
        }
        for (const itemId of validTargetItemIds) {
            plan.scopes_to_create.push({ code: config.promoCode, scope_type: 'item', scope_ref_id: itemId });
        }
    }

    return plan;
}

function renderStatements(connection, plan) {
    const statements = [];
    const columns = plan.vouchers_to_create.length > 0 ? Object.keys(plan.vouchers_to_create[0]) : [];
    for (const row of plan.vouchers_to_create) {
        const values = columns.map((column) => row[column]);
        const sql = `INSERT INTO vouchers (${columns.join(', ')}, created_at, updated_at) VALUES (${columns.map(() => '?').join(', ')}, NOW(), NOW())`;
        statements.push(connection.format(sql, values));
    }
    if (plan.scopes_to_create.length > 0) {
        statements.push('-- voucher_scopes rows below reference the voucher just created by code -- resolved at apply time via a subselect, shown here per-row:');
        for (const scope of plan.scopes_to_create) {
            const sql = 'INSERT INTO voucher_scopes (voucher_id, scope_type, scope_ref_id, created_at) '
                + 'SELECT voucher_id, ?, ?, NOW() FROM vouchers WHERE code = ?';
            statements.push(connection.format(sql, [scope.scope_type, scope.scope_ref_id, scope.code]));
        }
    }
    if (plan.settings_keys_to_delete.length > 0) {
        const sql = `DELETE FROM system_settings WHERE setting_key IN (${plan.settings_keys_to_delete.map(() => '?').join(', ')})`;
        statements.push(connection.format(sql, plan.settings_keys_to_delete));
    }
    return statements;
}

async function applyTenant(connection, tenant, plan) {
    if (plan.vouchers_to_create.length === 0 && plan.settings_keys_to_delete.length === 0) return;

    await connection.query(`USE \`${tenant.db_name.replace(/`/g, '``')}\``);
    await connection.beginTransaction();
    try {
        const columns = plan.vouchers_to_create.length > 0 ? Object.keys(plan.vouchers_to_create[0]) : [];
        for (const row of plan.vouchers_to_create) {
            const values = columns.map((column) => row[column]);
            await connection.query(
                `INSERT INTO vouchers (${columns.join(', ')}, created_at, updated_at) VALUES (${columns.map(() => '?').join(', ')}, NOW(), NOW())`,
                values
            );
        }
        for (const scope of plan.scopes_to_create) {
            await connection.query(
                'INSERT INTO voucher_scopes (voucher_id, scope_type, scope_ref_id, created_at) '
                + 'SELECT voucher_id, ?, ?, NOW() FROM vouchers WHERE code = ?',
                [scope.scope_type, scope.scope_ref_id, scope.code]
            );
        }
        if (plan.settings_keys_to_delete.length > 0) {
            await connection.query(
                `DELETE FROM system_settings WHERE setting_key IN (${plan.settings_keys_to_delete.map(() => '?').join(', ')})`,
                plan.settings_keys_to_delete
            );
        }
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    }
}

async function main() {
    const mode = String(process.argv[2] || process.env.PROMO_MIGRATION_MODE || 'dry-run').trim();
    if (!['dry-run', 'apply'].includes(mode)) {
        throw new Error(`Invalid mode "${mode}". Use "dry-run" or "apply".`);
    }
    assertApplyModeAllowed(mode);

    const onlyDbName = process.env.PROMO_MIGRATION_ONLY_TENANT_DB || '';
    const connection = await mysql.createConnection({ host: DB_HOST, user: DB_USER, password: DB_PASSWORD });
    const report = {
        generated_at: new Date().toISOString(),
        mode,
        summary: { tenants_total: 0, tenants_migrated: 0, vouchers_created: 0, scopes_created: 0, skipped: 0 },
        results: []
    };

    try {
        await connection.query(`USE \`${MAIN_DB}\``);
        let [tenants] = await connection.query(`SELECT id, name, db_name FROM tenants WHERE status = 'active'`);
        if (onlyDbName) tenants = tenants.filter((tenant) => tenant.db_name === onlyDbName);
        report.summary.tenants_total = tenants.length;
        console.log(`[PromoToVoucherMigration] mode=${mode} tenants=${tenants.length}`);

        for (const tenant of tenants) {
            const plan = await planTenant(connection, tenant);
            const statements = renderStatements(connection, plan);
            const entry = {
                tenant_name: tenant.name,
                db_name: tenant.db_name,
                vouchers_to_create: plan.vouchers_to_create.map((row) => row.code),
                scopes_to_create: plan.scopes_to_create.length,
                skipped: plan.skipped,
                statements
            };
            report.results.push(entry);

            if (plan.vouchers_to_create.length > 0 || plan.settings_keys_to_delete.length > 0) {
                console.log(`\n[PromoToVoucherMigration] tenant=${tenant.name} (${tenant.db_name})`);
                for (const statement of statements) console.log(`  ${statement}`);
            }

            if (mode === 'apply' && (plan.vouchers_to_create.length > 0 || plan.settings_keys_to_delete.length > 0)) {
                await applyTenant(connection, tenant, plan);
                report.summary.tenants_migrated += 1;
                report.summary.vouchers_created += plan.vouchers_to_create.length;
                report.summary.scopes_created += plan.scopes_to_create.length;
                console.log(`  -> applied.`);
            }
            report.summary.skipped += plan.skipped.length;
        }
    } finally {
        await connection.end();
    }

    const reportFile = process.env.PROMO_MIGRATION_REPORT_FILE
        || join(__dirname, '..', '..', '..', 'do-not-commit', `promo-to-voucher-migration-${mode}-${Date.now()}.json`);
    await fs.mkdir(dirname(reportFile), { recursive: true });
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n[PromoToVoucherMigration] report written to ${reportFile}`);
    console.log(`[PromoToVoucherMigration] summary: ${JSON.stringify(report.summary)}`);
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
    main().catch((error) => {
        console.error('[PromoToVoucherMigration] fatal:', error);
        process.exitCode = 1;
    });
}

export { planTenant, buildVoucherRow, main as runPromoToVoucherMigration };
