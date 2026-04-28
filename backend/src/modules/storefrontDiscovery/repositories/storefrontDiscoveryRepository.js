import { StorefrontDiscoveryIndex } from '../../../models/index.js';
import { reconcileStorefrontDiscoveryIndex } from '../../../services/storefrontDiscoveryIndexService.js';
import { getStorefrontDiscoveryCacheVersion } from '../../../services/storefrontDiscoveryCacheState.js';
import { getStorefrontDiscoverySharedSignature } from '../../../services/storefrontDiscoveryFreshnessService.js';
import logger from '../../../config/logger.js';
import { getRedisClient, isRedisConnected } from '../../../config/redis.js';
import { createHash } from 'crypto';
import { assertStorefrontDiscoveryRepositoryContract } from '../contracts/storefrontDiscoveryRepository.contract.js';
import { normalizeStorefrontAssetUrl } from '../../shared/utils/storefrontAssetPolicy.js';

const CACHE_TTL_MS = 30 * 1000;
const DISCOVERY_REDIS_CACHE_TTL_SECONDS = Math.max(
    5,
    Number.parseInt(process.env.STOREFRONT_DISCOVERY_REDIS_CACHE_TTL_SECONDS || '20', 10) || 20
);
const DISCOVERY_PROFILE_REDIS_CACHE_TTL_SECONDS = Math.max(
    10,
    Number.parseInt(process.env.STOREFRONT_DISCOVERY_PROFILE_REDIS_CACHE_TTL_SECONDS || '30', 10) || 30
);
const DISCOVERY_REDIS_CACHE_ENABLED = (() => {
    const raw = String(process.env.STOREFRONT_DISCOVERY_REDIS_CACHE_ENABLED || '').trim().toLowerCase();
    if (raw === 'true' || raw === '1' || raw === 'on') return true;
    if (raw === 'false' || raw === '0' || raw === 'off') return false;
    return process.env.NODE_ENV !== 'test';
})();
let cache = {
    expiresAt: 0,
    entries: [],
    version: -1,
    signature: '0:0'
};
let emptyAutoRepairInFlight = false;
const SUPPORTED_SEARCH_SNAPSHOT_VERSION = 1;
const LEGACY_SCHEMA_SAFE_ATTRIBUTES = Object.freeze([
    'tenant_id',
    'tenant_name',
    'slug',
    'storefront_open',
    'location_id',
    'location_name',
    'address_line',
    'latitude',
    'longitude',
    'delivery_radius_km',
    'estimated_wait_minutes',
    'supports_delivery',
    'supports_pickup',
    'supports_dine_in',
    'store_delivery_fee',
    'catalog_count',
    'active_location_snapshot',
    'item_search_snapshot',
    'search_snapshot_version'
]);

const normalizeSlug = (value) => String(value || '').trim().toLowerCase();
const shouldAutoRepairEmptyIndex = () => process.env.STOREFRONT_DISCOVERY_INDEX_AUTO_REPAIR_ON_EMPTY !== 'false';
const shouldEnableFanoutFallback = () => process.env.STOREFRONT_DISCOVERY_FANOUT_FALLBACK_ENABLED === 'true';

const toRadians = (deg) => (deg * Math.PI) / 180;
const distanceKm = (lat1, lng1, lat2, lng2) => {
    const r = 6371;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
    return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const parseJsonArray = (value) => {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
};

const normalizeSearchText = (value) => String(value || '').trim().toLowerCase();

const resolveResultMode = (query = {}) => {
    const raw = normalizeSearchText(query.result_mode);
    if (raw === 'item_only' || raw === 'store_only' || raw === 'union') return raw;
    return 'union';
};

const resolveStockFilter = (query = {}, hasSearch = false) => {
    const raw = normalizeSearchText(query.stock_filter);
    if (raw === 'include_out_of_stock' || raw === 'in_stock_only') return raw;
    return hasSearch ? 'in_stock_only' : 'include_out_of_stock';
};

const resolvePinScope = (query = {}, withDistance = false) => {
    const raw = normalizeSearchText(query.pin_scope);
    if (raw === 'nearest_matching_branch' || raw === 'all_matching_branches' || raw === 'tenant_primary') {
        return raw;
    }
    return withDistance ? 'nearest_matching_branch' : 'tenant_primary';
};

const resolveIncludeMatchMeta = (query = {}) => {
    if (typeof query.include_match_meta === 'boolean') return query.include_match_meta;
    const raw = normalizeSearchText(query.include_match_meta);
    if (raw === 'false' || raw === '0' || raw === 'no') return false;
    return true;
};

const toGeoBucket = ({ latitude, longitude } = {}) => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'na';
    const latBucket = Math.round(lat * 20) / 20;
    const lngBucket = Math.round(lng * 20) / 20;
    return `${latBucket.toFixed(2)}:${lngBucket.toFixed(2)}`;
};

