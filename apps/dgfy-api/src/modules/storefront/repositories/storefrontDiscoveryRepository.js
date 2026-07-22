import { QueryTypes } from 'sequelize';
import { createHash } from 'crypto';

// StorefrontDiscoveryRepository — Clean Architecture data access adapter for
// the PUBLIC storefront discovery surface (STF-01/STF-02). Reads the
// LANDLORD (dgfy_core) `storefront_discovery_index` projection built in
// 10-01-PLAN.md via raw parameterized SQL (V5 — every user-controlled value
// is a bound replacement, never string-interpolated), mirroring the legacy
// pattern in backend/src/modules/geoSearch/repositories/geoSearchRepository.js
// (read-only reference, not imported).
//
// Unlike ../../products/repositories/productRepository.js (tenant-scoped,
// resolved via TenantConnector), this repository targets the single shared
// landlord connection (apps/dgfy-api/src/config/db.js) directly — there is
// no per-tenant discovery data, the index itself IS the cross-tenant public
// projection.
//
// `sequelize` and `getRedisClient` are constructor-injected (Dependency
// Inversion) rather than imported directly, so unit tests can exercise the
// query-building/cache logic against a mocked sequelize.query and a fake
// Redis client without a live MySQL/Redis connection.

const DEFAULT_CACHE_TTL_SECONDS = Math.max(
    10,
    Number.parseInt(
        process.env.STOREFRONT_DISCOVERY_REDIS_CACHE_TTL_SECONDS || process.env.GEO_SEARCH_REDIS_CACHE_TTL_SECONDS || '90',
        10
    ) || 90
);

const isTruthyFlag = (raw) => {
    const value = String(raw || '').trim().toLowerCase();
    return value === 'true' || value === '1' || value === 'on';
};

// Cache is enabled if EITHER the storefront-specific flag or the shared
// legacy geo-search flag is set (plan Task 1: "GEO_SEARCH_REDIS_CACHE_ENABLED
// /STOREFRONT_DISCOVERY_REDIS_CACHE_ENABLED"), and never in test env unless
// explicitly forced on.
const isCacheEnabledByEnv = () => {
    if (process.env.NODE_ENV === 'test') {
        return isTruthyFlag(process.env.STOREFRONT_DISCOVERY_REDIS_CACHE_ENABLED)
            || isTruthyFlag(process.env.GEO_SEARCH_REDIS_CACHE_ENABLED);
    }
    return isTruthyFlag(process.env.STOREFRONT_DISCOVERY_REDIS_CACHE_ENABLED)
        || isTruthyFlag(process.env.GEO_SEARCH_REDIS_CACHE_ENABLED);
};

// Snap lat/lng to ~1.1km grid cells for cache bucketing (mirrors legacy
// geoSearchRepository.js's geoKey()) — nearby searches share a cache entry.
const geoKey = (lat, lng) => `${(Math.round(lat * 100) / 100).toFixed(2)}:${(Math.round(lng * 100) / 100).toFixed(2)}`;

