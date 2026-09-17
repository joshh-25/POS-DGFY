import crypto from 'crypto';
import logger from '../../../config/logger.js';
import { getRedisClient, isRedisConnected } from '../../../config/redis.js';
import { geocodeConfig } from '../../../config/geocodeConfig.js';
import { quadruperGeocodeProvider } from './quadruperGeocodeProvider.js';

const IMPORT_DATE_REFRESH_MS = 5 * 60 * 1000;
const UNKNOWN_IMPORT_DATE = 'unknown';

let cachedImportDate = null;
let cachedImportDateAt = 0;

/**
 * The index rebuilds weekly and a given osm_id's coordinates can move between rebuilds, so
 * every cache key embeds import_date. A rebuild therefore invalidates the whole namespace
 * without an explicit purge.
 */
export const resolveImportDate = async () => {
    if (cachedImportDate && Date.now() - cachedImportDateAt < IMPORT_DATE_REFRESH_MS) {
        return cachedImportDate;
    }

    try {
        const status = await quadruperGeocodeProvider.getStatus();
        cachedImportDate = String(status?.import_date || UNKNOWN_IMPORT_DATE);
    } catch (error) {
        logger.warn('[Geocode] Failed to resolve import date', { err: error?.message });
        cachedImportDate = cachedImportDate || UNKNOWN_IMPORT_DATE;
    }
    cachedImportDateAt = Date.now();
    return cachedImportDate;
};

export const buildReverseCacheKey = (importDate, latitude, longitude) => (
    `geo:rev:${importDate}:${Number(latitude).toFixed(5)}:${Number(longitude).toFixed(5)}`
);

export const buildForwardCacheKey = (importDate, query, limit, biasLatitude, biasLongitude) => {
    const normalized = String(query || '').trim().toLowerCase();
    const hash = crypto.createHash('sha1').update(normalized).digest('hex');
    const biasCell = Number.isFinite(Number(biasLatitude)) && Number.isFinite(Number(biasLongitude))
        ? `${(Math.floor(Number(biasLatitude) / 0.01) * 0.01).toFixed(2)}:${(Math.floor(Number(biasLongitude) / 0.01) * 0.01).toFixed(2)}`
        : 'nobias';
    return `geo:fwd:${importDate}:${hash}:${biasCell}:${limit}`;
};

const cacheEnabled = () => geocodeConfig.enabled && isRedisConnected();

export const readCache = async (key) => {
    if (!cacheEnabled()) return null;
    try {
        const cached = await getRedisClient().get(key);
        return cached ? JSON.parse(cached) : null;
    } catch (error) {
        logger.warn('[Geocode] Redis cache read failed', { err: error?.message });
        return null;
    }
};

export const writeCache = async (key, value) => {
    if (!cacheEnabled()) return;
    try {
        await getRedisClient().setEx(key, geocodeConfig.cacheTtlSeconds, JSON.stringify(value));
    } catch (error) {
        logger.warn('[Geocode] Redis cache write failed', { err: error?.message });
    }
};

export const __testing = {
    resetImportDateCache: () => {
        cachedImportDate = null;
        cachedImportDateAt = 0;
    }
};
