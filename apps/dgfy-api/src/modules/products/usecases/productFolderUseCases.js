import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// productFolderUseCases.js — Clean Architecture Application layer for the
// tenant-scoped product_folders domain (PRD-03, D-14: flat, no parent_id),
// mirroring ../../businesses/usecases/locationUseCases.js. Self-contained
// per project convention (helpers duplicated rather than imported from
// ./productUseCases.js).

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
);

const conflictError = (message, details = null) => new DomainError(
    DomainErrorCode.CONFLICT,
    message,
    { statusCode: 409, details }
);

const notFoundError = (message = 'Product folder not found.') => new DomainError(
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

const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

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

/**
 * Shared access-control helper (duplicated from ./productUseCases.js per
 * project convention — each usecases module stays self-contained).
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
 * Create product folder use case (PRD-03). Owner role required. Folder
 * names are per-tenant-unique (case-insensitive) — a duplicate name returns
 * a 409 conflict rather than a raw unique-index DB error. Flat (D-14) — no
 * parent_id is ever accepted.
 * @param {{repository, businessRepository}} deps
 */
export function buildCreateProductFolderUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, show_in_pos_filter = true } = input;
        const name = normalizeText(input.name);
        const description = normalizeText(input.description);

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        if (!name) {
            return ApplicationResult.failure(validationError('name is required.'));
        }
        if (typeof show_in_pos_filter !== 'boolean') {
            return ApplicationResult.failure(validationError('show_in_pos_filter must be a boolean.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId, { role: 'owner' });
        if (error) return ApplicationResult.failure(error);

        try {
            const existing = await repository.findByName(businessId, name);
            if (existing) {
                return ApplicationResult.failure(conflictError('A product folder with this name already exists.'));
            }

            const folder = await repository.create({ businessId, name, description, show_in_pos_filter });
            return ApplicationResult.success({ folder });
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
export function buildListProductFoldersUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, includeInactive } = input;
        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const all = await repository.findAll(businessId);
            const folders = includeInactive ? all : all.filter((folder) => folder.is_active);
            return ApplicationResult.success({ folders });
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
export function buildGetProductFolderUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, folderId, requestingAccountId } = input;
        if (!businessId || folderId === undefined || folderId === null) {
            return ApplicationResult.failure(validationError('businessId and folderId are required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const folder = await repository.findById(businessId, folderId);
            if (!folder) {
                return ApplicationResult.failure(notFoundError());
            }
            return ApplicationResult.success({ folder });
        } catch (tenantError) {
            if (isTenantDatabaseUnavailableError(tenantError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(tenantError));
            }
            throw tenantError;
        }
    };
}
