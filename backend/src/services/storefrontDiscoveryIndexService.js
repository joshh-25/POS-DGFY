import { Op } from 'sequelize';
import { Tenant, StorefrontDiscoveryIndex, StorefrontHandleReservation } from '../models/index.js';
import tenantConnector from '../utils/TenantConnector.js';
import { getTenantModels } from '../utils/tenantModelFactory.js';
import { buildVisibleWhere } from '../utils/softDeletePolicy.js';
import logger from '../config/logger.js';
import { bumpStorefrontDiscoveryCacheVersion } from './storefrontDiscoveryCacheState.js';
import { invalidateStorefrontDiscoverySharedSignatureCache } from './storefrontDiscoveryFreshnessService.js';
import {
    getCatalogOverride,
    getStorefrontCatalogOverride,
    resolveStorefrontCatalogVisibility
} from '../modules/shared/utils/catalogVisibilityPolicy.js';
import { expandPublicSearchText } from '../modules/shared/utils/publicSearchAliasPolicy.js';
import { normalizeStorefrontAssetPath, normalizeStorefrontAssetUrl } from '../modules/shared/utils/storefrontAssetPolicy.js';
import {
    formatStorefrontBusinessHoursDisplay,
    getStorefrontBusinessHoursStatus
} from '../modules/shared/utils/storefrontBusinessHours.js';
import { DEFAULT_WORKFLOW_MODE, normalizeWorkflowMode } from '../modules/shared/constants/workflowModes.js';
import {
    CUSTOMER_ACCESS_SETTING_KEYS,
    isCustomerAccessModesEnabled,
    resolveAccessPolicyFromSettings
} from '../modules/shared/utils/customerAccessPolicy.js';
import { parsePublicCommercialPromos } from '../modules/shared/utils/commercialPromoPolicy.js';
import { syncTenantGeoCatalog } from '../modules/geoSearch/services/geoCatalogSyncService.js';

const STOREFRONT_SETTING_KEYS = Object.freeze([
    'ops_workflow_mode',
    'store_tenant_slug',
    'store_is_visible',
    'store_has_no_location',
    'store_delivery_fee',
    'pos_wait_time_minutes',
    'storefront_cover_image_url',
    'storefront_profile_image_url',
    'storefront_tagline',
    'storefront_about',
    'storefront_phone',
    'storefront_email',
    'storefront_hours',
    'storefront_why_choose_us',
    'storefront_social_links',
    'storefront_review_highlights',
    'storefront_promo',
    'storefront_promos',
    'storefront_ui_v2_enabled',
    'storefront_categories',
    'storefront_gallery_images',
    'storefront_delivery_partners',
    'storefront_follow_enabled',
    'storefront_share_enabled',
    'storefront_review_summary',
    ...CUSTOMER_ACCESS_SETTING_KEYS
]);
const SEARCH_SNAPSHOT_VERSION = 1;

const parseBoolean = (value, fallback = false) => {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
};

const toNumber = (value, fallback = 0) => {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeSlug = (value) => String(value || '').trim().toLowerCase();
const slugify = (value) => normalizeSlug(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

const deriveStoreSlug = (tenant, configuredSlug) => {
    const explicit = slugify(configuredSlug);
    if (explicit) return explicit.slice(0, 80);

    const fromName = slugify(tenant?.name || '');
    const idSuffix = String(tenant?.id || '')
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase()
        .slice(0, 6);

    const base = fromName || 'store';
    const composed = idSuffix ? `${base}-${idSuffix}` : base;
    return composed.slice(0, 80);
};

// A short, consistently-sized slug for affiliate share links/QR codes: the store's
// canonical slug can vary a lot in length (full business name), which makes the
// encoded QR bulky and inconsistent. This truncates the name portion to 5 chars and
// keeps the same tenant-id suffix, so the QR payload stays compact and predictable.
const deriveAffiliateSlug = (tenant) => {
    const fromName = slugify(tenant?.name || '').slice(0, 5).replace(/-+$/, '');
    const idSuffix = String(tenant?.id || '')
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase()
        .slice(0, 6);

    const base = fromName || 'store';
    const composed = idSuffix ? `${base}-${idSuffix}` : base;
    return composed.slice(0, 80);
};

const toSettingsMap = (rows = []) => {
    const map = {};
    rows.forEach((row) => {
        const key = String(row?.setting_key || '').trim();
        if (!key) return;
        map[key] = row?.setting_value;
    });
    return map;
};

const sanitizeStorefrontAssetUrl = ({ tenant, key, rawValue }) => {
    const raw = String(rawValue || '').trim();
    const normalized = normalizeStorefrontAssetUrl(raw);
    if (raw && !normalized) {
        logger.warn('[StorefrontDiscoveryIndex] Sanitized unsafe storefront asset URL from tenant settings', {
            event_type: 'security_signal',
            signal_code: 'storefront_asset_setting_sanitized',
            tenantId: tenant?.id || null,
            setting_key: key
        });
    }
    return normalized || null;
};

const isMissingTableError = (error, tableName) => {
    if (!error) return false;
    const code = error.original?.code || error.parent?.code || error.code;
    const message = String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '');
    return code === 'ER_NO_SUCH_TABLE' && (!tableName || message.includes(tableName));
};

const isMissingItemLocationStockSchemaError = (error) => {
    if (!error) return false;
    const code = error.original?.code || error.parent?.code || error.code;
    const message = String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '');
    if (code === 'ER_NO_SUCH_TABLE' && message.includes('item_location_stocks')) {
        return true;
    }
    if (code === 'ER_BAD_FIELD_ERROR' && (
        message.includes('item_location_stocks')
        || message.includes("Unknown column 'quantity_on_hand'")
        || message.includes("Unknown column 'location_id'")
        || message.includes("Unknown column 'item_id'")
    )) {
        return true;
    }
    return false;
};

