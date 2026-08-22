import { getRedisClient, isRedisConnected } from '../config/redis.js';

const STATUS_TTL_SECONDS = 900;
const MEMORY_TTL_MS = STATUS_TTL_SECONDS * 1000;
const memoryStatuses = new Map();

const statusKey = (tenantId, itemId) => `catalog_image_upload:status:${tenantId}:${itemId}`;

const normalizeStatus = ({ tenantId, itemId, jobId, status, error_code = null, error_message = null }) => ({
    tenant_id: tenantId,
    item_id: Number(itemId),
    job_id: jobId || null,
    status,
    error_code,
    error_message,
    updated_at: new Date().toISOString()
});

const pruneMemory = () => {
    const cutoff = Date.now() - MEMORY_TTL_MS;
    memoryStatuses.forEach((record, key) => {
        if (Date.parse(record.updated_at) < cutoff) memoryStatuses.delete(key);
    });
};

export const setCatalogImageUploadStatus = async (params) => {
    const record = normalizeStatus(params);
    const key = statusKey(record.tenant_id, record.item_id);
    memoryStatuses.set(key, record);
    pruneMemory();

    if (!isRedisConnected()) return record;

    try {
        await getRedisClient().setEx(key, STATUS_TTL_SECONDS, JSON.stringify(record));
    } catch {
        // The in-process copy keeps local WebView development usable when Redis
        // is intentionally disabled. Production deployments still use Redis
        // as the cross-process status store.
    }
    return record;
};

export const getCatalogImageUploadStatus = async (tenantId, itemId) => {
    const key = statusKey(tenantId, itemId);
    if (isRedisConnected()) {
        try {
            const raw = await getRedisClient().get(key);
            if (raw) return JSON.parse(raw);
        } catch {
            // Fall through to the short-lived local copy.
        }
    }

    const record = memoryStatuses.get(key);
    if (!record) return null;
    if (Date.parse(record.updated_at) < Date.now() - MEMORY_TTL_MS) {
        memoryStatuses.delete(key);
        return null;
    }
    return record;
};

export const clearCatalogImageUploadStatuses = () => memoryStatuses.clear();

export default {
    setCatalogImageUploadStatus,
    getCatalogImageUploadStatus,
    clearCatalogImageUploadStatuses
};
