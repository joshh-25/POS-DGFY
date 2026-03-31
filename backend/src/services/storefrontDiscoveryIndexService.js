import { Op } from 'sequelize';
import { Tenant, StorefrontDiscoveryIndex } from '../models/index.js';
import tenantConnector from '../utils/TenantConnector.js';
import { getTenantModels } from '../utils/tenantModelFactory.js';
import { buildVisibleWhere } from '../utils/softDeletePolicy.js';
import logger from '../config/logger.js';
import { bumpStorefrontDiscoveryCacheVersion } from './storefrontDiscoveryCacheState.js';
import { invalidateStorefrontDiscoverySharedSignatureCache } from './storefrontDiscoveryFreshnessService.js';
import { isCatalogItemVisible } from '../modules/shared/utils/catalogVisibilityPolicy.js';

const STOREFRONT_SETTING_KEYS = Object.freeze([
    'store_tenant_slug',
    'store_is_visible',
    'store_delivery_fee',
    'pos_open_status',
    'pos_wait_time_minutes'
]);

const parseBoolean = (value, fallback = false) => {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
};

const toNumber = (value, fallback = 0) => {
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

const toSettingsMap = (rows = []) => {
    const map = {};
    rows.forEach((row) => {
        const key = String(row?.setting_key || '').trim();
        if (!key) return;
        map[key] = row?.setting_value;
    });
    return map;
};

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

const toLocationPlain = (location) => (
    location && typeof location.toJSON === 'function'
        ? location.toJSON()
        : location
);

const buildTenantSnapshot = async (tenant) => {
    const tenantConnection = await tenantConnector.getConnection(tenant);
    const { SystemSetting, TenantLocation, Item, PosCatalogOverride } = getTenantModels(tenantConnection);

    const settingsRows = await SystemSetting.findAll({
        where: {
            setting_key: { [Op.in]: STOREFRONT_SETTING_KEYS }
        }
    });
    const settings = toSettingsMap(settingsRows || []);
    const slug = deriveStoreSlug(tenant, settings.store_tenant_slug);
    const isVisible = parseBoolean(settings.store_is_visible, true);

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
    const primaryLocation = explicitPrimaryLocation || fallbackPrimaryLocation;
    if (!primaryLocation) {
        return null;
    }
    const usedFallbackPrimary = Boolean(!explicitPrimaryLocation && fallbackPrimaryLocation);
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

    const location = toLocationPlain(primaryLocation);
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    const baseCatalogQuery = {
        where: buildVisibleWhere({}, { statusField: 'status', excludeInactiveStatus: true }),
        attributes: ['item_id', 'category', 'product_type']
    };
    const overrideInclude = PosCatalogOverride
        ? [{
            model: PosCatalogOverride,
            as: 'posCatalogOverride',
            attributes: ['pos_visible'],
            required: false
        }]
        : [];
    let catalogRows;
    try {
        catalogRows = await Item.findAll({
            ...baseCatalogQuery,
            include: overrideInclude
        });
    } catch (error) {
        if (!isMissingPosCatalogOverrideTableError(error)) {
            throw error;
        }
        catalogRows = await Item.findAll(baseCatalogQuery);
    }
    const catalogCount = (catalogRows || []).filter((row) => isCatalogItemVisible(toLocationPlain(row))).length;

    const storefrontOpen = parseBoolean(settings.pos_open_status, true) && location.is_open !== false;
    const now = new Date();
    return {
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        tenant_company_token: tenant.company_token,
        slug,
        storefront_open: storefrontOpen,
        is_visible: true,
        location_id: location.location_id || null,
        location_name: location.name || null,
        address_line: location.address_line || null,
        latitude,
        longitude,
        delivery_radius_km: toNumber(location.delivery_radius_km, 0),
        estimated_wait_minutes: toNumber(location.current_wait_time_minutes, toNumber(settings.pos_wait_time_minutes, 15)),
        supports_delivery: location.supports_delivery !== false,
        supports_pickup: location.supports_pickup !== false,
        supports_dine_in: location.supports_dine_in !== false,
        store_delivery_fee: toNumber(settings.store_delivery_fee, 0),
        catalog_count: Number(catalogCount) || 0,
        source_updated_at: now,
        last_synced_at: now,
        __used_fallback_primary: usedFallbackPrimary
    };
};

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

export const reconcileStorefrontDiscoveryIndex = async ({
    tenantIds = null,
    pruneStale = true,
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

    await mapWithConcurrency(tenants || [], concurrency, async (tenant) => {
        try {
            const snapshot = await buildTenantSnapshot(tenant);
            if (!snapshot) {
                await StorefrontDiscoveryIndex.destroy({ where: { tenant_id: tenant.id } });
                removed += 1;
                return;
            }

            if (snapshot.__used_fallback_primary === true) {
                fallbackPrimaryCount += 1;
            }
            delete snapshot.__used_fallback_primary;

            await StorefrontDiscoveryIndex.destroy({ where: { tenant_id: tenant.id } });
            await StorefrontDiscoveryIndex.create(snapshot);
            upserted += 1;
        } catch (error) {
            failed += 1;
            logger.warn('[StorefrontDiscoveryIndex] Tenant sync failed', {
                tenantId: tenant?.id || null,
                tenantName: tenant?.name || null,
                error: error?.message || 'unknown_error'
            });
        }
    });

    if (pruneStale && (!normalizedTenantIds || normalizedTenantIds.length === 0)) {
        const activeTenantIds = tenants.map((tenant) => tenant.id);
        const staleWhere = activeTenantIds.length > 0
            ? { tenant_id: { [Op.notIn]: activeTenantIds } }
            : {};
        const pruned = await StorefrontDiscoveryIndex.destroy({ where: staleWhere });
        removed += pruned;
    }

    if (upserted > 0 || removed > 0) {
        bumpStorefrontDiscoveryCacheVersion();
        invalidateStorefrontDiscoverySharedSignatureCache();
    }

    const result = {
        status: failed > 0 ? 'degraded' : 'healthy',
        upserted,
        removed,
        failed,
        fallbackPrimaryCount,
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
