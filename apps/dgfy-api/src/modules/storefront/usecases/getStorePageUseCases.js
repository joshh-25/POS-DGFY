import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// getStorePageUseCases.js — Clean Architecture Application layer for the
// PUBLIC store page + product listing read (STF-02), mirroring
// ../../products/usecases/productUseCases.js's self-contained convention.
// Resolves the discovery row for a handle (landlord dgfy_core), then reads
// the tenant catalog through the injected productRepository (Phase 8's
// ../../products/repositories/productRepository.js), keyed by the
// discovery row's business_id — exactly like every other module that needs
// tenant-scoped data (never a second, divergent tenant-resolution path).

const validationError = (message) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400 }
);

const storeNotFoundError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'Store not found.',
    { statusCode: 404 }
);

/**
 * Duck-types on `error.name === 'TenantDatabaseUnavailableError'` rather
 * than importing productRepository.js's class directly — mirrors
 * productUseCases.js's self-contained convention.
 * @param {Error} error
 */
const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

const noTenantDatabaseError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'No tenant database is registered for this store.',
    { statusCode: 404, details: { error_code: 'NO_TENANT_DATABASE' } }
);

const mapTenantDatabaseError = (error) => {
    if (error.reason === 'missing' || error.reason === 'not_configured') {
        return noTenantDatabaseError();
    }
    return new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        error.message,
        { statusCode: 503, details: { error_code: 'TENANT_DATABASE_UNAVAILABLE', reason: error.reason } }
    );
};

/**
 * @param {{repository, productRepository}} deps
 */
export function buildGetStorePageUseCase({ repository, productRepository }) {
    return async (input = {}) => {
        const handle = typeof input.handle === 'string' ? input.handle.trim() : '';
        if (!handle) {
            return ApplicationResult.failure(validationError('handle is required.'));
        }

        const store = await repository.getStoreByHandle(handle);
        if (!store || !store.is_visible) {
            return ApplicationResult.failure(storeNotFoundError());
        }

        let products;
        try {
            const all = await productRepository.findAll(store.business_id);
            products = (all || [])
                .filter((product) => product.is_active)
                .map((product) => ({
                    id: product.id,
                    name: product.name,
                    category: product.category,
                    base_price: product.base_price,
                    folder_id: product.folder_id
                }));
        } catch (tenantError) {
            if (isTenantDatabaseUnavailableError(tenantError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(tenantError));
            }
            throw tenantError;
        }

        return ApplicationResult.success({
            store: {
                handle: store.handle,
                display_name: store.display_name,
                latitude: store.latitude != null ? Number(store.latitude) : null,
                longitude: store.longitude != null ? Number(store.longitude) : null
            },
            products
        });
    };
}

export default buildGetStorePageUseCase;
