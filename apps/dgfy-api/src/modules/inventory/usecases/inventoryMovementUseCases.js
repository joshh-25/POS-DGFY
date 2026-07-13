import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// inventoryMovementUseCases.js — Clean Architecture Application layer for
// the manual restock/loss/adjustment inventory-movement flow (PRD-04,
// D-06), mirroring ../../products/usecases/productUseCases.js. Each builder
// receives its dependencies via closure (repository =
// InventoryMovementRepository, businessRepository = the businesses module's
// BusinessRepository, used ONLY for membership access control since
// membership lives in the landlord dgfy_core database) and every use case
// always returns an ApplicationResult. No HTTP concerns, no direct model
// imports.

export const MOVEMENT_TYPES = Object.freeze(['restock', 'loss', 'sale', 'adjustment']);

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

const conflictError = (message, details = null) => new DomainError(
    DomainErrorCode.CONFLICT,
    message,
    { statusCode: 409, details }
);

const noTenantDatabaseError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'No tenant database is registered for this business.',
    { statusCode: 404, details: { error_code: 'NO_TENANT_DATABASE' } }
);

/**
 * Duck-types on `error.name === 'TenantDatabaseUnavailableError'` rather
 * than importing inventoryMovementRepository.js's class directly — mirrors
 * productUseCases.js's self-contained convention.
 * @param {Error} error
 */
const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

/** @param {Error} error */
const isInsufficientStockError = (error) => Boolean(error) && error.name === 'InsufficientStockError';

/** @param {Error} error */
const isProductNotFoundError = (error) => Boolean(error) && error.name === 'InventoryProductNotFoundError';

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

const isFiniteNonZeroNumber = (value) => Number.isFinite(Number(value)) && Number(value) !== 0;
const isPositiveNumber = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

/**
 * Shared access-control helper (mirrors productUseCases.js's private
 * requireMembership() — duplicated here rather than imported so this module
 * stays self-contained). Manual movement recording is a staff-or-owner
 * operation, not owner-only (D-06/08-04-PLAN.md's must_haves) — any active
 * business membership qualifies; there is no distinct 'staff' role value at
 * the landlord business_memberships level (roles are 'owner'/'member'), so
 * "staff-or-owner" is enforced here as "any active member".
 * @returns {Promise<{membership?: Object, error?: DomainError}>}
 */
async function requireMembership(businessRepository, businessId, accountId) {
    const membership = await businessRepository.getMembership(accountId, businessId);
    if (!membership || membership.status !== 'active') {
        return { error: forbiddenError('You must be a staff member or owner of this business.') };
    }
    return { membership };
}

/**
 * Verifies the business exists and, when requestingAccountId is supplied,
 * that the requester is an active member (staff-or-owner) of it.
 * @returns {Promise<{error?: DomainError}>}
 */
async function guardBusinessAccess(businessRepository, businessId, requestingAccountId) {
    const business = await businessRepository.findById(businessId);
    if (!business) {
        return { error: businessNotFoundError() };
    }
    if (requestingAccountId) {
        const { error } = await requireMembership(businessRepository, businessId, requestingAccountId);
        if (error) return { error };
    }
    return {};
}

/**
 * Shared builder for the three manual movement types. `validateQuantity`
 * returns an error message string (or null when valid); `signQuantity`
 * converts the caller-supplied quantity into the SIGNED delta the
 * repository applies to stock_count.
 * @param {{repository, businessRepository, movementType: string, validateQuantity: Function, signQuantity: Function}} config
 */