const reserveStorefrontHandleForTenant = async ({ tenantId, handle, source = 'discovery_sync' } = {}) => {
    const normalizedTenantId = String(tenantId || '').trim();
    const normalizedHandle = String(handle || '').trim().toLowerCase();
    if (!normalizedTenantId || !normalizedHandle || typeof StorefrontHandleReservation?.findOne !== 'function') return;

    try {
        const existingByHandle = await StorefrontHandleReservation.findOne({
            where: { handle: normalizedHandle }
        });
        if (existingByHandle) {
            const payload = existingByHandle.toJSON ? existingByHandle.toJSON() : existingByHandle;
            if (String(payload.tenant_id || '') !== normalizedTenantId) {
                logger.warn('[StorefrontDiscoveryIndex] Storefront handle reservation conflict during sync', {
                    event_type: 'storefront_handle_reservation_conflict',
                    tenantId: normalizedTenantId,
                    conflictingTenantId: payload.tenant_id || null,
                    handle: normalizedHandle
                });
            }
            return;
        }

        const existingByTenant = await StorefrontHandleReservation.findOne({
            where: { tenant_id: normalizedTenantId }
        });
        if (existingByTenant) {
            await existingByTenant.update({
                handle: normalizedHandle,
                source
            });
            return;
        }

        await StorefrontHandleReservation.create({
            tenant_id: normalizedTenantId,
            handle: normalizedHandle,
            source
        });
    } catch (error) {
        if (isMissingTableError(error, 'storefront_handle_reservations')) return;
        logger.warn('[StorefrontDiscoveryIndex] Failed to reserve storefront handle during sync', {
            event_type: 'storefront_handle_reservation_failed',
            tenantId: normalizedTenantId,
            handle: normalizedHandle,
            error: error?.message || 'unknown_error'
        });
    }
};

const mapWithConcurrency = async (items = [], limit = 4, worker) => {
    const normalizedLimit = Math.max(1, Number(limit) || 1);
    const results = new Array(items.length);
    let cursor = 0;

    const runWorker = async () => {
        while (true) {
            const current = cursor;
            cursor += 1;
            if (current >= items.length) return;
            results[current] = await worker(items[current], current);
        }
    };

    const workers = Array.from({ length: Math.min(normalizedLimit, items.length) }, () => runWorker());
    await Promise.all(workers);
    return results;
};

const toLocationPlain = (location) => (
    location && typeof location.toJSON === 'function'
        ? location.toJSON()
        : location
);

