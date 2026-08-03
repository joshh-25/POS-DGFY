/**
 * Item Image Generation Status Store
 *
 * A single JSON value per (tenant, item) in Redis, tracking the lifecycle of
 * the most recent AI image generation task for that item — queued ->
 * processing -> completed|failed. This is the piece that was missing before:
 * itemImageWorker.js used to only `logger.error(...)` a failed generation or
 * attach step and move on, with nothing a client could ever read back. That
 * made a failed generation indistinguishable from a slow one, forever.
 *
 * Deliberately its own small file, not a full repository like
 * menuImportJobRepository.js — there's no per-file breakdown to track here,
 * just one record per item, so a repository's job-creation/queueing
 * responsibilities would be pure overhead. Follows that module's convention
 * of talking to the raw Redis client directly (not cacheService.js, whose
 * get/set implicitly tenant-scope keys off the current dbStore AsyncLocalStorage
 * context — this store is written both inside and outside that context within
 * a single task, so an explicit tenantId param is more correct here than an
 * implicit one).
 */

import { getRedisClient, isRedisConnected } from '../config/redis.js';
import logger from '../config/logger.js';

// Comfortably longer than the frontend's poll ceiling (90s as of this
// writing) so a client that tabs away and back shortly after still finds the
// record, without lingering in Redis indefinitely.
const STATUS_TTL_SECONDS = 900;

const statusKey = (tenantId, itemId) => `item_image:status:${tenantId}:${itemId}`;

/**
 * Never throws — status tracking sits on top of the core generation queue,
 * so a Redis hiccup here must never break enqueueing or generation itself
 * (same principle as itemImageWorker.js's own logImageUsage best-effort write).
 * @param {string} tenantId
 * @param {number} itemId
 * @param {Object} params
 * @param {'queued'|'processing'|'completed'|'failed'} params.status
 * @param {string|null} [params.error_code]
 * @param {string|null} [params.error_message]
 */
export const setItemImageStatus = async (tenantId, itemId, { status, error_code = null, error_message = null }) => {
    if (!isRedisConnected()) return;
    try {
        const record = { status, error_code, error_message, updated_at: new Date().toISOString() };
        await getRedisClient().setEx(statusKey(tenantId, itemId), STATUS_TTL_SECONDS, JSON.stringify(record));
    } catch (error) {
        logger.warn('[ItemImageStatusStore] Failed to write status', {
            tenantId,
            itemId,
            status,
            reason: error?.message
        });
    }
};

/**
 * @param {string} tenantId
 * @param {number} itemId
 * @returns {Promise<{status: string, error_code: string|null, error_message: string|null, updated_at: string}|null>}
 *   null when no record exists (never queued, or the TTL expired) or Redis is unavailable.
 */
export const getItemImageStatus = async (tenantId, itemId) => {
    if (!isRedisConnected()) return null;
    try {
        const raw = await getRedisClient().get(statusKey(tenantId, itemId));
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        logger.warn('[ItemImageStatusStore] Failed to read status', {
            tenantId,
            itemId,
            reason: error?.message
        });
        return null;
    }
};
