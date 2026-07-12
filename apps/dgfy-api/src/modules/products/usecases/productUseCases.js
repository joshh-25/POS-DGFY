import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// productUseCases.js — Clean Architecture Application layer for the
// tenant-scoped product domain (PRD-01/PRD-02/BOK-01), mirroring
// ../../businesses/usecases/locationUseCases.js. Each builder receives its
// dependencies via closure (repository = ProductRepository,
// businessRepository = the businesses module's BusinessRepository, used
// ONLY for membership/role access control since membership lives in the
// landlord dgfy_core database) and every use case always returns an
// ApplicationResult. No HTTP concerns, no direct model imports.

export const PRODUCT_CATEGORIES = Object.freeze(['food', 'service', 'retail']);
export const INVENTORY_MODES = Object.freeze(['basic_inventory', 'non_stock']);

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
);

const notFoundError = (message = 'Product not found.') => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    message,
    { statusCode: 404 }
);

const businessNotFoundError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'Business not found.',
    { statusCode: 404 }
);

const forbiddenError = (message) => new DomainError(
    DomainErrorCode.AUTHORIZATION_FAILED,
    message,
    { statusCode: 403 }
);

const noTenantDatabaseError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'No tenant database is registered for this business.',
    { statusCode: 404, details: { error_code: 'NO_TENANT_DATABASE' } }
);

/**
 * Duck-types on `error.name === 'TenantDatabaseUnavailableError'` rather
 * than importing productRepository.js's class directly — mirrors
 * locationUseCases.js's self-contained convention.
 * @param {Error} error
 */
const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

/**
 * Maps a thrown TenantDatabaseUnavailableError to a stable
 * ApplicationResult-ready DomainError. `missing`/`not_configured` surface as
 * 404; every other reason surfaces as 503 SERVICE_UNAVAILABLE.
 * @param {Error} error
 */
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

const normalizeText = (value) => {
    const trimmed = String(value || '').trim().replace(/\s+/g, ' ');
    return trimmed || null;
};

const isFiniteNumberOrNull = (value) => value === null || value === undefined || Number.isFinite(Number(value));

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

/**
 * Shared access-control helper (mirrors ../../businesses/usecases/
 * locationUseCases.js's private requireMembership() — duplicated here
 * rather than imported so this module stays self-contained). Resolves the
 * requester's membership and optionally enforces a specific role.
 * @returns {Promise<{membership?: Object, error?: DomainError}>}
 */
async function requireMembership(businessRepository, businessId, accountId, { role } = {}) {
    const membership = await businessRepository.getMembership(accountId, businessId);
    if (!membership || membership.status !== 'active') {
        return { error: forbiddenError('You are not a member of this business.') };
    }
    if (role && membership.role !== role) {
        return { error: forbiddenError(`Only a business ${role} can perform this action.`) };
    }
    return { membership };
}

/**
 * Verifies the business exists and, when requestingAccountId is supplied,
 * that the requester satisfies the given membership/role requirement.
 * @returns {Promise<{error?: DomainError}>}
 */
async function guardBusinessAccess(businessRepository, businessId, requestingAccountId, { role } = {}) {
    const business = await businessRepository.findById(businessId);
    if (!business) {
        return { error: businessNotFoundError() };
    }
    if (requestingAccountId) {
        const { error } = await requireMembership(businessRepository, businessId, requestingAccountId, { role });
        if (error) return { error };
    }
    return {};
}

/**
 * Create product use case (PRD-01/PRD-02). Owner role required.
 * @param {{repository, businessRepository}} deps
 */
export function buildCreateProductUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, folder_id = null, base_price = null } = input;
        const name = normalizeText(input.name);
        const category = input.category;
        const inventoryMode = input.inventory_mode || 'non_stock';

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        if (!name) {
            return ApplicationResult.failure(validationError('name is required.'));
        }
        if (!PRODUCT_CATEGORIES.includes(category)) {
            return ApplicationResult.failure(validationError(
                `category must be one of: ${PRODUCT_CATEGORIES.join(', ')}.`
            ));
        }
        if (!INVENTORY_MODES.includes(inventoryMode)) {
            return ApplicationResult.failure(validationError(
                `inventory_mode must be one of: ${INVENTORY_MODES.join(', ')}.`
            ));
        }
        if (!isFiniteNumberOrNull(base_price)) {
            return ApplicationResult.failure(validationError('base_price must be numeric.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId, { role: 'owner' });
        if (error) return ApplicationResult.failure(error);

        try {
            const product = await repository.create({
                businessId,
                name,
                category,
                inventory_mode: inventoryMode,
                folder_id,
                base_price
            });
            return ApplicationResult.success({ product });
        } catch (tenantError) {
            if (isTenantDatabaseUnavailableError(tenantError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(tenantError));
            }
            throw tenantError;
        }
    };
}

/**
 * @param {{repository, businessRepository}} deps
 */
export function buildListProductsUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, includeInactive } = input;
        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const all = await repository.findAll(businessId);
            const products = includeInactive ? all : all.filter((product) => product.is_active);
            return ApplicationResult.success({ products });
        } catch (tenantError) {
            if (isTenantDatabaseUnavailableError(tenantError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(tenantError));
            }
            throw tenantError;
        }
    };
}