const normalizeSearchToken = (value) => String(value || '').trim().toLowerCase();
const toTrimmedString = (value, maxLen = 255) => String(value || '').trim().slice(0, maxLen);
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
const normalizeStringList = (value, maxItems = 8, maxLength = 120) => parseJsonArray(value)
    .map((entry) => toTrimmedString(entry, maxLength))
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
    const rows = parseJsonArray(value);
    const normalized = [];
    rows.forEach((entry) => {
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

const buildItemSearchText = (item = {}) => (
    expandPublicSearchText([
        item?.name,
        item?.sku_code,
        item?.description,
        item?.category,
        item?.product_type,
        item?.serviceDetail?.service_category,
        item?.service_detail?.service_category,
        item?.serviceDetail?.service_area_type,
        item?.service_detail?.service_area_type
    ]
        .filter((value) => value != null && value !== '')
        .map((value) => normalizeSearchToken(value))
        .join(' '))
);

const buildTenantSnapshot = async (tenant) => {
    const tenantConnection = await tenantConnector.getConnection(tenant);
    const {
        SystemSetting,
        TenantLocation,
        Item,
        PosCatalogOverride,
        StorefrontCatalogOverride,
        StorefrontLocationItemOverride,
        ServiceItemDetail,
        ItemLocationStock
    } = getTenantModels(tenantConnection);

    const settingsRows = await SystemSetting.findAll({
        where: {
            setting_key: { [Op.in]: STOREFRONT_SETTING_KEYS }
        }
    });
    const settings = toSettingsMap(settingsRows || []);
    const slug = deriveStoreSlug(tenant, settings.store_tenant_slug);
    // Note: the affiliate slug is intentionally NOT passed through
    // reserveStorefrontHandleForTenant — that table enforces one handle per tenant
    // (unique on tenant_id) and already holds the canonical `slug` reservation.
    // Persisting affiliate_slug on this row is itself the durable "on record" copy.
    const affiliateSlug = deriveAffiliateSlug(tenant);
    await reserveStorefrontHandleForTenant({
        tenantId: tenant?.id,
        handle: slug,
        source: 'discovery_sync'
    });
    const isVisible = parseBoolean(settings.store_is_visible, true);
    const storeHasNoLocation = parseBoolean(settings.store_has_no_location, false);

    if (!isVisible) {
        return null;
    }

    const activeLocations = await TenantLocation.findAll({
        where: {
            is_active: true
        },
        order: [
            ['is_primary_storefront', 'DESC'],
            ['is_open', 'DESC'],
            ['updated_at', 'DESC'],
            ['location_id', 'DESC']
        ]
    });
    const explicitPrimaryLocations = (activeLocations || []).filter((location) => location?.is_primary_storefront === true);
    if (explicitPrimaryLocations.length > 1) {
        logger.warn('[StorefrontDiscoveryIndex] Multiple active primary storefront flags detected; highest priority location selected', {
            event_type: 'storefront_primary_duplicate_detected',
            metric_name: 'storefront_primary_duplicate_count',
            metric_value: explicitPrimaryLocations.length,
            tenantId: tenant?.id || null,
            tenantName: tenant?.name || null
        });
    }

    const explicitPrimaryLocation = explicitPrimaryLocations[0] || null;
    const fallbackPrimaryLocation = !explicitPrimaryLocation
        ? (activeLocations?.[0] || null)
        : null;
    const primaryLocation = storeHasNoLocation ? null : (explicitPrimaryLocation || fallbackPrimaryLocation);
    if (!storeHasNoLocation && !primaryLocation) {
        return null;
    }
    const usedFallbackPrimary = Boolean(!storeHasNoLocation && !explicitPrimaryLocation && fallbackPrimaryLocation);
    if (usedFallbackPrimary) {
        logger.warn('[StorefrontDiscoveryIndex] Active location found without explicit primary flag', {
            event_type: 'storefront_primary_fallback_used',
            metric_name: 'storefront_primary_fallback_count',
            metric_value: 1,
            tenantId: tenant?.id || null,
            tenantName: tenant?.name || null,
            selectedLocationId: fallbackPrimaryLocation?.location_id || null
        });
    }

    const location = storeHasNoLocation ? null : toLocationPlain(primaryLocation);
    const allActiveLocationIds = (activeLocations || [])
        .map((entry) => Number(toLocationPlain(entry).location_id))
        .filter((locationId) => Number.isInteger(locationId) && locationId > 0);
    const activeLocationSnapshot = (activeLocations || []).map((entry) => {
        const plainLocation = toLocationPlain(entry);
        return {
            location_id: plainLocation.location_id || null,
            name: plainLocation.name || null,
            address_line: plainLocation.address_line || null,
            latitude: Number(plainLocation.latitude),
            longitude: Number(plainLocation.longitude),
            is_open: plainLocation.is_open !== false,
            is_active: plainLocation.is_active !== false,
            is_primary_storefront: plainLocation.is_primary_storefront === true,
            supports_delivery: plainLocation.supports_delivery !== false,
            supports_pickup: plainLocation.supports_pickup !== false,
            supports_dine_in: plainLocation.supports_dine_in !== false,
            allow_out_of_stock_sales: plainLocation.allow_out_of_stock_sales === true
        };
    }).filter((entry) => Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude));
    const latitude = storeHasNoLocation ? null : Number(location.latitude);
    const longitude = storeHasNoLocation ? null : Number(location.longitude);
    if (!storeHasNoLocation && (!Number.isFinite(latitude) || !Number.isFinite(longitude))) {
        return null;
    }

    const baseCatalogQuery = {
        where: buildVisibleWhere({}, { statusField: 'status', excludeInactiveStatus: true }),
        attributes: ['item_id', 'name', 'sku_code', 'description', 'category', 'product_type', 'current_stock']
    };
    const storefrontOverrideInclude = StorefrontCatalogOverride
        ? [{
            model: StorefrontCatalogOverride,
            as: 'storefrontCatalogOverride',
            attributes: ['storefront_visible'],
            required: false
        }]
        : [];
    const legacyPosOverrideInclude = PosCatalogOverride
        ? [{
            model: PosCatalogOverride,
            as: 'posCatalogOverride',
            attributes: ['pos_visible'],
            required: false
        }]
        : [];
    const serviceDetailInclude = ServiceItemDetail
        ? [{
            model: ServiceItemDetail,
            as: 'serviceDetail',
            attributes: ['bookable', 'visible_in_storefront', 'service_category', 'service_area_type'],
            required: false
        }]
        : [];
    let catalogRows;
    let useLegacyPosFallback = false;
    const loadCatalogRowsWithServiceFallback = async (overrideIncludes = []) => {
        try {
            return await Item.findAll({
                ...baseCatalogQuery,
                include: [
                    ...overrideIncludes,
                    ...serviceDetailInclude
                ]
            });
        } catch (error) {
            if (!serviceDetailInclude.length || !isMissingTableError(error, 'service_item_details')) {
                throw error;
            }
            logger.warn('[StorefrontDiscoveryIndex] service_item_details table unavailable; indexing catalog without service metadata', {
                event_type: 'storefront_discovery_service_detail_fallback',
                tenantId: tenant?.id || null,
                tenantName: tenant?.name || null
            });
            return Item.findAll({
                ...baseCatalogQuery,
                include: [
                    ...overrideIncludes
                ]
            });
        }
    };
    const loadCatalogRowsWithLegacyPosFallback = async () => {
        useLegacyPosFallback = true;
        try {
            return await loadCatalogRowsWithServiceFallback(legacyPosOverrideInclude);
        } catch (fallbackError) {
            if (!isMissingTableError(fallbackError, 'pos_catalog_overrides')) {
                throw fallbackError;
            }
            useLegacyPosFallback = false;
            return loadCatalogRowsWithServiceFallback([]);
        }
    };
    if (!StorefrontCatalogOverride) {
        catalogRows = await loadCatalogRowsWithLegacyPosFallback();
    } else {
        try {
            catalogRows = await loadCatalogRowsWithServiceFallback(storefrontOverrideInclude);
        } catch (error) {
            if (!isMissingTableError(error, 'storefront_catalog_overrides')) {
                throw error;
            }
            catalogRows = await loadCatalogRowsWithLegacyPosFallback();
        }
    }
    const visibleCatalogRows = (catalogRows || [])
        .map((row) => toLocationPlain(row))
        .filter((row) => resolveStorefrontCatalogVisibility({
            item: row,
            override: getStorefrontCatalogOverride(row),
            legacyPosOverride: useLegacyPosFallback ? getCatalogOverride(row) : null
        }));
    const catalogCount = visibleCatalogRows.length;

    const visibleItemIds = visibleCatalogRows.map((row) => Number(row.item_id)).filter((itemId) => Number.isInteger(itemId) && itemId > 0);
    const activeLocationIds = allActiveLocationIds;

    let locationStockRows = [];
    if (ItemLocationStock && visibleItemIds.length > 0 && activeLocationIds.length > 0) {
        try {
            locationStockRows = await ItemLocationStock.findAll({
                where: {
                    item_id: { [Op.in]: visibleItemIds },
                    location_id: { [Op.in]: activeLocationIds }
                },
                attributes: ['item_id', 'location_id', 'quantity_on_hand']
            });
        } catch (error) {
            if (!isMissingItemLocationStockSchemaError(error)) {
                throw error;
            }
            logger.warn('[StorefrontDiscoveryIndex] item_location_stocks schema unavailable; indexing catalog with global stock fallback', {
                event_type: 'storefront_discovery_location_stock_fallback',
                tenantId: tenant?.id || null,
                tenantName: tenant?.name || null
            });
            locationStockRows = [];
        }
    }

    const stockByItemId = new Map();
    (locationStockRows || []).forEach((row) => {
        const plain = toLocationPlain(row);
        const itemId = Number(plain.item_id);
        const locationId = Number(plain.location_id);
        const quantity = Number(plain.quantity_on_hand || 0);
        if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isInteger(locationId) || locationId <= 0) {
            return;
        }
        const bucket = stockByItemId.get(itemId) || {
            matchingLocationIds: new Set(),
            inStockLocationIds: new Set()
        };
        bucket.matchingLocationIds.add(locationId);
        if (quantity > 0) {
            bucket.inStockLocationIds.add(locationId);
        }
        stockByItemId.set(itemId, bucket);
    });

    const disabledLocationIdsByItemId = new Map();
    if (StorefrontLocationItemOverride && visibleItemIds.length > 0 && activeLocationIds.length > 0) {
        try {
            const overrideRows = await StorefrontLocationItemOverride.findAll({
                where: {
                    item_id: { [Op.in]: visibleItemIds },
                    location_id: { [Op.in]: activeLocationIds },
                    storefront_available: false
                },
                attributes: ['item_id', 'location_id']
            });
            (overrideRows || []).forEach((row) => {
                const plain = toLocationPlain(row);
                const itemId = Number(plain.item_id);
                const locationId = Number(plain.location_id);
                if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isInteger(locationId) || locationId <= 0) {
                    return;
                }
                const bucket = disabledLocationIdsByItemId.get(itemId) || new Set();
                bucket.add(locationId);
                disabledLocationIdsByItemId.set(itemId, bucket);
            });
        } catch (error) {
            if (!isMissingTableError(error, 'storefront_location_item_overrides')) {
                throw error;
            }
            logger.warn('[StorefrontDiscoveryIndex] storefront_location_item_overrides unavailable; indexing without branch availability overrides', {
                event_type: 'storefront_discovery_location_item_override_fallback',
                tenantId: tenant?.id || null,
                tenantName: tenant?.name || null
            });
        }
    }

    const customerAccessFeatureEnabled = isCustomerAccessModesEnabled({
        tenantId: tenant?.id,
        companyToken: tenant?.company_token,
        tenantName: tenant?.name,
        slug
    });
    const accessPolicy = resolveAccessPolicyFromSettings({
        ...settings,
        tenant_onboarding_progress: parseJsonObject(settings.tenant_onboarding_progress) || null
    }, {
        featureEnabled: customerAccessFeatureEnabled
    });
    const canExposeCatalog = !customerAccessFeatureEnabled || accessPolicy.access_capabilities.catalog === true;

    const fallbackPrimaryLocationId = storeHasNoLocation ? null : Number(location.location_id);
    const itemSearchSnapshot = canExposeCatalog ? visibleCatalogRows
        .map((row) => {
            const itemId = Number(row.item_id);
            const stockBucket = stockByItemId.get(itemId);
            const disabledLocationIds = disabledLocationIdsByItemId.get(itemId) || new Set();
            const matchingLocationIds = stockBucket
                ? Array.from(stockBucket.matchingLocationIds).filter((locationId) => !disabledLocationIds.has(Number(locationId)))
                : activeLocationIds.filter((locationId) => !disabledLocationIds.has(Number(locationId)));
            const isServiceItem = String(row.category || '').trim().toLowerCase() === 'service';
            const inStockLocationIds = isServiceItem
                ? matchingLocationIds
                : (stockBucket
                    ? Array.from(stockBucket.inStockLocationIds).filter((locationId) => !disabledLocationIds.has(Number(locationId)))
                    : (Number(row.current_stock || 0) > 0
                        && Number.isInteger(fallbackPrimaryLocationId)
                        && fallbackPrimaryLocationId > 0
                        && !disabledLocationIds.has(Number(fallbackPrimaryLocationId))
                    ? [fallbackPrimaryLocationId]
                    : []));
            const text = buildItemSearchText(row);
            if (!text || (!storeHasNoLocation && matchingLocationIds.length === 0)) return null;
            return {
                item_id: itemId,
                item_name: row.name || null,
                category: row.category || null,
                text,
                matching_location_ids: matchingLocationIds,
                in_stock_location_ids: inStockLocationIds
            };
        })
        .filter(Boolean) : [];

    const storefrontHoursStatus = getStorefrontBusinessHoursStatus(settings.storefront_hours);
    const storefrontOpen = (storeHasNoLocation || location.is_open !== false)
        && storefrontHoursStatus.is_open_now !== false;
    const storefrontWhyChooseUs = parseJsonArray(settings.storefront_why_choose_us)
        .map((entry) => toTrimmedString(entry, 120))
        .filter(Boolean)
        .slice(0, 6);
    const storefrontSocialLinksRaw = parseJsonObject(settings.storefront_social_links) || null;
    const storefrontSocialLinks = storefrontSocialLinksRaw
        ? {
            messenger: toTrimmedString(storefrontSocialLinksRaw.messenger, 255),
            facebook: toTrimmedString(storefrontSocialLinksRaw.facebook, 255),
            instagram: toTrimmedString(storefrontSocialLinksRaw.instagram, 255)
        }
        : null;
    const storefrontReviewHighlights = parseJsonArray(settings.storefront_review_highlights)
        .map((entry) => {
            const comment = toTrimmedString(entry?.comment, 280);
            if (!comment) return null;
            const rating = Number(entry?.rating);
            const normalized = {
                reviewer_name: toTrimmedString(entry?.reviewer_name, 80),
                comment
            };
            if (Number.isFinite(rating) && rating >= 1 && rating <= 5) {
                normalized.rating = rating;
            }
            return normalized;
        })
        .filter(Boolean)
        .slice(0, 8);
    const storefrontPromoRaw = parseJsonObject(settings.storefront_promo) || null;
    const storefrontPromos = parsePublicCommercialPromos(parseJsonArray(settings.storefront_promos));
    const storefrontPromo = storefrontPromoRaw
        ? {
            title: toTrimmedString(storefrontPromoRaw.title, 100),
            subtitle: toTrimmedString(storefrontPromoRaw.subtitle, 160),
            badge: toTrimmedString(storefrontPromoRaw.badge, 60),
            validity_text: toTrimmedString(storefrontPromoRaw.validity_text, 120),
            active: storefrontPromoRaw.active === true
        }
        : null;
    const storefrontUiV2Enabled = parseBoolean(settings.storefront_ui_v2_enabled, false);
    const storefrontCategories = normalizeStringList(settings.storefront_categories, 12, 60);
    const storefrontGalleryImages = normalizeStorefrontGalleryImages(settings.storefront_gallery_images);
    const storefrontDeliveryPartners = normalizeStorefrontDeliveryPartners(settings.storefront_delivery_partners);
    const storefrontFollowEnabled = parseBoolean(settings.storefront_follow_enabled, false);
    const storefrontShareEnabled = parseBoolean(settings.storefront_share_enabled, false);
    const storefrontReviewSummary = normalizeStorefrontReviewSummary(settings.storefront_review_summary);
    const now = new Date();
    return {
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        tenant_company_token: tenant.company_token,
        entity_type: 'dgfy_native',
        slug,
        affiliate_slug: affiliateSlug,
        storefront_open: storefrontOpen,
        workflow_mode: normalizeWorkflowMode(settings.ops_workflow_mode || DEFAULT_WORKFLOW_MODE),
        is_visible: true,
        location_id: storeHasNoLocation ? null : (location.location_id || null),
        location_name: storeHasNoLocation ? null : (location.name || null),
        address_line: storeHasNoLocation ? null : (location.address_line || null),
        latitude,
        longitude,
        delivery_radius_km: storeHasNoLocation ? 0 : toNumber(location.delivery_radius_km, 0),
        estimated_wait_minutes: storeHasNoLocation ? toNumber(settings.pos_wait_time_minutes, 15) : toNumber(location.current_wait_time_minutes, toNumber(settings.pos_wait_time_minutes, 15)),
        supports_delivery: storeHasNoLocation ? true : location.supports_delivery !== false,
        supports_pickup: storeHasNoLocation ? true : location.supports_pickup !== false,
        supports_dine_in: storeHasNoLocation ? true : location.supports_dine_in !== false,
        store_delivery_fee: toNumber(settings.store_delivery_fee, 0),
        catalog_count: canExposeCatalog ? (Number(catalogCount) || 0) : 0,
        customer_access_mode: accessPolicy.customer_access_mode,
        effective_customer_access_mode: accessPolicy.effective_customer_access_mode,
        max_customer_access_mode: accessPolicy.max_customer_access_mode,
        inventory_display_mode: accessPolicy.inventory_display_mode,
        inventory_low_stock_display_threshold: accessPolicy.inventory_low_stock_display_threshold,
        access_capabilities: accessPolicy.access_capabilities,
        access_limitation_reason: accessPolicy.limitation_reason,
        customer_access_modes_enabled: accessPolicy.customer_access_modes_enabled,
        storefront_cover_image_url: sanitizeStorefrontAssetUrl({
            tenant,
            key: 'storefront_cover_image_url',
            rawValue: settings.storefront_cover_image_url
        }),
        storefront_profile_image_url: sanitizeStorefrontAssetUrl({
            tenant,
            key: 'storefront_profile_image_url',
            rawValue: settings.storefront_profile_image_url
        }),
        storefront_tagline: toTrimmedString(settings.storefront_tagline, 120),
        storefront_about: toTrimmedString(settings.storefront_about, 1000),
        storefront_phone: toTrimmedString(settings.storefront_phone, 50),
        storefront_email: toTrimmedString(settings.storefront_email, 120),
        storefront_hours: toTrimmedString(formatStorefrontBusinessHoursDisplay(settings.storefront_hours), 120),
        storefront_why_choose_us: storefrontWhyChooseUs,
        storefront_social_links: storefrontSocialLinks,
        storefront_review_highlights: storefrontReviewHighlights,
        storefront_promo: storefrontPromo,
        storefront_promos: storefrontPromos,
        storefront_ui_v2_enabled: storefrontUiV2Enabled,
        storefront_categories: storefrontCategories,
        storefront_gallery_images: storefrontGalleryImages,
        storefront_delivery_partners: storefrontDeliveryPartners,
        storefront_follow_enabled: storefrontFollowEnabled,
        storefront_share_enabled: storefrontShareEnabled,
        storefront_review_summary: storefrontReviewSummary,
        active_location_snapshot: activeLocationSnapshot,
        item_search_snapshot: itemSearchSnapshot,
        search_snapshot_version: SEARCH_SNAPSHOT_VERSION,
        source_updated_at: now,
        last_synced_at: now,
        __used_fallback_primary: usedFallbackPrimary
    };
};

