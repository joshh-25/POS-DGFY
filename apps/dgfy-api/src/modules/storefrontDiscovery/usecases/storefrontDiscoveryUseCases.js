import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

// An external listing has no DGFY tenant/domain — its storefront_url must always
// come from the master-admin-supplied external_storefront_url, never from the
// dgfy.ph fallback below (that fallback is the concrete spoofing vector ADR 0037
// warns about: it would otherwise present an off-platform store as if it had a
// DGFY storefront).
const resolveStorefrontUrl = (row = {}, canonicalOrigin = null) => (
    row.entity_type === 'external_listing'
        ? (row.external_storefront_url || '')
        : (canonicalOrigin || (row.slug ? `https://dgfy.ph/store/${row.slug}` : ''))
);

const withCanonicalOrigins = async (rows, storefrontDomainRepository) => {
    const source = rows || [];
    if (!storefrontDomainRepository) {
        return source.map((row) => (
            row.entity_type === 'external_listing'
                ? { ...row, storefront_url: resolveStorefrontUrl(row) }
                : row
        ));
    }
    const tenantIds = [...new Set(source.map((row) => String(row.tenant_id || '')).filter(Boolean))];
    const origins = await storefrontDomainRepository.listActiveCanonicalOriginsByTenantIds(tenantIds);
    return source.map((row) => ({
        ...row,
        storefront_url: resolveStorefrontUrl(row, origins.get(String(row.tenant_id)))
    }));
};

export const buildListStorefrontDiscoveryUseCase = ({ storefrontDiscoveryRepository, storefrontDomainRepository = null }) => {
    return async ({ query = {} } = {}) => {
        if (query && (typeof query !== 'object' || Array.isArray(query))) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const result = await storefrontDiscoveryRepository.listDiscovery(query || {});
            const stores = await withCanonicalOrigins(result.rows || [], storefrontDomainRepository);
            return ok({
                stores,
                pagination: result.pagination || {
                    page: 1,
                    limit: 20,
                    total: 0,
                    totalPages: 1
                }
            });
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error?.message || 'Failed to list storefront discovery entries',
                { statusCode: 500 }
            ));
        }
    };
};

const buildMapPinDescription = (store = {}) => {
    const parts = [
        store.storefront_tagline,
        store.storefront_about
    ].map((entry) => String(entry || '').trim()).filter(Boolean);
    return parts.join(' ').slice(0, 500);
};

const hasMapCoordinates = (store = {}) => (
    store.latitude !== null
    && store.latitude !== undefined
    && store.latitude !== ''
    && store.longitude !== null
    && store.longitude !== undefined
    && store.longitude !== ''
    && Number.isFinite(Number(store.latitude))
    && Number.isFinite(Number(store.longitude))
);

export const toMapPinSourceRow = (store = {}) => ({
    title: String(store.tenant_name || '').trim(),
    latitude: Number(store.latitude),
    longitude: Number(store.longitude),
    subtitle: String(store.location_name || '').trim(),
    description: buildMapPinDescription(store),
    category: String(store.workflow_mode || '').trim(),
    address: String(store.address_line || '').trim(),
    slug: String(store.slug || '').trim(),
    entity_type: store.entity_type === 'external_listing' ? 'external_listing' : 'dgfy_native',
    storefront_url: store.entity_type === 'external_listing'
        ? (store.external_storefront_url || store.storefront_url || '')
        : (store.storefront_url || (store.slug ? `https://dgfy.ph/store/${store.slug}` : '')),
    tenant_id: store.tenant_id,
    location_id: store.location_id,
    storefront_open: store.storefront_open === true,
    supports_delivery: store.supports_delivery === true,
    supports_pickup: store.supports_pickup === true,
    supports_dine_in: store.supports_dine_in === true,
    catalog_count: Number(store.catalog_count || 0)
});

const normalizeMapPinItemLimit = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed)) return 5;
    return Math.max(1, Math.min(10, parsed));
};

