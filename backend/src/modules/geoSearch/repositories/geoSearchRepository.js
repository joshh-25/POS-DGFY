import { QueryTypes } from 'sequelize';
import sequelize from '../../../config/database.js';
import { getRedisClient, isRedisConnected } from '../../../config/redis.js';
import { createHash } from 'crypto';
import logger from '../../../config/logger.js';

// ── Cache config ─────────────────────────────────────────────────────────────
// 90s satisfies the proposal's 60-120s range while staying within the 5-min
// Anthropic prompt-cache window for low-frequency searches.
const GEO_SEARCH_CACHE_TTL_SECONDS = Math.max(
    10,
    Number.parseInt(process.env.GEO_SEARCH_REDIS_CACHE_TTL_SECONDS || '90', 10) || 90
);
const GEO_SEARCH_CACHE_ENABLED = (() => {
    const raw = String(process.env.GEO_SEARCH_REDIS_CACHE_ENABLED || '').trim().toLowerCase();
    if (raw === 'false' || raw === '0' || raw === 'off') return false;
    return process.env.NODE_ENV !== 'test';
})();

// Snap lat/lng to ~1.1km grid cells for cache bucketing.
// 0.01° ≈ 1.11km latitude; ≈ 1.09km longitude at ~11°N (Philippines).
const geoKey = (lat, lng) =>
    `${(Math.round(lat * 100) / 100).toFixed(2)}:${(Math.round(lng * 100) / 100).toFixed(2)}`;

const buildCacheKey = (query, lat, lng, radius, stockFilter) => {
    const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
    const hash = createHash('sha1').update(normalized).digest('hex').slice(0, 8);
    return `geo:search:${geoKey(lat, lng)}:r${radius}:${stockFilter}:${hash}`;
};