// Builds a storefront_discovery_index row for a store that transacts on a
// different platform (entity_type: 'external_listing'). Unlike buildTenantSnapshot,
// this has no tenant DB to read from — every field comes from the master-admin
// supplied payload, and there is no Tenant row, tenant_id, or company_token to
// anchor it to (ADR 0037's Axis 3 "external listing" tier).
const buildExternalListingSnapshot = (payload = {}) => {
    const now = new Date();
    return {
        tenant_id: null,
        tenant_name: toTrimmedString(payload.tenant_name, 255),
        tenant_company_token: null,
        entity_type: 'external_listing',
        external_provider: payload.external_provider ? toTrimmedString(payload.external_provider, 60) : null,
        external_reference_id: payload.external_reference_id ? toTrimmedString(payload.external_reference_id, 120) : null,
        external_storefront_url: normalizeExternalHttpUrl(payload.external_storefront_url, 500),
        slug: normalizeSlug(payload.slug),
        affiliate_slug: null,
        storefront_open: payload.storefront_open !== false,
        workflow_mode: normalizeWorkflowMode(payload.workflow_mode || DEFAULT_WORKFLOW_MODE),
        is_visible: payload.is_visible !== false,
        location_id: null,
        location_name: payload.location_name ? toTrimmedString(payload.location_name, 255) : null,
        address_line: payload.address_line ? toTrimmedString(payload.address_line, 255) : null,
        latitude: Number.isFinite(Number(payload.latitude)) ? Number(payload.latitude) : null,
        longitude: Number.isFinite(Number(payload.longitude)) ? Number(payload.longitude) : null,
        delivery_radius_km: toNumber(payload.delivery_radius_km, 0),
        estimated_wait_minutes: toNumber(payload.estimated_wait_minutes, 15),
        supports_delivery: payload.supports_delivery !== false,
        supports_pickup: payload.supports_pickup !== false,
        supports_dine_in: payload.supports_dine_in !== false,
        store_delivery_fee: toNumber(payload.store_delivery_fee, 0),
        catalog_count: 0,
        storefront_cover_image_url: payload.storefront_cover_image_url
            ? normalizeExternalHttpUrl(payload.storefront_cover_image_url, 500)
            : null,
        storefront_profile_image_url: payload.storefront_profile_image_url
            ? normalizeExternalHttpUrl(payload.storefront_profile_image_url, 500)
            : null,
        storefront_tagline: payload.storefront_tagline ? toTrimmedString(payload.storefront_tagline, 120) : null,
        storefront_about: payload.storefront_about ? toTrimmedString(payload.storefront_about, 1000) : null,
        storefront_phone: payload.storefront_phone ? toTrimmedString(payload.storefront_phone, 50) : null,
        storefront_hours: payload.storefront_hours ? toTrimmedString(payload.storefront_hours, 120) : null,
        storefront_categories: Array.isArray(payload.storefront_categories)
            ? normalizeStringList(payload.storefront_categories, 12, 60)
            : null,
        source_updated_at: now,
        last_synced_at: now
    };
};