const normalizeDiscoveryQueryForCacheKey = (query = {}) => {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, Number.parseInt(query.limit, 10) || 20));
    const search = normalizeSearchText(query.search);
    const resultMode = resolveResultMode(query);
    const stockFilter = resolveStockFilter(query, Boolean(search));
    const pinScope = resolvePinScope(query, Number.isFinite(Number(query.latitude)) && Number.isFinite(Number(query.longitude)));
    const includeMatchMeta = resolveIncludeMatchMeta(query);
    const tenantScope = normalizeSearchText(query.tenant_id || query.tenant || 'all') || 'all';
    const geoBucket = toGeoBucket({
        latitude: query.latitude,
        longitude: query.longitude
    });

    return {
        page,
        limit,
        search,
        result_mode: resultMode,
        stock_filter: stockFilter,
        pin_scope: pinScope,
        include_match_meta: includeMatchMeta,
        tenant_scope: tenantScope,
        geo_bucket: geoBucket
    };
};

const buildDiscoveryQueryCacheKey = ({ query = {}, version = 0, signature = '0:0' } = {}) => {
    const canonicalQuery = normalizeDiscoveryQueryForCacheKey(query);
    const digest = createHash('sha1').update(JSON.stringify(canonicalQuery)).digest('hex');
    return `storefront:discovery:list:v3:${version}:${signature}:${digest}`;
};

const buildDiscoveryProfileCacheKey = ({ slug = '', signature = '0:0' } = {}) => {
    const normalizedSlug = normalizeSlug(slug);
    return `storefront:discovery:profile:v2:${signature}:${normalizedSlug}`;
};

