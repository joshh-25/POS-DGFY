/**
 * Geo Inventory Ingestion Worker
 *
 * Drains the Redis list `geo:inventory:queue` populated by the store inventory-push
 * endpoint. For each payload it:
 *   1. Normalises submitted item names.
 *   2. Resolves each name to a canonical geo_items row via geo_item_aliases (approved)
 *      or a direct normalized_name match — creating a new item + pending alias when
 *      neither is found (alias auto-creation with moderation flag per the proposal).
 *   3. Upserts into geo_store_items.
 *
 * Queue mechanics: RPOP (simple FIFO drain) with bounded per-tick batch size.
 * No BullMQ dependency — uses the existing Redis client already present in the stack.
 */

import { QueryTypes } from 'sequelize';
import sequelize from '../config/database.js';
import { getRedisClient, isRedisConnected } from '../config/redis.js';
import logger from '../config/logger.js';

const QUEUE_KEY = 'geo:inventory:queue';
const BATCH_SIZE = 10;          // items processed per tick
const POLL_INTERVAL_MS = 500;   // tick when queue likely has items
const IDLE_INTERVAL_MS = 5000;  // tick when queue was empty last round

let _timer = null;
let _running = false;

// ── Name normalisation ────────────────────────────────────────────────────────
const normaliseName = (name) =>
    String(name || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s-]/g, '');

// ── Alias resolution ──────────────────────────────────────────────────────────
// Returns geo_item_id for the name, creating records as needed.
export const resolveItemId = async (rawName, tenantId) => {
    const normalized = normaliseName(rawName);
    if (!normalized) return null;

    // 1. Check approved aliases
    const [aliasRow] = await sequelize.query(
        `SELECT item_id FROM geo_item_aliases
         WHERE alias_name = :alias AND moderation_status = 'approved'
         LIMIT 1`,
        { replacements: { alias: normalized }, type: QueryTypes.SELECT }
    );
    if (aliasRow) return aliasRow.item_id;

    // 2. Check canonical item by normalized_name
    const [itemRow] = await sequelize.query(
        'SELECT geo_item_id FROM geo_items WHERE normalized_name = :normalized LIMIT 1',
        { replacements: { normalized }, type: QueryTypes.SELECT }
    );
    if (itemRow) return itemRow.geo_item_id;

    // 3. Create a new canonical item + pending alias for curator review.
    //    Use a transaction so both rows land atomically or not at all.
    const t = await sequelize.transaction();
    try {
        const [{ insertId: newItemId }] = await sequelize.query(
            'INSERT INTO geo_items (name, normalized_name, created_at, updated_at) VALUES (:name, :normalized, NOW(), NOW())',
            { replacements: { name: rawName.trim().slice(0, 255), normalized }, transaction: t, type: QueryTypes.INSERT }
        );

        await sequelize.query(
            `INSERT INTO geo_item_aliases (item_id, alias_name, tenant_id, moderation_status, created_at, updated_at)
             VALUES (:itemId, :alias, :tenantId, 'pending', NOW(), NOW())`,
            {
                replacements: { itemId: newItemId, alias: normalized, tenantId: tenantId || null },
                transaction: t,
                type: QueryTypes.INSERT
            }
        );

        await t.commit();
        return newItemId;
    } catch (err) {
        await t.rollback();
        throw err;
    }
};

// ── Upsert into geo_store_items ───────────────────────────────────────────────
export const upsertStoreItem = async ({ tenantId, locationId, itemId, skuCode, price, quantity, inStock, storefrontVisible }) => {
    await sequelize.query(
        `INSERT INTO geo_store_items
           (tenant_id, location_id, item_id, sku_code, price, quantity, in_stock, storefront_visible, last_updated_at, created_at, updated_at)
         VALUES
           (:tenantId, :locationId, :itemId, :skuCode, :price, :quantity, :inStock, :storefrontVisible, NOW(), NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           sku_code           = VALUES(sku_code),
           price              = VALUES(price),
           quantity           = VALUES(quantity),
           in_stock           = VALUES(in_stock),
           storefront_visible = VALUES(storefront_visible),
           last_updated_at    = NOW(),
           updated_at         = NOW()`,
        {
            replacements: {
                tenantId,
                locationId: locationId ?? null,
                itemId,
                skuCode: skuCode || null,
                price: price ?? null,
                quantity: quantity ?? 0,
                inStock: inStock ? 1 : 0,
                storefrontVisible: storefrontVisible !== false ? 1 : 0
            },
            type: QueryTypes.INSERT
        }
    );
};

// ── Process one queued payload ────────────────────────────────────────────────
const processPayload = async (raw) => {
    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        logger.warn('[GeoInventoryWorker] Discarding unparseable queue entry');
        return;
    }

    const { tenant_id: tenantId, location_id: locationId, items } = payload;
    if (!tenantId || !Array.isArray(items) || items.length === 0) return;

    for (const item of items) {
        try {
            const itemId = await resolveItemId(item.name, tenantId);
            if (!itemId) continue;
            await upsertStoreItem({
                tenantId,
                locationId: locationId ?? null,
                itemId,
                skuCode: item.sku_code || null,
                price: item.price ?? null,
                quantity: item.quantity ?? 0,
                inStock: item.in_stock !== false,
                storefrontVisible: item.storefront_visible !== false
            });
        } catch (err) {
            logger.error('[GeoInventoryWorker] Failed to process item', {
                tenantId,
                itemName: item?.name,
                err: err?.message
            });
        }
    }
};

// ── Poll loop ─────────────────────────────────────────────────────────────────
const tick = async () => {
    if (!isRedisConnected()) {
        _timer = setTimeout(tick, IDLE_INTERVAL_MS);
        return;
    }

    let processed = 0;
    try {
        const redis = getRedisClient();
        for (let i = 0; i < BATCH_SIZE; i++) {
            const entry = await redis.rPop(QUEUE_KEY);
            if (!entry) break;
            await processPayload(entry);
            processed++;
        }
    } catch (err) {
        logger.error('[GeoInventoryWorker] Tick error', { err: err?.message });
    }

    _timer = setTimeout(tick, processed > 0 ? POLL_INTERVAL_MS : IDLE_INTERVAL_MS);
};

// ── Public API ────────────────────────────────────────────────────────────────
export const startGeoInventoryWorker = () => {
    if (_running) return;
    _running = true;
    logger.info('[GeoInventoryWorker] Started');
    _timer = setTimeout(tick, POLL_INTERVAL_MS);
};

export const stopGeoInventoryWorker = () => {
    if (_timer) clearTimeout(_timer);
    _running = false;
    logger.info('[GeoInventoryWorker] Stopped');
};

// ── Queue helper used by the push endpoint ────────────────────────────────────
export const enqueueInventoryPush = async (payload) => {
    if (!isRedisConnected()) {
        throw new Error('Redis unavailable — cannot enqueue inventory push');
    }
    await getRedisClient().lPush(QUEUE_KEY, JSON.stringify(payload));
};