// Create-or-replace by slug. Refuses to touch a slug that already belongs to a
// dgfy_native row (a real tenant's storefront) rather than silently hijacking it.
export const upsertExternalStorefrontListing = async ({ slug, payload = {} } = {}) => {
    const normalizedSlug = normalizeSlug(slug || payload?.slug);
    if (!normalizedSlug) {
        return { status: 'invalid', reason: 'missing_slug' };
    }

    const existing = await StorefrontDiscoveryIndex.findOne({ where: { slug: normalizedSlug } });
    if (existing && existing.entity_type !== 'external_listing') {
        return { status: 'conflict', reason: 'slug_belongs_to_native_store', slug: normalizedSlug };
    }

    const snapshot = buildExternalListingSnapshot({ ...payload, slug: normalizedSlug });
    await StorefrontDiscoveryIndex.destroy({ where: { slug: normalizedSlug, entity_type: 'external_listing' } });
    const created = await StorefrontDiscoveryIndex.create(snapshot);
    bumpStorefrontDiscoveryCacheVersion();
    invalidateStorefrontDiscoverySharedSignatureCache();

    return {
        status: existing ? 'updated' : 'created',
        slug: normalizedSlug,
        row: created
    };
};

export const removeExternalStorefrontListing = async ({ slug } = {}) => {
    const normalizedSlug = normalizeSlug(slug);
    if (!normalizedSlug) {
        return { status: 'skipped', reason: 'missing_slug' };
    }

    const deleted = await StorefrontDiscoveryIndex.destroy({
        where: { slug: normalizedSlug, entity_type: 'external_listing' }
    });
    if (deleted > 0) {
        bumpStorefrontDiscoveryCacheVersion();
        invalidateStorefrontDiscoverySharedSignatureCache();
    }

    return { status: deleted > 0 ? 'removed' : 'not_found', slug: normalizedSlug, deleted };
};