const readRedisCacheEntry = async (key) => {
    if (!DISCOVERY_REDIS_CACHE_ENABLED) return null;
    if (!isRedisConnected()) return null;
    const client = getRedisClient();
    if (!client || !key) return null;
    try {
        const raw = await client.get(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
        logger.warn('[StorefrontDiscovery] Redis cache read failed', {
            key,
            error: error?.message || 'unknown_error'
        });
        return null;
    }
};

const writeRedisCacheEntry = async (key, value, ttlSeconds) => {
    if (!DISCOVERY_REDIS_CACHE_ENABLED) return;
    if (!isRedisConnected()) return;
    const client = getRedisClient();
    if (!client || !key) return;
    try {
        await client.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
        logger.warn('[StorefrontDiscovery] Redis cache write failed', {
            key,
            error: error?.message || 'unknown_error'
        });
    }
};

const sanitizeStorefrontAssetUrlFromIndex = ({ rawValue, tenantId, assetType }) => {
    const raw = String(rawValue || '').trim();
    const normalized = normalizeStorefrontAssetUrl(raw);
    if (raw && !normalized) {
        logger.warn('[StorefrontDiscoveryRepository] Sanitized unsafe storefront asset URL from discovery index row', {
            event_type: 'security_signal',
            signal_code: 'storefront_asset_index_sanitized',
            tenant_id: tenantId || null,
            asset_type: assetType
        });
    }
    return normalized || null;
};

const getSqlErrorCode = (error) => String(
    error?.original?.code
    || error?.parent?.code
    || error?.code
    || ''
).trim();

const getSqlErrorMessage = (error) => String(
    error?.original?.sqlMessage
    || error?.parent?.sqlMessage
    || error?.original?.message
    || error?.parent?.message
    || error?.message
    || ''
);

const isMissingStorefrontBrandingColumnError = (error) => {
    const code = getSqlErrorCode(error);
    if (code !== 'ER_BAD_FIELD_ERROR') return false;
    const message = getSqlErrorMessage(error);
    return (
        message.includes("Unknown column 'storefront_cover_image_url'")
        || message.includes("Unknown column 'storefront_profile_image_url'")
    );
};

const queryDiscoveryIndexWithLegacyFallback = async ({
    findFn,
    queryOptions,
    operation
}) => {
    try {
        return await findFn(queryOptions);
    } catch (error) {
        if (!isMissingStorefrontBrandingColumnError(error)) {
            throw error;
        }
        logger.warn('[StorefrontDiscovery] Legacy discovery-index schema detected; using temporary branding-column fallback', {
            operation,
            error: getSqlErrorMessage(error),
            fallback_attributes: LEGACY_SCHEMA_SAFE_ATTRIBUTES
        });
        return findFn({
            ...queryOptions,
            attributes: LEGACY_SCHEMA_SAFE_ATTRIBUTES
        });
    }
};

const toPlainEntry = (row) => ({
    tenant_id: row.tenant_id,
    tenant_name: row.tenant_name,
    slug: row.slug,
    storefront_open: row.storefront_open === true,
    location_id: row.location_id,
    location_name: row.location_name,
    address_line: row.address_line,
    latitude: toNumber(row.latitude, null),
    longitude: toNumber(row.longitude, null),
    delivery_radius_km: toNumber(row.delivery_radius_km, 0),
    estimated_wait_minutes: toNumber(row.estimated_wait_minutes, 15),
    supports_delivery: row.supports_delivery !== false,
    supports_pickup: row.supports_pickup !== false,
    supports_dine_in: row.supports_dine_in !== false,
    store_delivery_fee: toNumber(row.store_delivery_fee, 0),
    catalog_count: toNumber(row.catalog_count, 0),
    storefront_cover_image_url: sanitizeStorefrontAssetUrlFromIndex({
        rawValue: row.storefront_cover_image_url,
        tenantId: row.tenant_id,
        assetType: 'cover'
    }),
    storefront_profile_image_url: sanitizeStorefrontAssetUrlFromIndex({
        rawValue: row.storefront_profile_image_url,
        tenantId: row.tenant_id,
        assetType: 'profile'
    }),
    active_location_snapshot: parseJsonArray(row.active_location_snapshot),
    item_search_snapshot: parseJsonArray(row.item_search_snapshot),
    search_snapshot_version: toNumber(row.search_snapshot_version, 0)
});

const warmIndexOnEmpty = async () => {
    if (!shouldAutoRepairEmptyIndex() || emptyAutoRepairInFlight) {
        return;
    }
    emptyAutoRepairInFlight = true;
    try {
        const result = await reconcileStorefrontDiscoveryIndex();
        logger.info('[StorefrontDiscovery] Auto repair reconciliation executed', result);
    } catch (error) {
        logger.warn('[StorefrontDiscovery] Auto repair reconciliation failed', {
            error: error?.message || 'unknown_error'
        });
    } finally {
        emptyAutoRepairInFlight = false;
    }
};

const loadAllEntries = async ({ cacheVersion = null, cacheSignature = null } = {}) => {
    const now = Date.now();
    const version = Number.isInteger(Number(cacheVersion))
        ? Number(cacheVersion)
        : getStorefrontDiscoveryCacheVersion();
    const signature = String(cacheSignature || '').trim() || await getStorefrontDiscoverySharedSignature();
    if (
        cache.expiresAt > now
        && Array.isArray(cache.entries)
        && cache.version === version
        && cache.signature === signature
    ) {
        return cache.entries;
    }

    const baseFindAllOptions = {
        where: { is_visible: true },
        order: [
            ['storefront_open', 'DESC'],
            ['tenant_name', 'ASC']
        ]
    };
    let rows = await queryDiscoveryIndexWithLegacyFallback({
        findFn: StorefrontDiscoveryIndex.findAll.bind(StorefrontDiscoveryIndex),
        queryOptions: baseFindAllOptions,
        operation: 'findAll_visible'
    });

    if ((!rows || rows.length === 0) && shouldAutoRepairEmptyIndex()) {
        await warmIndexOnEmpty();
        rows = await queryDiscoveryIndexWithLegacyFallback({
            findFn: StorefrontDiscoveryIndex.findAll.bind(StorefrontDiscoveryIndex),
            queryOptions: baseFindAllOptions,
            operation: 'findAll_visible_after_repair'
        });
    }

    if ((!rows || rows.length === 0) && shouldEnableFanoutFallback()) {
        logger.warn('[StorefrontDiscovery] Index is empty and fan-out fallback was requested, but fallback path is removed.');
    }

    const entries = (rows || []).map(toPlainEntry).filter((entry) => (
        Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude)
    ));
    cache = {
        entries,
        expiresAt: now + CACHE_TTL_MS,
        version,
        signature
    };
    return entries;
};

