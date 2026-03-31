import { StorefrontDiscoveryIndex, Tenant } from '../../../models/index.js';
import { reconcileStorefrontDiscoveryIndex } from '../../../services/storefrontDiscoveryIndexService.js';
import { getStorefrontDiscoveryCacheVersion } from '../../../services/storefrontDiscoveryCacheState.js';
import { getStorefrontDiscoverySharedSignature } from '../../../services/storefrontDiscoveryFreshnessService.js';
import { Op } from 'sequelize';
import tenantConnector from '../../../utils/TenantConnector.js';
import { getTenantModels } from '../../../utils/tenantModelFactory.js';
import { buildVisibleWhere } from '../../../utils/softDeletePolicy.js';
import logger from '../../../config/logger.js';
import { assertStorefrontDiscoveryRepositoryContract } from '../contracts/storefrontDiscoveryRepository.contract.js';
import { isCatalogItemVisible } from '../../shared/utils/catalogVisibilityPolicy.js';

const CACHE_TTL_MS = 30 * 1000;
let cache = {
    expiresAt: 0,
    entries: [],
    version: -1,
    signature: '0:0'
};
let emptyAutoRepairInFlight = false;

const normalizeSlug = (value) => String(value || '').trim().toLowerCase();
const shouldAutoRepairEmptyIndex = () => process.env.STOREFRONT_DISCOVERY_INDEX_AUTO_REPAIR_ON_EMPTY !== 'false';
const shouldEnableFanoutFallback = () => process.env.STOREFRONT_DISCOVERY_FANOUT_FALLBACK_ENABLED === 'true';
const SEARCH_FANOUT_CONCURRENCY = 4;

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
const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);
const isMissingPosCatalogOverrideTableError = (error) => {
    if (!error) return false;
    const code = error.original?.code || error.parent?.code || error.code;
    const message = String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '');
    return code === 'ER_NO_SUCH_TABLE' || message.includes('pos_catalog_overrides');
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
    catalog_count: toNumber(row.catalog_count, 0)
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

