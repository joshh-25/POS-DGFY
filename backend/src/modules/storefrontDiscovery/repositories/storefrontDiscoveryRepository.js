import { StorefrontDiscoveryIndex } from '../../../models/index.js';
import { reconcileStorefrontDiscoveryIndex } from '../../../services/storefrontDiscoveryIndexService.js';
import { getStorefrontDiscoveryCacheVersion } from '../../../services/storefrontDiscoveryCacheState.js';
import { getStorefrontDiscoverySharedSignature } from '../../../services/storefrontDiscoveryFreshnessService.js';
import logger from '../../../config/logger.js';
import { getRedisClient, isRedisConnected } from '../../../config/redis.js';
import { createHash } from 'crypto';
import { Op } from 'sequelize';
import { assertStorefrontDiscoveryRepositoryContract } from '../contracts/storefrontDiscoveryRepository.contract.js';
import { normalizeStorefrontAssetPath, normalizeStorefrontAssetUrl } from '../../shared/utils/storefrontAssetPolicy.js';
import {
    formatStorefrontBusinessHoursDisplay,
    getStorefrontBusinessHoursStatus
} from '../../shared/utils/storefrontBusinessHours.js';
import { publicSearchTextMatches } from '../../shared/utils/publicSearchAliasPolicy.js';
import { DEFAULT_WORKFLOW_MODE, normalizeWorkflowMode } from '../../shared/constants/workflowModes.js';
import {
    buildAccessCapabilities,
    CUSTOMER_ACCESS_SETTING_KEYS,
    isCustomerAccessModesEnabled,
    resolveAccessPolicyFromSettings
} from '../../shared/utils/customerAccessPolicy.js';

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
    'workflow_mode',
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
const STOREFRONT_PROFILE_INDEX_COLUMNS = Object.freeze([
    'storefront_tagline',
    'storefront_about',
    'storefront_phone',
    'storefront_email',
    'storefront_hours',
    'storefront_why_choose_us',
    'storefront_social_links',
    'storefront_review_highlights',
    'storefront_promo',
    'storefront_ui_v2_enabled',
    'storefront_categories',
    'storefront_gallery_images',
    'storefront_delivery_partners',
    'storefront_follow_enabled',
    'storefront_share_enabled',
    'storefront_review_summary',
    'customer_access_mode',
    'effective_customer_access_mode',
    'max_customer_access_mode',
    'inventory_display_mode',
    'inventory_low_stock_display_threshold',
    'access_capabilities',
    'access_limitation_reason',
    'customer_access_modes_enabled'
]);
const hasMaterializedStorefrontProfileColumns = (row) => {
    const plain = row && typeof row.toJSON === 'function' ? row.toJSON() : row || {};
    return STOREFRONT_PROFILE_INDEX_COLUMNS.every((column) => Object.prototype.hasOwnProperty.call(plain, column));
};
const STOREFRONT_PROFILE_SETTING_KEYS = Object.freeze([
    'storefront_tagline',
    'storefront_about',
    'storefront_phone',
    'storefront_email',
    'storefront_hours',
    'storefront_why_choose_us',
    'storefront_social_links',
    'storefront_review_highlights',
    'storefront_promo',
    'storefront_ui_v2_enabled',
    'storefront_categories',
    'storefront_gallery_images',
    'storefront_delivery_partners',
    'storefront_follow_enabled',
    'storefront_share_enabled',
    'storefront_review_summary',
    'store_has_no_location',
    ...CUSTOMER_ACCESS_SETTING_KEYS
]);
const DISCOVERY_PROFILE_SETTINGS_REDIS_CACHE_TTL_SECONDS = Math.max(
    10,
    Number.parseInt(process.env.STOREFRONT_DISCOVERY_PROFILE_SETTINGS_REDIS_CACHE_TTL_SECONDS || '30', 10) || 30
);

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
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const hasUsableCoordinates = (entry = {}) => (
    entry.latitude !== null
    && entry.latitude !== undefined
    && entry.latitude !== ''
    && entry.longitude !== null
    && entry.longitude !== undefined
    && entry.longitude !== ''
    && Number.isFinite(Number(entry.latitude))
    && Number.isFinite(Number(entry.longitude))
);

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