export const clearStorefrontDiscoveryRepositoryCache = () => {
    cache = {
        expiresAt: 0,
        entries: [],
        version: -1,
        signature: '0:0'
    };
};

const collectItemMatchByTenant = (entries = [], search = '') => {
    const normalizedSearch = normalizeSearchText(search);
    if (!normalizedSearch) {
        return {
            itemMatchByTenant: new Map(),
            degradedTenants: []
        };
    }

    const map = new Map();
    const degradedTenants = [];
    for (const entry of entries) {
        const tenantId = String(entry?.tenant_id || '').trim();
        if (!tenantId) continue;

        const snapshotVersion = Number(entry?.search_snapshot_version || 0);
        const hasSupportedVersion = snapshotVersion === SUPPORTED_SEARCH_SNAPSHOT_VERSION;
        const hasItemSnapshot = Array.isArray(entry?.item_search_snapshot);
        const hasActiveLocationSnapshot = Array.isArray(entry?.active_location_snapshot);
        if (!hasSupportedVersion || !hasItemSnapshot || !hasActiveLocationSnapshot) {
            const reasons = [];
            if (!hasSupportedVersion) reasons.push('unsupported_snapshot_version');
            if (!hasItemSnapshot) reasons.push('missing_item_search_snapshot');
            if (!hasActiveLocationSnapshot) reasons.push('missing_active_location_snapshot');
            degradedTenants.push({
                tenant_id: tenantId,
                slug: String(entry?.slug || ''),
                reason_codes: reasons
            });
            continue;
        }

        const snapshotRows = Array.isArray(entry?.item_search_snapshot) ? entry.item_search_snapshot : [];
        if (snapshotRows.length === 0) {
            const catalogCount = Number(entry?.catalog_count || 0);
            if (catalogCount > 0) {
                degradedTenants.push({
                    tenant_id: tenantId,
                    slug: String(entry?.slug || ''),
                    reason_codes: ['empty_item_search_snapshot']
                });
            }
            continue;
        }

        let matchingItemCount = 0;
        const sampleNames = [];
        const matchingLocationIds = new Set();
        const inStockLocationIds = new Set();

        snapshotRows.forEach((item) => {
            const searchable = normalizeSearchText(item?.text);
            if (!searchable.includes(normalizedSearch)) return;

            matchingItemCount += 1;
            if (sampleNames.length < 3 && item?.item_name) {
                sampleNames.push(String(item.item_name));
            }

            const allLocations = Array.isArray(item?.matching_location_ids) ? item.matching_location_ids : [];
            allLocations.forEach((locationId) => {
                const numericLocationId = Number(locationId);
                if (Number.isInteger(numericLocationId) && numericLocationId > 0) {
                    matchingLocationIds.add(numericLocationId);
                }
            });

            const inStockLocations = Array.isArray(item?.in_stock_location_ids) ? item.in_stock_location_ids : [];
            inStockLocations.forEach((locationId) => {
                const numericLocationId = Number(locationId);
                if (Number.isInteger(numericLocationId) && numericLocationId > 0) {
                    inStockLocationIds.add(numericLocationId);
                }
            });
        });

        if (matchingItemCount > 0) {
            map.set(tenantId, {
                matching_item_count: matchingItemCount,
                matching_item_sample: sampleNames,
                matching_location_ids: Array.from(matchingLocationIds),
                in_stock_location_ids: Array.from(inStockLocationIds),
                has_in_stock_match: inStockLocationIds.size > 0
            });
        }
    }

    return {
        itemMatchByTenant: map,
        degradedTenants
    };
};

const resolveLocationById = (entry = {}, locationId = null) => {
    const numericLocationId = Number(locationId);
    if (!Number.isInteger(numericLocationId) || numericLocationId <= 0) return null;
    const activeLocations = Array.isArray(entry?.active_location_snapshot) ? entry.active_location_snapshot : [];
    return activeLocations.find((location) => Number(location.location_id) === numericLocationId) || null;
};