export const getExternalStorefrontListingBySlug = async ({ slug } = {}) => {
    const normalizedSlug = normalizeSlug(slug);
    if (!normalizedSlug) return null;
    return StorefrontDiscoveryIndex.findOne({
        where: { slug: normalizedSlug, entity_type: 'external_listing' }
    });
};

export const listExternalStorefrontListings = async () => (
    StorefrontDiscoveryIndex.findAll({
        where: { entity_type: 'external_listing' },
        order: [['tenant_name', 'ASC']]
    })
);

export const getStorefrontDiscoveryIndexSnapshotForTenant = async ({ tenantId } = {}) => {
    const normalizedTenantId = String(tenantId || '').trim();
    if (!normalizedTenantId) return null;

    const row = await StorefrontDiscoveryIndex.findOne({
        where: { tenant_id: normalizedTenantId }
    });

    if (!row) return null;
    return {
        tenant_id: row.tenant_id,
        slug: row.slug,
        location_id: row.location_id,
        location_name: row.location_name,
        last_synced_at: row.last_synced_at
    };
};

export const syncStorefrontDiscoveryIndexForTenant = async ({ tenantId } = {}) => {
    const normalizedTenantId = String(tenantId || '').trim();
    if (!normalizedTenantId) {
        return { status: 'skipped', reason: 'missing_tenant_id' };
    }

    const tenant = await Tenant.findOne({
        where: { id: normalizedTenantId, status: 'active' },
        attributes: ['id', 'name', 'company_token', 'db_name', 'status']
    });

    if (!tenant) {
        const deleted = await StorefrontDiscoveryIndex.destroy({ where: { tenant_id: normalizedTenantId } });
        if (deleted > 0) {
            bumpStorefrontDiscoveryCacheVersion();
            invalidateStorefrontDiscoverySharedSignatureCache();
        }
        return { status: 'removed', tenantId: normalizedTenantId };
    }

    const snapshot = await buildTenantSnapshot(tenant);
    if (!snapshot) {
        const deleted = await StorefrontDiscoveryIndex.destroy({ where: { tenant_id: normalizedTenantId } });
        if (deleted > 0) {
            bumpStorefrontDiscoveryCacheVersion();
            invalidateStorefrontDiscoverySharedSignatureCache();
        }
        return { status: 'removed', tenantId: normalizedTenantId };
    }

    const usedFallbackPrimary = snapshot.__used_fallback_primary === true;
    delete snapshot.__used_fallback_primary;

    await StorefrontDiscoveryIndex.destroy({ where: { tenant_id: normalizedTenantId } });
    await StorefrontDiscoveryIndex.create(snapshot);
    bumpStorefrontDiscoveryCacheVersion();
    invalidateStorefrontDiscoverySharedSignatureCache();
    return {
        status: 'upserted',
        tenantId: normalizedTenantId,
        slug: snapshot.slug,
        locationId: snapshot.location_id || null,
        usedFallbackPrimary
    };
};