const toPositiveInteger = (value) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getLocationScopedAvailableItems = (store = {}, itemLimit = 5) => {
    const targetLocationId = toPositiveInteger(store.location_id);
    const seen = new Set();
    const available = [];

    const snapshotRows = Array.isArray(store.item_search_snapshot) ? store.item_search_snapshot : [];
    snapshotRows.forEach((item) => {
        const name = String(item?.item_name || '').trim();
        if (!name) return;

        const inStockLocationIds = Array.isArray(item?.in_stock_location_ids)
            ? item.in_stock_location_ids.map(toPositiveInteger).filter(Boolean)
            : [];
        const isAvailableAtPin = targetLocationId
            ? inStockLocationIds.includes(targetLocationId)
            : inStockLocationIds.length > 0;
        if (!isAvailableAtPin) return;

        const itemId = toPositiveInteger(item?.item_id);
        const dedupeKey = itemId ? `id:${itemId}` : `name:${name.toLowerCase()}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);

        available.push({
            name,
            category: String(item?.category || '').trim(),
            availability_status: 'available'
        });
    });

    return {
        available_item_count: available.length,
        available_items: available.slice(0, itemLimit)
    };
};

const toMapPinSourceRowWithItems = (store = {}, { includeItems = false, itemLimit = 5 } = {}) => {
    const pin = toMapPinSourceRow(store);
    if (!includeItems) return pin;

    const { available_item_count, available_items } = getLocationScopedAvailableItems(
        store,
        normalizeMapPinItemLimit(itemLimit)
    );

    return {
        ...pin,
        available_item_count,
        available_item_names: available_items.map((item) => item.name).join(', '),
        available_items
    };
};

export const buildListStorefrontMapPinsUseCase = ({ storefrontDiscoveryRepository, storefrontDomainRepository = null }) => {
    return async ({ query = {} } = {}) => {
        if (query && (typeof query !== 'object' || Array.isArray(query))) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const {
                include_items: includeItems = false,
                item_limit: itemLimit = 5,
                ...discoveryQuery
            } = query || {};
            const result = await storefrontDiscoveryRepository.listDiscovery({
                ...discoveryQuery,
                limit: discoveryQuery.limit || 100,
                include_match_meta: false
            });
            const enrichedRows = await withCanonicalOrigins(result.rows || [], storefrontDomainRepository);
            const rows = enrichedRows
                .filter(hasMapCoordinates)
                .map((store) => toMapPinSourceRowWithItems(store, {
                    includeItems: includeItems === true,
                    itemLimit
                }));

            return ok({
                pins: rows,
                pagination: result.pagination || {
                    page: 1,
                    limit: 100,
                    total: rows.length,
                    totalPages: 1
                }
            });
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error?.message || 'Failed to list storefront map pins',
                { statusCode: 500 }
            ));
        }
    };
};

export const buildGetStorefrontProfileUseCase = ({ storefrontDiscoveryRepository, storefrontDomainRepository = null }) => {
    return async ({ slug }) => {
        const normalizedSlug = String(slug || '').trim().toLowerCase();
        if (!normalizedSlug) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'slug is required',
                { statusCode: 400 }
            ));
        }

        try {
            const store = await storefrontDiscoveryRepository.getStorefrontBySlug(normalizedSlug);
            if (!store) {
                return fail(new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Store not found',
                    { statusCode: 404 }
                ));
            }

            const [enriched] = await withCanonicalOrigins([store], storefrontDomainRepository);
            return ok(enriched);
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error?.message || 'Failed to load storefront profile',
                { statusCode: 500 }
            ));
        }
    };
};

// Master-admin-only: create or replace an entity_type: 'external_listing' row —
// a store that transacts on a different platform. See buildTenantSnapshot's
// sibling, buildExternalListingSnapshot (storefrontDiscoveryIndexService.js), for
// why this has no tenant DB to derive from.
export const buildUpsertExternalStorefrontListingUseCase = ({ storefrontDiscoveryRepository }) => {
    return async ({ slug, payload = {} } = {}) => {
        const normalizedSlug = String(slug || payload?.slug || '').trim().toLowerCase();
        if (!normalizedSlug) {
            return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'slug is required', { statusCode: 400 }));
        }
        if (!String(payload?.tenant_name || '').trim()) {
            return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'tenant_name is required', { statusCode: 400 }));
        }
        if (!String(payload?.external_storefront_url || '').trim()) {
            return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'external_storefront_url is required', { statusCode: 400 }));
        }

        try {
            const result = await storefrontDiscoveryRepository.upsertExternalListing({
                slug: normalizedSlug,
                payload
            });

            if (result?.status === 'conflict') {
                return fail(new DomainError(
                    DomainErrorCode.CONFLICT,
                    `Slug "${normalizedSlug}" is already in use by a native storefront`,
                    { statusCode: 409 }
                ));
            }
            if (result?.status === 'invalid') {
                return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'slug is required', { statusCode: 400 }));
            }

            return ok({ slug: normalizedSlug, status: result.status });
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error?.message || 'Failed to save external storefront listing',
                { statusCode: 500 }
            ));
        }
    };
};

export const buildDeleteExternalStorefrontListingUseCase = ({ storefrontDiscoveryRepository }) => {
    return async ({ slug } = {}) => {
        const normalizedSlug = String(slug || '').trim().toLowerCase();
        if (!normalizedSlug) {
            return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'slug is required', { statusCode: 400 }));
        }

        try {
            const result = await storefrontDiscoveryRepository.deleteExternalListingBySlug(normalizedSlug);
            if (result?.status === 'not_found') {
                return fail(new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'External listing not found',
                    { statusCode: 404 }
                ));
            }
            return ok({ slug: normalizedSlug, status: result?.status || 'removed' });
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error?.message || 'Failed to delete external storefront listing',
                { statusCode: 500 }
            ));
        }
    };
};

export const buildListExternalStorefrontListingsUseCase = ({ storefrontDiscoveryRepository }) => {
    return async () => {
        try {
            const listings = await storefrontDiscoveryRepository.listExternalListings();
            return ok({ listings });
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error?.message || 'Failed to list external storefront listings',
                { statusCode: 500 }
            ));
        }
    };
};