/**
 * Owner role required.
 * @param {{repository, businessRepository}} deps
 */
export function buildUpdateProductUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, productId, requestingAccountId, updates = {} } = input;
        if (!businessId || productId === undefined || productId === null) {
            return ApplicationResult.failure(validationError('businessId and productId are required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId, { role: 'owner' });
        if (error) return ApplicationResult.failure(error);

        try {
            const existing = await repository.findById(businessId, productId);
            if (!existing) {
                return ApplicationResult.failure(notFoundError());
            }

            const patch = {};
            const has = (key) => Object.prototype.hasOwnProperty.call(updates, key);

            if (has('name')) {
                const name = normalizeText(updates.name);
                if (!name) return ApplicationResult.failure(validationError('name cannot be empty.'));
                patch.name = name;
            }
            if (has('category')) {
                if (!PRODUCT_CATEGORIES.includes(updates.category)) {
                    return ApplicationResult.failure(validationError(
                        `category must be one of: ${PRODUCT_CATEGORIES.join(', ')}.`
                    ));
                }
                patch.category = updates.category;
            }
            if (has('inventory_mode')) {
                if (!INVENTORY_MODES.includes(updates.inventory_mode)) {
                    return ApplicationResult.failure(validationError(
                        `inventory_mode must be one of: ${INVENTORY_MODES.join(', ')}.`
                    ));
                }
                patch.inventory_mode = updates.inventory_mode;
            }
            if (has('folder_id')) {
                patch.folder_id = updates.folder_id;
            }
            if (has('base_price')) {
                if (!isFiniteNumberOrNull(updates.base_price)) {
                    return ApplicationResult.failure(validationError('base_price must be numeric.'));
                }
                patch.base_price = updates.base_price;
            }
            if (has('is_active')) {
                if (typeof updates.is_active !== 'boolean') {
                    return ApplicationResult.failure(validationError('is_active must be a boolean.'));
                }
                patch.is_active = updates.is_active;
            }

            const updated = await repository.update(businessId, productId, patch);
            return ApplicationResult.success({ product: updated });
        } catch (tenantError) {
            if (isTenantDatabaseUnavailableError(tenantError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(tenantError));
            }
            throw tenantError;
        }
    };
}

/**
 * Marks a Service-category product bookable with slot_duration_minutes and
 * concurrent_capacity (BOK-01). Owner role required. Rejects any product
 * whose category is not 'service' — Booking (08-07) only ever consumes
 * bookable config on Service products.
 * @param {{repository, businessRepository}} deps
 */
export function buildSetProductBookableUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, productId, requestingAccountId, slot_duration_minutes, concurrent_capacity } = input;
        if (!businessId || productId === undefined || productId === null) {
            return ApplicationResult.failure(validationError('businessId and productId are required.'));
        }
        if (!isPositiveInteger(slot_duration_minutes)) {
            return ApplicationResult.failure(validationError('slot_duration_minutes must be a positive integer.'));
        }
        if (!isPositiveInteger(concurrent_capacity)) {
            return ApplicationResult.failure(validationError('concurrent_capacity must be a positive integer.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId, { role: 'owner' });
        if (error) return ApplicationResult.failure(error);

        try {
            const existing = await repository.findById(businessId, productId);
            if (!existing) {
                return ApplicationResult.failure(notFoundError());
            }
            if (existing.category !== 'service') {
                return ApplicationResult.failure(validationError(
                    'Only a service-category product can be marked bookable.'
                ));
            }

            const updated = await repository.update(businessId, productId, {
                is_bookable: true,
                slot_duration_minutes,
                concurrent_capacity
            });
            return ApplicationResult.success({ product: updated });
        } catch (tenantError) {
            if (isTenantDatabaseUnavailableError(tenantError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(tenantError));
            }
            throw tenantError;
        }
    };
}