function buildMovementUseCase({ repository, businessRepository, movementType, validateQuantity, signQuantity }) {
    return async (input = {}) => {
        const {
            businessId,
            requestingAccountId,
            productId,
            referenceType = 'availment',
            referenceId = null,
            actorStaffAccountId = null,
            transaction = null
        } = input;

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        if (productId === undefined || productId === null) {
            return ApplicationResult.failure(validationError('productId is required.'));
        }
        const quantityError = validateQuantity(input.quantity);
        if (quantityError) {
            return ApplicationResult.failure(validationError(quantityError));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const result = await repository.recordMovementWithStockSync(
                businessId,
                {
                    productId,
                    movementType,
                    quantity: signQuantity(input.quantity),
                    referenceType,
                    referenceId,
                    actorAccountId: requestingAccountId || null,
                    actorStaffAccountId
                },
                transaction ? { transaction } : {}
            );
            return ApplicationResult.success(result);
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (isProductNotFoundError(repoError)) {
                return ApplicationResult.failure(notFoundError('Product not found for this movement.'));
            }
            if (isInsufficientStockError(repoError)) {
                return ApplicationResult.failure(conflictError(repoError.message));
            }
            throw repoError;
        }
    };
}

/**
 * Records a restock movement (PRD-04). Staff-or-owner required. `quantity`
 * must be a positive number — the repository applies it as a +N delta.
 * @param {{repository, businessRepository}} deps
 */
export function buildRecordRestockUseCase({ repository, businessRepository }) {
    return buildMovementUseCase({
        repository,
        businessRepository,
        movementType: 'restock',
        validateQuantity: (quantity) => (isPositiveNumber(quantity) ? null : 'quantity must be a positive number for a restock.'),
        signQuantity: (quantity) => Math.abs(Number(quantity))
    });
}

/**
 * Records a loss movement (PRD-04). Staff-or-owner required. `quantity`
 * must be a positive number — the repository applies it as a -N delta
 * (guarded so stock_count can never go negative).
 * @param {{repository, businessRepository}} deps
 */
export function buildRecordLossUseCase({ repository, businessRepository }) {
    return buildMovementUseCase({
        repository,
        businessRepository,
        movementType: 'loss',
        validateQuantity: (quantity) => (isPositiveNumber(quantity) ? null : 'quantity must be a positive number for a loss.'),
        signQuantity: (quantity) => -Math.abs(Number(quantity))
    });
}

/**
 * Records a sale movement (ADR-0029 D-06, Phase 9 wire-up). Staff-or-owner
 * required. `quantity` must be a positive number — the repository applies it
 * as a -N delta (a sale decreases stock, guarded so stock_count can never go
 * negative). Optional `transaction` (from availment finalize) is passed through
 * to recordMovementWithStockSync so the whole finalize stays atomic.
 * @param {{repository, businessRepository}} deps
 */
export function buildRecordSaleUseCase({ repository, businessRepository }) {
    return buildMovementUseCase({
        repository,
        businessRepository,
        movementType: 'sale',
        validateQuantity: (quantity) => (isPositiveNumber(quantity) ? null : 'quantity must be a positive number for a sale.'),
        signQuantity: (quantity) => -Math.abs(Number(quantity))
    });
}

/**
 * Records a manual adjustment movement (PRD-04). Staff-or-owner required.
 * `quantity` is a signed, non-zero correction delta applied as-is (an
 * adjustment can go either direction, unlike restock/loss).
 * @param {{repository, businessRepository}} deps
 */
export function buildRecordAdjustmentUseCase({ repository, businessRepository }) {
    return buildMovementUseCase({
        repository,
        businessRepository,
        movementType: 'adjustment',
        validateQuantity: (quantity) => (
            isFiniteNonZeroNumber(quantity) ? null : 'quantity must be a non-zero number for an adjustment.'
        ),
        signQuantity: (quantity) => Number(quantity)
    });
}

/**
 * Lists movements for a business, optionally filtered by productId.
 * Membership required (any active member — read access).
 * @param {{repository, businessRepository}} deps
 */
export function buildListMovementsUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, productId } = input;
        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const movements = await repository.findAll(businessId, { productId });
            return ApplicationResult.success({ movements });
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            throw repoError;
        }
    };
}
