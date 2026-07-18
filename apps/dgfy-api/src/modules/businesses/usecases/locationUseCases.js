import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// locationUseCases.js — Clean Architecture Application layer for the
// tenant-scoped location/branch domain (D-12), mirroring
// ./businessUseCases.js. Each builder receives its dependencies via closure
// (repository = LocationRepository, businessRepository = the businesses
// module's BusinessRepository, used ONLY for membership/role access
// control since membership lives in the landlord dgfy_core database) and
// every use case always returns an ApplicationResult. No HTTP concerns, no
// direct model imports.

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

const notFoundError = (message = 'Location not found.') => new DomainError(
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
 * Wave 7 gap-closure (04-07-PLAN.md): duck-types on
 * `error.name === 'TenantDatabaseUnavailableError'` rather than importing
 * locationRepository.js's class directly — mirrors this module's existing
 * self-contained convention (see requireMembership()'s doc comment) of not
 * reaching into a sibling module's internals.
 * @param {Error} error
 */
const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

/**
 * Maps a thrown TenantDatabaseUnavailableError (missing/provisioning/
 * inactive/unverified/unreachable/not_configured registry state) to a
 * stable ApplicationResult-ready DomainError. `missing`/`not_configured`
 * surface as 404 (mirrors tenantSessionUseCases.js's noTenantDatabaseError);
 * every other reason (still provisioning, not active, unverified, or
 * genuinely unreachable) surfaces as 503 SERVICE_UNAVAILABLE — the tenant
 * database exists as a concept but is not currently usable.
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

/**
 * Shared access-control helper (mirrors ./businessUseCases.js's private
 * requireMembership() — duplicated here rather than imported so this
 * module stays self-contained and 04-03.5-PLAN.md's file list doesn't need
 * to modify businessUseCases.js). Resolves the requester's membership and
 * optionally enforces a specific role. Only enforced when
 * requestingAccountId is supplied, so this stays usable both from
 * HTTP-authenticated controllers and from unauthenticated internal callers.
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
 * Create location use case (API-02/D-12). Owner role required. Auto-assigns
 * is_primary=true when this is the business's first location (repository-
 * owned logic); setAsPrimary explicitly promotes a non-first location.
 * @param {{repository, businessRepository}} deps
 */
export function buildCreateLocationUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, setAsPrimary } = input;
        const name = normalizeText(input.name);
        const addressLine = normalizeText(input.address_line);
        const { latitude, longitude } = input;

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        if (!name) {
            return ApplicationResult.failure(validationError('name is required.'));
        }
        if (!addressLine) {
            return ApplicationResult.failure(validationError('address_line is required.'));
        }
        if (!isFiniteNumberOrNull(latitude) || !isFiniteNumberOrNull(longitude)) {
            return ApplicationResult.failure(validationError('latitude/longitude must be numeric.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId, { role: 'owner' });
        if (error) return ApplicationResult.failure(error);

        try {
            const existingCount = (await repository.findAll(businessId)).length;
            const location = await repository.create({
                businessId,
                name,
                address_line: addressLine,
                latitude: latitude ?? null,
                longitude: longitude ?? null
            });

            // If this was NOT the first location (already auto-primary) but the
            // caller explicitly asked to make it primary, promote it now.
            let finalLocation = location;
            if (setAsPrimary && existingCount > 0) {
                finalLocation = await repository.updatePrimary(businessId, location.id);
            }

            return ApplicationResult.success({ location: finalLocation });
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
export function buildListLocationsUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, includeInactive } = input;
        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const all = await repository.findAll(businessId);
            const locations = includeInactive ? all : all.filter((location) => location.is_active);
            return ApplicationResult.success({ locations });
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
export function buildGetLocationUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, locationId, requestingAccountId } = input;
        if (!businessId || locationId === undefined || locationId === null) {
            return ApplicationResult.failure(validationError('businessId and locationId are required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const location = await repository.findById(businessId, locationId);
            if (!location) {
                return ApplicationResult.failure(notFoundError());
            }

            return ApplicationResult.success({ location });
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
export function buildUpdateLocationUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, locationId, requestingAccountId, updates = {} } = input;
        if (!businessId || locationId === undefined || locationId === null) {
            return ApplicationResult.failure(validationError('businessId and locationId are required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId, { role: 'owner' });
        if (error) return ApplicationResult.failure(error);

        try {
            const existing = await repository.findById(businessId, locationId);
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
            if (has('address_line')) {
                const addressLine = normalizeText(updates.address_line);
                if (!addressLine) return ApplicationResult.failure(validationError('address_line cannot be empty.'));
                patch.address_line = addressLine;
            }
            if (has('latitude')) {
                if (!isFiniteNumberOrNull(updates.latitude)) {
                    return ApplicationResult.failure(validationError('latitude must be numeric.'));
                }
                patch.latitude = updates.latitude;
            }
            if (has('longitude')) {
                if (!isFiniteNumberOrNull(updates.longitude)) {
                    return ApplicationResult.failure(validationError('longitude must be numeric.'));
                }
                patch.longitude = updates.longitude;
            }
            if (has('is_active')) {
                if (typeof updates.is_active !== 'boolean') {
                    return ApplicationResult.failure(validationError('is_active must be a boolean.'));
                }
                patch.is_active = updates.is_active;
            }

            const updated = await repository.update(businessId, locationId, patch);
            return ApplicationResult.success({ location: updated });
        } catch (tenantError) {
            if (isTenantDatabaseUnavailableError(tenantError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(tenantError));
            }
            throw tenantError;
        }
    };
}

/**
 * Owner role required. Ensures only one primary location per business.
 * @param {{repository, businessRepository}} deps
 */
export function buildSetPrimaryLocationUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, locationId, requestingAccountId } = input;
        if (!businessId || locationId === undefined || locationId === null) {
            return ApplicationResult.failure(validationError('businessId and locationId are required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId, { role: 'owner' });
        if (error) return ApplicationResult.failure(error);

        try {
            const existing = await repository.findById(businessId, locationId);
            if (!existing) {
                return ApplicationResult.failure(notFoundError());
            }
            if (!existing.is_active) {
                return ApplicationResult.failure(validationError('Cannot set an inactive location as primary.'));
            }

            const updated = await repository.updatePrimary(businessId, locationId);
            return ApplicationResult.success({ location: updated });
        } catch (tenantError) {
            if (isTenantDatabaseUnavailableError(tenantError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(tenantError));
            }
            throw tenantError;
        }
    };
}

/**
 * Owner role required. Soft-deletes (is_active=false); refuses to delete
 * the business's last remaining active location. If the deleted location
 * was primary and other active locations remain, the next active location
 * (by id) is auto-promoted to primary so the business is never left
 * without a primary location.
 * @param {{repository, businessRepository}} deps
 */
export function buildDeleteLocationUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, locationId, requestingAccountId } = input;
        if (!businessId || locationId === undefined || locationId === null) {
            return ApplicationResult.failure(validationError('businessId and locationId are required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId, { role: 'owner' });
        if (error) return ApplicationResult.failure(error);

        try {
            const existing = await repository.findById(businessId, locationId);
            if (!existing) {
                return ApplicationResult.failure(notFoundError());
            }

            const all = await repository.findAll(businessId);
            const activeLocations = all.filter((location) => location.is_active);
            if (existing.is_active && activeLocations.length <= 1) {
                return ApplicationResult.failure(conflictError('Cannot delete the business\'s last remaining location.'));
            }

            const deleted = await repository.delete(businessId, locationId);

            if (existing.is_primary && existing.is_active) {
                const nextPrimaryCandidate = activeLocations
                    .filter((location) => location.id !== existing.id)
                    .sort((a, b) => a.id - b.id)[0];
                if (nextPrimaryCandidate) {
                    await repository.updatePrimary(businessId, nextPrimaryCandidate.id);
                }
            }

            return ApplicationResult.success({ location: deleted });
        } catch (tenantError) {
            if (isTenantDatabaseUnavailableError(tenantError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(tenantError));
            }
            throw tenantError;
        }
    };
}