const resolveNearestLocationId = (entry = {}, candidateLocationIds = [], latitude = null, longitude = null) => {
    const activeLocations = Array.isArray(entry?.active_location_snapshot) ? entry.active_location_snapshot : [];
    const candidateSet = new Set(
        (Array.isArray(candidateLocationIds) ? candidateLocationIds : [])
            .map((locationId) => Number(locationId))
            .filter((locationId) => Number.isInteger(locationId) && locationId > 0)
    );

    const filteredLocations = activeLocations.filter((location) => candidateSet.has(Number(location.location_id)));
    if (filteredLocations.length === 0) return null;

    const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
    if (!hasCoords) {
        return Number(filteredLocations[0].location_id);
    }

    const sorted = filteredLocations
        .filter((location) => Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude)))
        .map((location) => ({
            location,
            distance: distanceKm(latitude, longitude, Number(location.latitude), Number(location.longitude))
        }))
        .sort((a, b) => a.distance - b.distance);

    if (sorted.length === 0) return Number(filteredLocations[0].location_id);
    return Number(sorted[0].location.location_id);
};

const applyDiscoveryQuery = async (entries = [], query = {}) => {
    const startedAt = Date.now();
    const search = normalizeSearchText(query.search);
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, Number.parseInt(query.limit, 10) || 20));
    const lat = Number(query.latitude);
    const lng = Number(query.longitude);
    const withDistance = Number.isFinite(lat) && Number.isFinite(lng);
    const resultMode = resolveResultMode(query);
    const stockFilter = resolveStockFilter(query, Boolean(search));
    const pinScope = resolvePinScope(query, withDistance);
    const includeMatchMeta = resolveIncludeMatchMeta(query);

    let rows = entries;
    const tenantFieldMatches = new Set();
    const { itemMatchByTenant, degradedTenants } = search
        ? collectItemMatchByTenant(rows, search)
        : { itemMatchByTenant: new Map(), degradedTenants: [] };
    if (search && Array.isArray(degradedTenants) && degradedTenants.length > 0) {
        logger.warn('[StorefrontDiscovery] Snapshot compatibility fallback applied', {
            query_length: search.length,
            affected_tenant_count: degradedTenants.length,
            affected_tenants: degradedTenants
        });
    }

    if (search) {
        rows.forEach((entry) => {
            const matched = (
                normalizeSearchText(entry?.tenant_name).includes(search)
                || normalizeSearchText(entry?.slug).includes(search)
                || normalizeSearchText(entry?.address_line).includes(search)
                || normalizeSearchText(entry?.location_name).includes(search)
            );
            if (matched) tenantFieldMatches.add(String(entry.tenant_id || ''));
        });

        rows = rows.filter((entry) => {
            const tenantId = String(entry?.tenant_id || '');
            const storeMatch = tenantFieldMatches.has(tenantId);
            const itemMeta = itemMatchByTenant.get(tenantId) || null;
            const itemExists = Boolean(itemMeta);
            const itemEligible = itemExists && (
                stockFilter === 'include_out_of_stock'
                || itemMeta.has_in_stock_match === true
            );

            if (resultMode === 'item_only') return itemEligible;
            if (resultMode === 'store_only') return storeMatch;
            return storeMatch || itemEligible;
        });
    }

    rows = rows.map((entry) => {
        const tenantId = String(entry?.tenant_id || '');
        const storeMatch = search ? tenantFieldMatches.has(tenantId) : false;
        const itemMeta = search ? (itemMatchByTenant.get(tenantId) || null) : null;
        const itemEligible = Boolean(itemMeta) && (
            stockFilter === 'include_out_of_stock'
            || itemMeta.has_in_stock_match === true
        );
        const locationCandidateIds = itemEligible
            ? (
                stockFilter === 'in_stock_only'
                    ? itemMeta.in_stock_location_ids
                    : itemMeta.matching_location_ids
            )
            : [];

        const nearestMatchingLocationId = itemEligible
            ? resolveNearestLocationId(entry, locationCandidateIds, withDistance ? lat : null, withDistance ? lng : null)
            : null;

        const anchorLocation = (
            pinScope === 'nearest_matching_branch' && Number.isInteger(nearestMatchingLocationId)
                ? resolveLocationById(entry, nearestMatchingLocationId)
                : null
        );
        const anchorLatitude = Number.isFinite(Number(anchorLocation?.latitude)) ? Number(anchorLocation.latitude) : Number(entry.latitude);
        const anchorLongitude = Number.isFinite(Number(anchorLocation?.longitude)) ? Number(anchorLocation.longitude) : Number(entry.longitude);
        const distance = withDistance
            ? Number(distanceKm(lat, lng, anchorLatitude, anchorLongitude).toFixed(2))
            : null;

        const nextRow = {
            ...entry,
            latitude: anchorLatitude,
            longitude: anchorLongitude,
            distance_km: distance
        };

        if (!includeMatchMeta) {
            return nextRow;
        }

        const matchReasons = [];
        if (storeMatch && resultMode !== 'item_only') matchReasons.push('store');
        if (itemEligible && resultMode !== 'store_only') matchReasons.push('item');

        return {
            ...nextRow,
            match_reasons: matchReasons,
            matching_item_count: itemMeta?.matching_item_count || 0,
            matching_item_sample: itemMeta?.matching_item_sample || [],
            has_in_stock_match: itemMeta?.has_in_stock_match === true,
            matching_location_ids: Array.isArray(locationCandidateIds) ? locationCandidateIds : [],
            nearest_matching_location_id: Number.isInteger(nearestMatchingLocationId) ? nearestMatchingLocationId : null
        };
    });

    if (search) {
        logger.info('[StorefrontDiscovery] Discovery search resolved', {
            result_mode: resultMode,
            stock_filter: stockFilter,
            pin_scope: pinScope,
            include_match_meta: includeMatchMeta,
            query_length: search.length,
            with_distance: withDistance,
            row_count: rows.length,
            zero_result: rows.length === 0,
            latency_ms: Date.now() - startedAt
        });
    }

    rows = rows.sort((a, b) => {
        if (a.storefront_open !== b.storefront_open) return a.storefront_open ? -1 : 1;
        if (withDistance) return (a.distance_km ?? Number.MAX_SAFE_INTEGER) - (b.distance_km ?? Number.MAX_SAFE_INTEGER);
        return String(a.tenant_name || '').localeCompare(String(b.tenant_name || ''));
    });

    const total = rows.length;
    const offset = (page - 1) * limit;
    const paged = rows.slice(offset, offset + limit);

    return {
        rows: paged,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit))
        },
        applied_filters: {
            result_mode: resultMode,
            stock_filter: stockFilter,
            pin_scope: pinScope,
            include_match_meta: includeMatchMeta
        }
    };
};

