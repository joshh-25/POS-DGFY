import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const buildListStorefrontDiscoveryUseCase = ({ storefrontDiscoveryRepository }) => {
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
            return ok({
                stores: result.rows || [],
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

export const toMapPinSourceRow = (store = {}) => ({
    title: String(store.tenant_name || '').trim(),
    latitude: Number(store.latitude),
    longitude: Number(store.longitude),
    subtitle: String(store.location_name || '').trim(),
    description: buildMapPinDescription(store),
    category: String(store.workflow_mode || '').trim(),
    address: String(store.address_line || '').trim(),
    slug: String(store.slug || '').trim(),
    storefront_url: store.slug ? `https://dgfy.ph/store/${store.slug}` : '',
    tenant_id: store.tenant_id,
    location_id: store.location_id,
    storefront_open: store.storefront_open === true,
    supports_delivery: store.supports_delivery === true,
    supports_pickup: store.supports_pickup === true,
    supports_dine_in: store.supports_dine_in === true,
    catalog_count: Number(store.catalog_count || 0)
});

export const buildListStorefrontMapPinsUseCase = ({ storefrontDiscoveryRepository }) => {
    return async ({ query = {} } = {}) => {
        if (query && (typeof query !== 'object' || Array.isArray(query))) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const result = await storefrontDiscoveryRepository.listDiscovery({
                ...query,
                limit: query.limit || 100,
                include_match_meta: false
            });
            const rows = (result.rows || [])
                .filter((store) => Number.isFinite(Number(store.latitude)) && Number.isFinite(Number(store.longitude)))
                .map(toMapPinSourceRow);

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

export const buildGetStorefrontProfileUseCase = ({ storefrontDiscoveryRepository }) => {
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

            return ok(store);
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error?.message || 'Failed to load storefront profile',
                { statusCode: 500 }
            ));
        }
    };
};