// Sanitizes a raw search string for MySQL FULLTEXT BOOLEAN MODE: strips
// operator characters that would otherwise throw a syntax error or let a
// caller inject unintended boolean operators (mirrors the legacy repo's
// findMatchingItemIds() sanitization).
const sanitizeBooleanModeQuery = (query) => String(query || '')
    .replace(/[+\-><()~*"@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export class StorefrontDiscoveryRepository {
    /**
     * @param {{sequelize: Object, getRedisClient?: () => (Object|null), cacheTtlSeconds?: number, cacheEnabled?: boolean}} deps
     */
    constructor({ sequelize, getRedisClient = () => null, cacheTtlSeconds = DEFAULT_CACHE_TTL_SECONDS, cacheEnabled } = {}) {
        if (!sequelize) {
            throw new Error('StorefrontDiscoveryRepository requires a sequelize instance.');
        }
        this.sequelize = sequelize;
        this.getRedisClient = typeof getRedisClient === 'function' ? getRedisClient : () => null;
        this.cacheTtlSeconds = cacheTtlSeconds;
        this.cacheEnabled = cacheEnabled !== undefined ? Boolean(cacheEnabled) : isCacheEnabledByEnv();
    }

    buildCacheKey({ lat, lng, radiusKm, query, category, openNow, limit, offset }) {
        const normalizedQuery = String(query || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const hash = createHash('sha1').update(normalizedQuery).digest('hex').slice(0, 8);
        return `storefront:discovery:${geoKey(lat, lng)}:r${radiusKm}:${category || '_'}:${openNow ? 1 : 0}:${hash}:${limit}:${offset}`;
    }

    /**
     * Cache reads/writes NEVER throw — any Redis error or disabled/missing
     * client falls through to the direct DB query (plan Task 1: "on cache
     * miss OR any Redis error, fall back to the direct DB query").
     */
    async readCache(key) {
        if (!this.cacheEnabled) return null;
        try {
            const client = this.getRedisClient();
            if (!client) return null;
            const cached = await client.get(key);
            return cached ? JSON.parse(cached) : null;
        } catch {
            return null;
        }
    }

    async writeCache(key, value) {
        if (!this.cacheEnabled) return;
        try {
            const client = this.getRedisClient();
            if (!client) return;
            await client.setEx(key, this.cacheTtlSeconds, JSON.stringify(value));
        } catch {
            // Best-effort cache write only; never fail the request.
        }
    }

    /**
     * Distance-ranked, visibility-filtered discovery search over
     * `storefront_discovery_index`'s GENERATED latitude/longitude/search_text
     * columns (10-01-PLAN.md). Every user-controlled value is a bound
     * parameter (V5) — category/openNow read denormalized JSON keys on the
     * `search_snapshot`/`location_snapshot` columns; those keys are
     * populated by the discovery projection syncer (later plan) — this
     * query is wired and correct today, it simply returns no rows filtered
     * by those keys until the syncer starts populating them.
     *
     * @param {{lat:number, lng:number, radiusKm:number, query?:string|null, category?:string|null, openNow?:boolean, limit?:number, offset?:number}} params
     * @returns {Promise<Array<Object>>}
     */
    async searchNearby({ lat, lng, radiusKm, query = null, category = null, openNow = false, limit = 20, offset = 0 }) {
        const cacheKey = this.buildCacheKey({ lat, lng, radiusKm, query, category, openNow, limit, offset });
        const cached = await this.readCache(cacheKey);
        if (cached) return cached;

        const replacements = { lat, lng, radiusKm, limit, offset };
        const clauses = [
            'is_visible = 1',
            'latitude IS NOT NULL',
            'longitude IS NOT NULL',
            'ST_Distance_Sphere(POINT(longitude, latitude), POINT(:lng, :lat)) / 1000 <= :radiusKm'
        ];

        const safeQuery = query ? sanitizeBooleanModeQuery(query) : '';
        if (safeQuery) {
            clauses.push('MATCH(search_text) AGAINST(:q IN BOOLEAN MODE)');
            replacements.q = safeQuery;
        }

        if (category) {
            clauses.push("JSON_UNQUOTE(JSON_EXTRACT(search_snapshot, '$.category')) = :category");
            replacements.category = category;
        }

        if (openNow) {
            clauses.push("JSON_EXTRACT(location_snapshot, '$.open_now') = true");
        }

        const sql = `
            SELECT
                handle,
                display_name,
                business_id,
                is_visible,
                latitude,
                longitude,
                ST_Distance_Sphere(POINT(longitude, latitude), POINT(:lng, :lat)) / 1000 AS distance_km
            FROM storefront_discovery_index
            WHERE ${clauses.join(' AND ')}
            ORDER BY distance_km ASC
            LIMIT :limit OFFSET :offset
        `;

        const rows = await this.sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

        await this.writeCache(cacheKey, rows);
        return rows;
    }

    /**
     * Returns the visible discovery row for a store handle, or null (used
     * by getStorePageUseCases.js to 404 unknown/invisible handles).
     * @param {string} handle
     */
    async getStoreByHandle(handle) {
        if (!handle) return null;
        const rows = await this.sequelize.query(
            `SELECT id, business_id, handle, display_name, is_visible, latitude, longitude
             FROM storefront_discovery_index
             WHERE handle = :handle AND is_visible = 1
             LIMIT 1`,
            { replacements: { handle }, type: QueryTypes.SELECT }
        );
        return rows[0] || null;
    }
}

/**
 * @param {{sequelize: Object, getRedisClient?: Function, cacheTtlSeconds?: number, cacheEnabled?: boolean}} [deps]
 * @returns {StorefrontDiscoveryRepository}
 */
export const buildStorefrontDiscoveryRepository = (deps) => new StorefrontDiscoveryRepository(deps);

export default StorefrontDiscoveryRepository;