export const storefrontDiscoveryRepository = {
    async listDiscovery(query = {}) {
        const version = getStorefrontDiscoveryCacheVersion();
        const signature = await getStorefrontDiscoverySharedSignature();
        const cacheKey = buildDiscoveryQueryCacheKey({ query, version, signature });
        const cached = await readRedisCacheEntry(cacheKey);
        if (
            cached
            && Array.isArray(cached?.rows)
            && cached?.pagination
            && cached?.applied_filters
        ) {
            return cached;
        }

        const entries = await loadAllEntries({
            cacheVersion: version,
            cacheSignature: signature
        });
        const result = await applyDiscoveryQuery(entries, query);
        await writeRedisCacheEntry(cacheKey, result, DISCOVERY_REDIS_CACHE_TTL_SECONDS);
        return result;
    },

    async getStorefrontBySlug(slug) {
        const normalizedSlug = normalizeSlug(slug);
        if (!normalizedSlug) return null;
        const signature = await getStorefrontDiscoverySharedSignature();
        const cacheKey = buildDiscoveryProfileCacheKey({
            slug: normalizedSlug,
            signature
        });
        const cached = await readRedisCacheEntry(cacheKey);
        if (cached && typeof cached === 'object') {
            return cached;
        }

        const row = await queryDiscoveryIndexWithLegacyFallback({
            findFn: StorefrontDiscoveryIndex.findOne.bind(StorefrontDiscoveryIndex),
            queryOptions: {
            where: {
                slug: normalizedSlug,
                is_visible: true
            }
            },
            operation: 'findOne_by_slug'
        });

        if (!row) return null;
        const entry = toPlainEntry(row);
        if (!Number.isFinite(entry.latitude) || !Number.isFinite(entry.longitude)) return null;
        await writeRedisCacheEntry(cacheKey, entry, DISCOVERY_PROFILE_REDIS_CACHE_TTL_SECONDS);
        return entry;
    }
};

assertStorefrontDiscoveryRepositoryContract(storefrontDiscoveryRepository);
