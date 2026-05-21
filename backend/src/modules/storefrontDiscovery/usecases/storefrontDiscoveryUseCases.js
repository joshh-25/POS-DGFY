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