const parseJsonObject = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (!value || typeof value !== 'string') return null;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

const toTrimmedString = (value, maxLen = 255) => String(value || '').trim().slice(0, maxLen);
const parseBoolean = (value, fallback = false) => {
    if (value == null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
};
const normalizeStringList = (value, maxItems = 8, maxLen = 120) => parseJsonArray(value)
    .map((entry) => toTrimmedString(entry, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
const normalizeStorefrontGalleryImages = (value) => parseJsonArray(value)
    .map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
        const rawUrl = toTrimmedString(entry.url, 500);
        const url = (() => {
            const internal = normalizeStorefrontAssetUrl(rawUrl);
            if (internal) return internal;
            try {
                const parsed = new URL(rawUrl);
                return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
            } catch {
                return '';
            }
        })();
        const path = normalizeStorefrontAssetPath(toTrimmedString(entry.path, 500));
        if (!url && !path) return null;
        return {
            url,
            path,
            caption: toTrimmedString(entry.caption, 140),
            alt: toTrimmedString(entry.alt, 140),
            sort_order: Number.isInteger(Number(entry.sort_order)) ? Number(entry.sort_order) : index
        };
    })
    .filter(Boolean)
    .slice(0, 24)
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
const normalizeStorefrontDeliveryPartners = (value) => {
    const normalized = [];
    parseJsonArray(value).forEach((entry) => {
        if (typeof entry === 'string') {
            const partner = toTrimmedString(entry, 40).toLowerCase();
            if (!['grab', 'foodpanda', 'lalamove'].includes(partner)) return;
            normalized.push({ partner, label: '', url: '' });
            return;
        }
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
        const partner = toTrimmedString(entry.partner, 40).toLowerCase();
        if (!['grab', 'foodpanda', 'lalamove', 'custom'].includes(partner)) return;
        normalized.push({
            partner,
            label: toTrimmedString(entry.label, 60),
            url: normalizeExternalHttpUrl(entry.url, 255)
        });
    });
    const deduped = [];
    const seen = new Set();
    normalized.forEach((entry) => {
        const dedupeKey = `${entry.partner}:${entry.partner === 'custom' ? String(entry.label || '').toLowerCase() : ''}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        deduped.push(entry);
    });
    return deduped.slice(0, 8);
};
const normalizeStorefrontReviewSummary = (value) => {
    const raw = parseJsonObject(value);
    if (!raw) return null;
    const score = Number(raw.score);
    const totalCount = Number(raw.total_count);
    const summary = {
        score: Number.isFinite(score) ? Math.min(5, Math.max(0, score)) : null,
        total_count: Number.isInteger(totalCount) && totalCount >= 0 ? totalCount : null
    };
    if (raw.star_distribution && typeof raw.star_distribution === 'object' && !Array.isArray(raw.star_distribution)) {
        const distribution = {};
        [1, 2, 3, 4, 5].forEach((star) => {
            const count = Number(raw.star_distribution[star]);
            if (Number.isInteger(count) && count >= 0) {
                distribution[star] = count;
            }
        });
        if (Object.keys(distribution).length > 0) {
            summary.star_distribution = distribution;
        }
    }
    return summary;
};
const normalizeExternalHttpUrl = (value, maxLength = 255) => {
    const raw = toTrimmedString(value, maxLength);
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString().slice(0, maxLength) : '';
    } catch {
        return '';
    }
};

const buildDiscoveryProfileSettingsCacheKey = ({ tenantId = '', version = 0, signature = '0:0' } = {}) => {
    const normalizedTenantId = String(tenantId || '').trim();
    if (!normalizedTenantId) return '';
    return `storefront:discovery:profile-settings:v3:${version}:${signature}:${normalizedTenantId}`;
};

const readStorefrontProfileSettings = async ({ tenantId, cacheVersion, cacheSignature } = {}) => {
    if (!tenantId) return {};
    const normalizedTenantId = String(tenantId || '').trim();
    const version = Number.isInteger(cacheVersion) ? cacheVersion : getStorefrontDiscoveryCacheVersion();
    const signature = String(cacheSignature || '').trim() || await getStorefrontDiscoverySharedSignature();
    const cacheKey = buildDiscoveryProfileSettingsCacheKey({
        tenantId: normalizedTenantId,
        version,
        signature
    });
    const cached = await readRedisCacheEntry(cacheKey);
    if (cached && typeof cached === 'object') {
        return cached;
    }

    let Tenant;
    let tenantConnectorModule;
    let tenantModelFactoryModule;
    try {
        [{ Tenant }, tenantConnectorModule, tenantModelFactoryModule] = await Promise.all([
            import('../../../models/index.js'),
            import('../../../utils/TenantConnector.js'),
            import('../../../utils/tenantModelFactory.js')
        ]);
    } catch {
        return {};
    }
    if (!Tenant || typeof Tenant.findOne !== 'function') {
        return {};
    }

    const tenant = await Tenant.findOne({
        where: { id: normalizedTenantId, status: 'active' },
        attributes: ['id', 'name', 'company_token', 'db_name', 'status']
    });
    if (!tenant) return {};

    const tenantConnector = tenantConnectorModule?.default;
    const getTenantModels = tenantModelFactoryModule?.getTenantModels;
    if (!tenantConnector || typeof tenantConnector.getConnection !== 'function' || typeof getTenantModels !== 'function') {
        return {};
    }

    const tenantConnection = await tenantConnector.getConnection(tenant);
    const { SystemSetting } = getTenantModels(tenantConnection);
    if (!SystemSetting || typeof SystemSetting.findAll !== 'function') {
        return {};
    }
    const rows = await SystemSetting.findAll({
        where: { setting_key: { [Op.in]: STOREFRONT_PROFILE_SETTING_KEYS } },
        attributes: ['setting_key', 'setting_value']
    });

    const settingsMap = {};
    (rows || []).forEach((row) => {
        const key = String(row?.setting_key || '').trim();
        if (!key) return;
        settingsMap[key] = row?.setting_value;
    });

    const whyChooseUs = parseJsonArray(settingsMap.storefront_why_choose_us).map((entry) => toTrimmedString(entry, 120)).filter(Boolean);
    const social = parseJsonObject(settingsMap.storefront_social_links) || null;
    const promo = parseJsonObject(settingsMap.storefront_promo) || null;
    const reviewHighlights = parseJsonArray(settingsMap.storefront_review_highlights)
        .map((entry) => {
            const comment = toTrimmedString(entry?.comment, 280);
            if (!comment) return null;
            return {
                reviewer_name: toTrimmedString(entry?.reviewer_name, 80),
                rating: Number.isFinite(Number(entry?.rating)) ? Number(entry.rating) : null,
                comment
            };
        })
        .filter(Boolean);
    const accessPolicy = resolveAccessPolicyFromSettings({
        ...settingsMap,
        tenant_onboarding_progress: parseJsonObject(settingsMap.tenant_onboarding_progress) || null
    }, {
        featureEnabled: isCustomerAccessModesEnabled({
            tenantId,
            companyToken: tenant?.company_token,
            tenantName: tenant?.name
        })
    });

    const storefrontHoursStatus = getStorefrontBusinessHoursStatus(settingsMap.storefront_hours);
    const settingsPayload = {
        storefront_tagline: toTrimmedString(settingsMap.storefront_tagline, 120),
        storefront_about: toTrimmedString(settingsMap.storefront_about, 1000),
        storefront_phone: toTrimmedString(settingsMap.storefront_phone, 50),
        storefront_email: toTrimmedString(settingsMap.storefront_email, 120),
        storefront_hours: toTrimmedString(formatStorefrontBusinessHoursDisplay(settingsMap.storefront_hours), 120),
        storefront_hours_status: storefrontHoursStatus,
        storefront_why_choose_us: whyChooseUs,
        storefront_social_links: social,
        storefront_review_highlights: reviewHighlights,
        storefront_promo: promo,
        storefront_ui_v2_enabled: parseBoolean(settingsMap.storefront_ui_v2_enabled, false),
        storefront_categories: normalizeStringList(settingsMap.storefront_categories, 12, 60),
        storefront_gallery_images: normalizeStorefrontGalleryImages(settingsMap.storefront_gallery_images),
        storefront_delivery_partners: normalizeStorefrontDeliveryPartners(settingsMap.storefront_delivery_partners),
        storefront_follow_enabled: parseBoolean(settingsMap.storefront_follow_enabled, false),
        storefront_share_enabled: parseBoolean(settingsMap.storefront_share_enabled, false),
        storefront_review_summary: normalizeStorefrontReviewSummary(settingsMap.storefront_review_summary),
        store_has_no_location: parseBoolean(settingsMap.store_has_no_location, false),
        map_publication_disabled: parseBoolean(settingsMap.store_has_no_location, false),
        customer_access_mode: accessPolicy.customer_access_mode,
        effective_customer_access_mode: accessPolicy.effective_customer_access_mode,
        max_customer_access_mode: accessPolicy.max_customer_access_mode,
        inventory_display_mode: accessPolicy.inventory_display_mode,
        inventory_low_stock_display_threshold: accessPolicy.inventory_low_stock_display_threshold,
        access_capabilities: accessPolicy.access_capabilities,
        access_limitation_reason: accessPolicy.limitation_reason,
        customer_access_modes_enabled: accessPolicy.customer_access_modes_enabled
    };
    await writeRedisCacheEntry(cacheKey, settingsPayload, DISCOVERY_PROFILE_SETTINGS_REDIS_CACHE_TTL_SECONDS);
    return settingsPayload;
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

const buildDiscoveryProfileCacheKey = ({ slug = '', version = 0, signature = '0:0' } = {}) => {
    const normalizedSlug = normalizeSlug(slug);
    return `storefront:discovery:profile:v3:${version}:${signature}:${normalizedSlug}`;
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

const isMissingStorefrontIndexColumnError = (error) => {
    const code = getSqlErrorCode(error);
    if (code !== 'ER_BAD_FIELD_ERROR') return false;
    const message = getSqlErrorMessage(error);
    const checkedColumns = [
        'storefront_cover_image_url',
        'storefront_profile_image_url',
        ...STOREFRONT_PROFILE_INDEX_COLUMNS
    ];
    return checkedColumns.some((column) => message.includes(`Unknown column '${column}'`));
};

const queryDiscoveryIndexWithLegacyFallback = async ({
    findFn,
    queryOptions,
    operation
}) => {
    try {
        return await findFn(queryOptions);
    } catch (error) {
        if (!isMissingStorefrontIndexColumnError(error)) {
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

const toPlainEntry = (row) => {
    const plain = row && typeof row.toJSON === 'function' ? row.toJSON() : row || {};
    const customerAccessModesEnabled = parseBoolean(
        plain.customer_access_modes_enabled,
        isCustomerAccessModesEnabled({ tenantId: plain.tenant_id })
    );
    const effectiveCustomerAccessMode = plain.effective_customer_access_mode
        || (customerAccessModesEnabled ? 'catalog' : 'transaction');
    const accessCapabilities = parseJsonObject(plain.access_capabilities)
        || buildAccessCapabilities(effectiveCustomerAccessMode);
    return {
    tenant_id: plain.tenant_id,
    tenant_name: plain.tenant_name,
    slug: plain.slug,
    storefront_open: plain.storefront_open === true,
    workflow_mode: normalizeWorkflowMode(plain.workflow_mode || DEFAULT_WORKFLOW_MODE),
    location_id: plain.location_id,
    location_name: plain.location_name,
    address_line: plain.address_line,
    latitude: toNumber(plain.latitude, null),
    longitude: toNumber(plain.longitude, null),
    delivery_radius_km: toNumber(plain.delivery_radius_km, 0),
    estimated_wait_minutes: toNumber(plain.estimated_wait_minutes, 15),
    supports_delivery: plain.supports_delivery !== false,
    supports_pickup: plain.supports_pickup !== false,
    supports_dine_in: plain.supports_dine_in !== false,
    store_delivery_fee: toNumber(plain.store_delivery_fee, 0),
    catalog_count: toNumber(plain.catalog_count, 0),
    storefront_cover_image_url: sanitizeStorefrontAssetUrlFromIndex({
        rawValue: plain.storefront_cover_image_url,
        tenantId: plain.tenant_id,
        assetType: 'cover'
    }),
    storefront_profile_image_url: sanitizeStorefrontAssetUrlFromIndex({
        rawValue: plain.storefront_profile_image_url,
        tenantId: plain.tenant_id,
        assetType: 'profile'
    }),
    storefront_tagline: toTrimmedString(plain.storefront_tagline, 120),
    storefront_about: toTrimmedString(plain.storefront_about, 1000),
    storefront_phone: toTrimmedString(plain.storefront_phone, 50),
    storefront_email: toTrimmedString(plain.storefront_email, 120),
    storefront_hours: toTrimmedString(plain.storefront_hours, 120),
    storefront_why_choose_us: parseJsonArray(plain.storefront_why_choose_us).map((entry) => toTrimmedString(entry, 120)).filter(Boolean),
    storefront_social_links: parseJsonObject(plain.storefront_social_links) || null,
    storefront_review_highlights: parseJsonArray(plain.storefront_review_highlights)
        .map((entry) => {
            const comment = toTrimmedString(entry?.comment, 280);
            if (!comment) return null;
            return {
                reviewer_name: toTrimmedString(entry?.reviewer_name, 80),
                rating: Number.isFinite(Number(entry?.rating)) ? Number(entry.rating) : null,
                comment
            };
        })
        .filter(Boolean),
    storefront_promo: parseJsonObject(plain.storefront_promo) || null,
    storefront_ui_v2_enabled: parseBoolean(plain.storefront_ui_v2_enabled, false),
    storefront_categories: normalizeStringList(plain.storefront_categories, 12, 60),
    storefront_gallery_images: normalizeStorefrontGalleryImages(plain.storefront_gallery_images),
    storefront_delivery_partners: normalizeStorefrontDeliveryPartners(plain.storefront_delivery_partners),
    storefront_follow_enabled: parseBoolean(plain.storefront_follow_enabled, false),
    storefront_share_enabled: parseBoolean(plain.storefront_share_enabled, false),
    storefront_review_summary: normalizeStorefrontReviewSummary(plain.storefront_review_summary),
    customer_access_mode: plain.customer_access_mode || 'catalog',
    effective_customer_access_mode: effectiveCustomerAccessMode,
    max_customer_access_mode: plain.max_customer_access_mode || 'catalog',
    inventory_display_mode: plain.inventory_display_mode || 'availability',
    inventory_low_stock_display_threshold: toNumber(plain.inventory_low_stock_display_threshold, 5),
    access_capabilities: accessCapabilities,
    access_limitation_reason: plain.access_limitation_reason || null,
    customer_access_modes_enabled: customerAccessModesEnabled,
    active_location_snapshot: parseJsonArray(plain.active_location_snapshot),
    item_search_snapshot: parseJsonArray(plain.item_search_snapshot),
    search_snapshot_version: toNumber(plain.search_snapshot_version, 0)
};
};

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

    const entries = (rows || []).map(toPlainEntry);
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
            if (!publicSearchTextMatches(item?.text, normalizedSearch)) return;

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
            const matched = publicSearchTextMatches([
                entry?.tenant_name,
                entry?.slug,
                entry?.address_line,
                entry?.location_name
            ].filter(Boolean).join(' '), search);
            if (matched) tenantFieldMatches.add(String(entry.tenant_id || ''));
        });

        rows = rows.filter((entry) => {
            const tenantId = String(entry?.tenant_id || '');
            const storeMatch = tenantFieldMatches.has(tenantId);
            const itemMeta = itemMatchByTenant.get(tenantId) || null;
            const itemExists = Boolean(itemMeta);
            const includeOutOfStockForTenant = stockFilter === 'include_out_of_stock';
            const itemEligible = itemExists && (
                includeOutOfStockForTenant
                || itemMeta.has_in_stock_match === true
            );

            if (resultMode === 'item_only') return itemEligible;
            if (resultMode === 'store_only') return storeMatch;
            return storeMatch || itemEligible;
        });
    } else {
        rows = rows.filter(hasUsableCoordinates);
    }

    rows = rows.map((entry) => {
        const tenantId = String(entry?.tenant_id || '');
        const storeMatch = search ? tenantFieldMatches.has(tenantId) : false;
        const itemMeta = search ? (itemMatchByTenant.get(tenantId) || null) : null;
        const includeOutOfStockForTenant = stockFilter === 'include_out_of_stock';
        const itemEligible = Boolean(itemMeta) && (
            includeOutOfStockForTenant
            || itemMeta.has_in_stock_match === true
        );
        const locationCandidateIds = itemEligible
            ? (
                includeOutOfStockForTenant
                    ? itemMeta.matching_location_ids
                    : itemMeta.in_stock_location_ids
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
        const anchorLatitude = Number.isFinite(Number(anchorLocation?.latitude))
            ? Number(anchorLocation.latitude)
            : (hasUsableCoordinates(entry) ? Number(entry.latitude) : null);
        const anchorLongitude = Number.isFinite(Number(anchorLocation?.longitude))
            ? Number(anchorLocation.longitude)
            : (hasUsableCoordinates(entry) ? Number(entry.longitude) : null);
        const hasAnchorCoordinates = Number.isFinite(anchorLatitude) && Number.isFinite(anchorLongitude);
        const distance = withDistance && hasAnchorCoordinates
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
        const version = getStorefrontDiscoveryCacheVersion();
        const signature = await getStorefrontDiscoverySharedSignature();
        const cacheKey = buildDiscoveryProfileCacheKey({
            slug: normalizedSlug,
            version,
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
        const hasMaterializedProfileFields = hasMaterializedStorefrontProfileColumns(row);
        const entry = toPlainEntry(row);
        let profileSettings = await readStorefrontProfileSettings({
            tenantId: entry.tenant_id,
            cacheVersion: version,
            cacheSignature: signature
        });
        if (hasMaterializedProfileFields) {
            profileSettings = Object.fromEntries(Object.entries(profileSettings).filter(([key]) => (
                [
                    'customer_access_mode',
                    'effective_customer_access_mode',
                    'max_customer_access_mode',
                    'inventory_display_mode',
                    'inventory_low_stock_display_threshold',
                    'access_capabilities',
                    'access_limitation_reason',
                    'customer_access_modes_enabled',
                    'store_has_no_location',
                    'map_publication_disabled'
                ].includes(key)
            )));
        }
        const indexedAsNoLocation = !hasUsableCoordinates(entry)
            && (entry.location_id === null || entry.location_id === undefined || entry.location_id === '');
        const enriched = {
            ...entry,
            ...profileSettings,
            store_has_no_location: profileSettings.store_has_no_location === true || indexedAsNoLocation,
            map_publication_disabled: profileSettings.map_publication_disabled === true || indexedAsNoLocation
        };
        await writeRedisCacheEntry(cacheKey, enriched, DISCOVERY_PROFILE_REDIS_CACHE_TTL_SECONDS);
        return enriched;
    }
};

assertStorefrontDiscoveryRepositoryContract(storefrontDiscoveryRepository);