export const removeStorefrontDiscoveryIndexForTenant = async ({ tenantId } = {}) => {
    const normalizedTenantId = String(tenantId || '').trim();
    if (!normalizedTenantId) {
        return { status: 'skipped', reason: 'missing_tenant_id' };
    }

    const deleted = await StorefrontDiscoveryIndex.destroy({ where: { tenant_id: normalizedTenantId } });
    if (deleted > 0) {
        bumpStorefrontDiscoveryCacheVersion();
        invalidateStorefrontDiscoverySharedSignatureCache();
    }

    return {
        status: 'removed',
        tenantId: normalizedTenantId,
        deleted
    };
};

export const reconcileStorefrontDiscoveryIndex = async ({
    tenantIds = null,
    pruneStale = true,
    dryRun = false,
    concurrency = Number.parseInt(process.env.STOREFRONT_DISCOVERY_INDEX_SYNC_CONCURRENCY || '4', 10) || 4
} = {}) => {
    const startedAt = Date.now();
    const normalizedTenantIds = Array.isArray(tenantIds)
        ? tenantIds.map((id) => String(id || '').trim()).filter(Boolean)
        : null;

    const where = { status: 'active' };
    if (normalizedTenantIds && normalizedTenantIds.length > 0) {
        where.id = { [Op.in]: normalizedTenantIds };
    }

    const tenants = await Tenant.findAll({
        where,
        attributes: ['id', 'name', 'company_token', 'db_name', 'status']
    });

    let upserted = 0;
    let removed = 0;
    let failed = 0;
    let fallbackPrimaryCount = 0;
    const failures = [];

    await mapWithConcurrency(tenants || [], concurrency, async (tenant) => {
        try {
            const snapshot = await buildTenantSnapshot(tenant);
            if (!snapshot) {
                if (!dryRun) {
                    await StorefrontDiscoveryIndex.destroy({ where: { tenant_id: tenant.id } });
                }
                removed += 1;
                return;
            }

            if (snapshot.__used_fallback_primary === true) {
                fallbackPrimaryCount += 1;
            }
            delete snapshot.__used_fallback_primary;

            if (!dryRun) {
                await StorefrontDiscoveryIndex.destroy({ where: { tenant_id: tenant.id } });
                await StorefrontDiscoveryIndex.create(snapshot);
                // Fire-and-forget: keeps geo-search's radius+alias matching roughly in
                // sync with the Discovery index without slowing down reconciliation
                // (including the synchronous auto-repair path in storefrontDiscoveryRepository).
                syncTenantGeoCatalog({
                    tenantId: tenant.id,
                    itemSearchSnapshot: snapshot.item_search_snapshot
                }).catch((error) => {
                    logger.warn('[StorefrontDiscoveryIndex] Geo catalog sync failed', {
                        tenantId: tenant?.id || null,
                        tenantName: tenant?.name || null,
                        error: error?.message || 'unknown_error'
                    });
                });
            }
            upserted += 1;
        } catch (error) {
            failed += 1;
            failures.push({
                tenantId: tenant?.id || null,
                tenantName: tenant?.name || null,
                error: error?.message || 'unknown_error'
            });
            logger.warn('[StorefrontDiscoveryIndex] Tenant sync failed', {
                tenantId: tenant?.id || null,
                tenantName: tenant?.name || null,
                error: error?.message || 'unknown_error'
            });
        }
    });

    if (pruneStale && (!normalizedTenantIds || normalizedTenantIds.length === 0)) {
        const activeTenantIds = tenants.map((tenant) => tenant.id);
        // Scoped to entity_type: 'dgfy_native' — external-listing rows have no
        // Tenant row of their own (tenant_id is null) and must never be pruned by
        // this tenant-liveness sweep. Explicit here rather than relying on
        // Op.notIn's NULL semantics to exclude them.
        const staleWhere = activeTenantIds.length > 0
            ? { entity_type: 'dgfy_native', tenant_id: { [Op.notIn]: activeTenantIds } }
            : { entity_type: 'dgfy_native' };
        const pruned = dryRun
            ? await StorefrontDiscoveryIndex.count({ where: staleWhere })
            : await StorefrontDiscoveryIndex.destroy({ where: staleWhere });
        removed += pruned;
    }

    if (!dryRun && (upserted > 0 || removed > 0)) {
        bumpStorefrontDiscoveryCacheVersion();
        invalidateStorefrontDiscoverySharedSignatureCache();
    }

    const result = {
        status: failed > 0 ? 'degraded' : 'healthy',
        dryRun,
        upserted,
        removed,
        failed,
        fallbackPrimaryCount,
        failures,
        tenantCount: tenants.length,
        durationMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString()
    };
    if (fallbackPrimaryCount > 0) {
        logger.warn('[StorefrontDiscoveryIndex] Reconciliation used fallback primary locations', {
            event_type: 'storefront_primary_fallback_summary',
            metric_name: 'storefront_primary_fallback_count',
            metric_value: fallbackPrimaryCount,
            tenant_count: tenants.length
        });
    }

    return result;
};