const loadAllEntries = async () => {
    const now = Date.now();
    const version = getStorefrontDiscoveryCacheVersion();
    const signature = await getStorefrontDiscoverySharedSignature();
    if (
        cache.expiresAt > now
        && Array.isArray(cache.entries)
        && cache.version === version
        && cache.signature === signature
    ) {
        return cache.entries;
    }

    let rows = await StorefrontDiscoveryIndex.findAll({
        where: { is_visible: true },
        order: [
            ['storefront_open', 'DESC'],
            ['tenant_name', 'ASC']
        ]
    });

    if ((!rows || rows.length === 0) && shouldAutoRepairEmptyIndex()) {
        await warmIndexOnEmpty();
        rows = await StorefrontDiscoveryIndex.findAll({
            where: { is_visible: true },
            order: [
                ['storefront_open', 'DESC'],
                ['tenant_name', 'ASC']
            ]
        });
    }

    // Transitional emergency fallback (disabled by default).
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

const getTenantIdsMatchingCatalogSearch = async (entries = [], search = '') => {
    const normalizedSearch = String(search || '').trim();
    if (!normalizedSearch) return new Set();

    const tenantIds = Array.from(new Set(
        (entries || [])
            .map((entry) => String(entry?.tenant_id || '').trim())
            .filter(Boolean)
    ));
    if (tenantIds.length === 0) return new Set();

    const tenants = await Tenant.findAll({
        where: {
            id: { [Op.in]: tenantIds },
            status: 'active'
        },
        attributes: ['id', 'name', 'company_token', 'db_name']
    });
    if (!Array.isArray(tenants) || tenants.length === 0) return new Set();

    const matches = await mapWithConcurrency(tenants, SEARCH_FANOUT_CONCURRENCY, async (tenant) => {
        try {
            const tenantConnection = await tenantConnector.getConnection(tenant);
            const { Item, PosCatalogOverride } = getTenantModels(tenantConnection);
            const where = buildVisibleWhere(
                {
                    [Op.or]: [
                        { name: { [Op.like]: `%${normalizedSearch}%` } },
                        { sku_code: { [Op.like]: `%${normalizedSearch}%` } },
                        { description: { [Op.like]: `%${normalizedSearch}%` } }
                    ]
                },
                { statusField: 'status', excludeInactiveStatus: true }
            );

            const includeOverride = PosCatalogOverride
                ? [{
                    model: PosCatalogOverride,
                    as: 'posCatalogOverride',
                    attributes: ['pos_visible'],
                    required: false
                }]
                : [];

            const findMatchingItems = async (include = []) => Item.findAll({
                where,
                attributes: ['item_id', 'name', 'category', 'product_type'],
                include,
                order: [['item_id', 'ASC']],
                limit: 100
            });

            if (!PosCatalogOverride) {
                const rows = await findMatchingItems([]);
                const hasVisibleMatch = (rows || [])
                    .map(toPlain)
                    .some((plain) => Boolean(plain) && isCatalogItemVisible(plain));
                return hasVisibleMatch ? String(tenant.id) : null;
            }

            let rows;
            try {
                rows = await findMatchingItems(includeOverride);
            } catch (error) {
                if (!isMissingPosCatalogOverrideTableError(error)) {
                    throw error;
                }
                rows = await findMatchingItems([]);
            }

            const hasVisibleMatch = (rows || [])
                .map(toPlain)
                .some((plain) => Boolean(plain) && isCatalogItemVisible(plain));
            return hasVisibleMatch ? String(tenant.id) : null;
        } catch (error) {
            logger.warn('[StorefrontDiscovery] Catalog search fanout failed for tenant', {
                tenantId: tenant?.id || null,
                error: error?.message || 'unknown_error'
            });
            return null;
        }
    });

    return new Set((matches || []).filter(Boolean));
};

const applyDiscoveryQuery = async (entries = [], query = {}) => {
    const search = String(query.search || '').trim().toLowerCase();
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, Number.parseInt(query.limit, 10) || 20));
    const lat = Number(query.latitude);
    const lng = Number(query.longitude);
    const withDistance = Number.isFinite(lat) && Number.isFinite(lng);

    let rows = entries;
    if (search) {
        const tenantFieldMatches = new Set(
            rows
                .filter((entry) => (
                    String(entry.tenant_name || '').toLowerCase().includes(search)
                    || String(entry.slug || '').toLowerCase().includes(search)
                    || String(entry.address_line || '').toLowerCase().includes(search)
                    || String(entry.location_name || '').toLowerCase().includes(search)
                ))
                .map((entry) => String(entry.tenant_id || ''))
        );
        const itemNameMatchTenantIds = await getTenantIdsMatchingCatalogSearch(rows, search);
        if (itemNameMatchTenantIds.size > 0) {
            rows = rows.filter((entry) => itemNameMatchTenantIds.has(String(entry.tenant_id || '')));
        } else {
            rows = rows.filter((entry) => tenantFieldMatches.has(String(entry.tenant_id || '')));
        }
    }

    rows = rows.map((entry) => {
        if (!withDistance) return { ...entry, distance_km: null };
        return {
            ...entry,
            distance_km: Number(distanceKm(lat, lng, entry.latitude, entry.longitude).toFixed(2))
        };
    });

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
        }
    };
};

export const storefrontDiscoveryRepository = {
    async listDiscovery(query = {}) {
        const entries = await loadAllEntries();
        return applyDiscoveryQuery(entries, query);
    },

    async getStorefrontBySlug(slug) {
        const normalizedSlug = normalizeSlug(slug);
        if (!normalizedSlug) return null;

        const row = await StorefrontDiscoveryIndex.findOne({
            where: {
                slug: normalizedSlug,
                is_visible: true
            }
        });

        if (!row) return null;
        const entry = toPlainEntry(row);
        if (!Number.isFinite(entry.latitude) || !Number.isFinite(entry.longitude)) return null;
        return entry;
    }
};

assertStorefrontDiscoveryRepositoryContract(storefrontDiscoveryRepository);