// ── FULLTEXT item lookup ──────────────────────────────────────────────────────
// Two-step approach: (1) resolve matching item IDs via FULLTEXT, then (2) join
// with geo_store_items + storefront_discovery_index for the spatial distance step.
// This avoids a three-way join with a potentially expensive OR subquery at scale.
const findMatchingItemIds = async (query) => {
    // Sanitize query for MySQL boolean FULLTEXT: strip operators that could cause syntax errors.
    const safeQuery = query.replace(/[+\-><()~*"@]/g, ' ').trim();
    if (!safeQuery) return [];

    const rows = await sequelize.query(
        `SELECT geo_item_id AS id
         FROM geo_items
         WHERE MATCH(name, normalized_name) AGAINST(:q IN BOOLEAN MODE)
         UNION
         SELECT gia.item_id AS id
         FROM geo_item_aliases gia
         WHERE MATCH(gia.alias_name) AGAINST(:q IN BOOLEAN MODE)
           AND gia.moderation_status = 'approved'
         LIMIT 200`,
        { replacements: { q: safeQuery }, type: QueryTypes.SELECT }
    );

    return [...new Set(rows.map((r) => r.id))];
};

// ── Main geo-search query ─────────────────────────────────────────────────────
// Uses ST_Distance_Sphere on the DECIMAL lat/lng columns already present in
// storefront_discovery_index. The composite index (latitude, longitude) narrows
// the scan; exact distance is computed only on the surviving rows.
// Note: MySQL POINT(x, y) follows (longitude, latitude) order for SRID 4326.
const runGeoQuery = async ({ itemIds, userLat, userLng, radiusKm, stockFilter, limit, offset }) => {
    const stockClause = stockFilter === 'in_stock_only' ? 'AND gsi.in_stock = 1' : '';

    const [rows, countRows] = await Promise.all([
        sequelize.query(
            `SELECT
               sdi.tenant_id,
               sdi.slug,
               sdi.tenant_name,
               sdi.tenant_company_token,
               sdi.latitude,
               sdi.longitude,
               sdi.location_id,
               sdi.location_name,
               sdi.address_line,
               sdi.storefront_open,
               sdi.workflow_mode,
               sdi.delivery_radius_km,
               sdi.estimated_wait_minutes,
               sdi.supports_delivery,
               sdi.supports_pickup,
               sdi.supports_dine_in,
               sdi.store_delivery_fee,
               sdi.catalog_count,
               sdi.storefront_profile_image_url,
               sdi.storefront_cover_image_url,
               sdi.storefront_review_summary,
               sdi.active_location_snapshot,
               ST_Distance_Sphere(
                 POINT(sdi.longitude, sdi.latitude),
                 POINT(:userLng, :userLat)
               ) / 1000 AS distance_km,
               COUNT(DISTINCT gsi.item_id)                                   AS matched_item_count,
               SUM(CASE WHEN gsi.in_stock = 1 THEN 1 ELSE 0 END)            AS in_stock_match_count,
               GROUP_CONCAT(DISTINCT gi.name ORDER BY gi.name SEPARATOR '||') AS matched_item_names
             FROM storefront_discovery_index sdi
             INNER JOIN geo_store_items gsi
               ON gsi.tenant_id = sdi.tenant_id
              AND gsi.item_id IN (:itemIds)
              ${stockClause}
             INNER JOIN geo_items gi ON gi.geo_item_id = gsi.item_id
             WHERE sdi.is_visible = 1
               AND sdi.latitude  IS NOT NULL
               AND sdi.longitude IS NOT NULL
               AND ST_Distance_Sphere(
                     POINT(sdi.longitude, sdi.latitude),
                     POINT(:userLng, :userLat)
                   ) / 1000 <= :radiusKm
             GROUP BY sdi.storefront_discovery_index_id
             HAVING matched_item_count > 0
             ORDER BY distance_km ASC
             LIMIT :limit OFFSET :offset`,
            {
                replacements: { userLat, userLng, radiusKm, itemIds, limit, offset },
                type: QueryTypes.SELECT
            }
        ),
        sequelize.query(
            `SELECT COUNT(DISTINCT sdi.storefront_discovery_index_id) AS total
             FROM storefront_discovery_index sdi
             INNER JOIN geo_store_items gsi
               ON gsi.tenant_id = sdi.tenant_id
              AND gsi.item_id IN (:itemIds)
              ${stockClause}
             WHERE sdi.is_visible = 1
               AND sdi.latitude  IS NOT NULL
               AND sdi.longitude IS NOT NULL
               AND ST_Distance_Sphere(
                     POINT(sdi.longitude, sdi.latitude),
                     POINT(:userLng, :userLat)
                   ) / 1000 <= :radiusKm`,
            {
                replacements: { userLat, userLng, radiusKm, itemIds },
                type: QueryTypes.SELECT
            }
        )
    ]);

    return { rows, total: Number(countRows[0]?.total || 0) };
};

// ── Public repository ─────────────────────────────────────────────────────────
export const geoSearchRepository = {
    async searchNearbyStores({ query, latitude, longitude, radius, stockFilter, page, limit }) {
        const cacheKey = buildCacheKey(query, latitude, longitude, radius, stockFilter);

        // Cache read
        if (GEO_SEARCH_CACHE_ENABLED && isRedisConnected()) {
            try {
                const cached = await getRedisClient().get(cacheKey);
                if (cached) return JSON.parse(cached);
            } catch (err) {
                logger.warn('[GeoSearch] Redis cache read failed', { err: err?.message });
            }
        }

        const itemIds = await findMatchingItemIds(query);
        if (itemIds.length === 0) {
            return { stores: [], pagination: { page, limit, total: 0, totalPages: 0 } };
        }

        const offset = (page - 1) * limit;
        const { rows, total } = await runGeoQuery({
            itemIds,
            userLat: latitude,
            userLng: longitude,
            radiusKm: radius,
            stockFilter,
            limit,
            offset
        });

        const stores = rows.map((r) => ({
            tenant_id: r.tenant_id,
            slug: r.slug,
            tenant_name: r.tenant_name,
            tenant_company_token: r.tenant_company_token,
            latitude: r.latitude != null ? Number(r.latitude) : null,
            longitude: r.longitude != null ? Number(r.longitude) : null,
            location_id: r.location_id,
            location_name: r.location_name,
            address_line: r.address_line,
            storefront_open: Boolean(r.storefront_open),
            workflow_mode: r.workflow_mode,
            delivery_radius_km: Number(r.delivery_radius_km),
            estimated_wait_minutes: r.estimated_wait_minutes,
            supports_delivery: Boolean(r.supports_delivery),
            supports_pickup: Boolean(r.supports_pickup),
            supports_dine_in: Boolean(r.supports_dine_in),
            store_delivery_fee: r.store_delivery_fee != null ? Number(r.store_delivery_fee) : null,
            catalog_count: r.catalog_count,
            storefront_profile_image_url: r.storefront_profile_image_url,
            storefront_cover_image_url: r.storefront_cover_image_url,
            storefront_review_summary: r.storefront_review_summary ?? null,
            active_location_snapshot: r.active_location_snapshot ?? null,
            distance_km: r.distance_km != null ? Math.round(Number(r.distance_km) * 100) / 100 : null,
            matched_item_count: Number(r.matched_item_count),
            in_stock_match_count: Number(r.in_stock_match_count),
            matched_item_names: r.matched_item_names
                ? r.matched_item_names.split('||').filter(Boolean)
                : []
        }));

        const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
        const result = { stores, pagination: { page, limit, total, totalPages } };

        // Cache write
        if (GEO_SEARCH_CACHE_ENABLED && isRedisConnected()) {
            try {
                await getRedisClient().setEx(cacheKey, GEO_SEARCH_CACHE_TTL_SECONDS, JSON.stringify(result));
            } catch (err) {
                logger.warn('[GeoSearch] Redis cache write failed', { err: err?.message });
            }
        }

        return result;
    }
};