let reconciliationInterval = null;

export const startStorefrontDiscoveryIndexReconciliationScheduler = () => {
    const enabled = process.env.STOREFRONT_DISCOVERY_INDEX_RECONCILE_ENABLED !== 'false';
    if (!enabled) {
        return;
    }

    const minutes = Number.parseInt(process.env.STOREFRONT_DISCOVERY_INDEX_RECONCILE_MINUTES || '15', 10);
    const intervalMs = Math.max(1, Number.isFinite(minutes) ? minutes : 15) * 60 * 1000;

    reconcileStorefrontDiscoveryIndex().then((result) => {
        logger.info('[StorefrontDiscoveryIndex] Startup reconciliation completed', result);
    }).catch((error) => {
        logger.warn('[StorefrontDiscoveryIndex] Startup reconciliation failed', {
            error: error?.message || 'unknown_error'
        });
    });

    reconciliationInterval = setInterval(() => {
        reconcileStorefrontDiscoveryIndex().then((result) => {
            logger.info('[StorefrontDiscoveryIndex] Scheduled reconciliation completed', result);
        }).catch((error) => {
            logger.warn('[StorefrontDiscoveryIndex] Scheduled reconciliation failed', {
                error: error?.message || 'unknown_error'
            });
        });
    }, intervalMs);

    if (typeof reconciliationInterval.unref === 'function') {
        reconciliationInterval.unref();
    }
};

export const stopStorefrontDiscoveryIndexReconciliationScheduler = () => {
    if (reconciliationInterval) {
        clearInterval(reconciliationInterval);
        reconciliationInterval = null;
    }
};
