import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

/**
 * 10-02-PLAN.md Task 2: Clean Architecture Application layer for the stock
 * reservation flow (D-07/D-09/D-10, ADR 0029). Each builder receives its
 * dependencies via closure (repository = InventoryReservationRepository,
 * recordSaleUseCase = the injected single-writer effect for conversions) and
 * every use case always returns an ApplicationResult. No HTTP concerns, no
 * direct model imports.
 */

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

const serviceUnavailableError = (message, details = null) => new DomainError(
    DomainErrorCode.SERVICE_UNAVAILABLE,
    message,
    { statusCode: 503, details }
);

/**
 * Duck-types on error.name === 'TenantDatabaseUnavailableError'.
 * @param {Error} error
 */
const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

/**
 * Duck-types on error.name === 'InsufficientStockError'.
 * @param {Error} error
 */
const isInsufficientStockError = (error) => Boolean(error) && error.name === 'InsufficientStockError';

/**
 * Maps TenantDatabaseUnavailableError to stable DomainError:
 * 'missing'/'not_configured' -> 404; others -> 503 SERVICE_UNAVAILABLE (D-10).
 * @param {Error} error
 */
const mapTenantDatabaseError = (error) => {
    if (error.reason === 'missing' || error.reason === 'not_configured') {
        return validationError(
            'No tenant database is registered for this business.',
            { error_code: 'NO_TENANT_DATABASE' }
        );
    }
    return serviceUnavailableError(
        error.message,
        { error_code: 'TENANT_DATABASE_UNAVAILABLE', reason: error.reason }
    );
};

const isPositiveNumber = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

/**
 * Shared access-control helper. Mirrors inventoryMovementUseCases.js's pattern.
 * @returns {Promise<{membership?: Object, error?: DomainError}>}
 */
async function requireMembership(businessRepository, businessId, accountId) {
    const membership = await businessRepository.getMembership(accountId, businessId);
    if (!membership || membership.status !== 'active') {
        return { error: new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'You must be a staff member or owner of this business.',
            { statusCode: 403 }
        ) };
    }
    return { membership };
}

/**
 * Computes available-to-sell and returns it as an ApplicationResult.
 * D-09: expired-active reservations excluded on-read, so availability is
 * correct regardless of sweep timing.
 */
export function buildAvailableToSellUseCase({ repository } = {}) {
    return async (businessId, productId) => {
        if (!businessId || !productId) {
            return ApplicationResult.failure(validationError('businessId and productId are required.'));
        }

        try {
            const available = await repository.availableToSell(businessId, productId);
            return ApplicationResult.success({ availableToSell: available });
        } catch (error) {
            if (isTenantDatabaseUnavailableError(error)) {
                return ApplicationResult.failure(mapTenantDatabaseError(error));
            }
            return ApplicationResult.failure(
                serviceUnavailableError('Failed to compute available stock.')
            );
        }
    };
}

/**
 * Places a hold on stock for a storefront order (D-07).
 * - Atomic per-product check inside tenant transaction
 * - Row-lock for concurrent safety
 * - All-or-nothing across lines
 * - Rejects with 409 CONFLICT on oversell (D-09: expired-active excluded on-read)
 * - Rejects with 503 SERVICE_UNAVAILABLE on DB unreachable (D-10: fail-fast)
 */
export function buildReserveStockUseCase({ repository, businessRepository } = {}) {
    return async (input = {}) => {
        const { businessId, accountId, lines = [], referenceId, expiresAt } = input;

        if (!businessId || !accountId) {
            return ApplicationResult.failure(
                validationError('businessId and accountId are required.')
            );
        }

        const { error: membershipError } = await requireMembership(businessRepository, businessId, accountId);
        if (membershipError) {
            return ApplicationResult.failure(membershipError);
        }

        if (!lines || lines.length === 0) {
            return ApplicationResult.failure(validationError('At least one reservation line is required.'));
        }

        if (!referenceId) {
            return ApplicationResult.failure(validationError('referenceId (order public_reference) is required.'));
        }

        // Validate each line
        for (const line of lines) {
            if (!line.productId || !isPositiveNumber(line.quantity)) {
                return ApplicationResult.failure(
                    validationError('Each line must have a positive productId and quantity.')
                );
            }
        }

        try {
            const result = await repository.reserveStock(businessId, lines, referenceId, expiresAt);
            return ApplicationResult.success({
                reservations: result.reservations
            });
        } catch (error) {
            if (isTenantDatabaseUnavailableError(error)) {
                return ApplicationResult.failure(mapTenantDatabaseError(error));
            }
            if (isInsufficientStockError(error)) {
                return ApplicationResult.failure(
                    conflictError(error.message, { error_code: 'INSUFFICIENT_STOCK' })
                );
            }
            return ApplicationResult.failure(
                serviceUnavailableError('Failed to reserve stock.')
            );
        }
    };
}

/**
 * Converts active reservations to sale effects via recordSale single-writer
 * (never direct stock_count write, ADR 0029). Idempotent: already-committed
 * are no-op. Called from order finalization path with shared transaction.
 */
export function buildCommitReservationUseCase({ repository, recordSaleUseCase } = {}) {
    return async (input = {}) => {
        const { businessId, referenceId, transaction } = input;

        if (!businessId || !referenceId) {
            return ApplicationResult.failure(
                validationError('businessId and referenceId are required.')
            );
        }

        try {
            await repository.commitReservation(businessId, referenceId, recordSaleUseCase, transaction);
            return ApplicationResult.success({ committed: true });
        } catch (error) {
            if (isTenantDatabaseUnavailableError(error)) {
                return ApplicationResult.failure(mapTenantDatabaseError(error));
            }
            return ApplicationResult.failure(
                serviceUnavailableError('Failed to commit reservation.')
            );
        }
    };
}

/**
 * Releases held stock (marks 'released'). Idempotent: already-released are no-op.
 * Called when order is cancelled or abandoned.
 */
export function buildReleaseReservationUseCase({ repository } = {}) {
    return async (businessId, referenceId) => {
        if (!businessId || !referenceId) {
            return ApplicationResult.failure(
                validationError('businessId and referenceId are required.')
            );
        }

        try {
            const releasedCount = await repository.releaseReservation(businessId, referenceId);
            return ApplicationResult.success({ releasedCount });
        } catch (error) {
            if (isTenantDatabaseUnavailableError(error)) {
                return ApplicationResult.failure(mapTenantDatabaseError(error));
            }
            return ApplicationResult.failure(
                serviceUnavailableError('Failed to release reservation.')
            );
        }
    };
}

/**
 * D-09: durable sweep helper. Releases all active reservations with
 * expires_at <= now. Availability correctness does NOT depend on this
 * having run (expired-active excluded on-read), but sweep reclaims the rows
 * eventually.
 */
export function buildExpireDueReservationsUseCase({ repository } = {}) {
    return async (now = null) => {
        // This is a background/admin operation, not scoped to a specific business
        // In practice, orchestration code calls this per-business from a scheduled sweep
        // For now, we return the async operation itself
        return async (businessId) => {
            try {
                const expiredCount = await repository.expireDueReservations(businessId, now);
                return ApplicationResult.success({ expiredCount });
            } catch (error) {
                return ApplicationResult.failure(
                    serviceUnavailableError('Failed to expire due reservations.')
                );
            }
        };
    };
}

/**
 * Stamps the shared session clock (D-08) on reservation rows for an order.
 * Called when order's session expiry is updated.
 */
export function buildSetReservationExpiryUseCase({ repository } = {}) {
    return async (businessId, referenceId, expiresAt) => {
        if (!businessId || !referenceId || !expiresAt) {
            return ApplicationResult.failure(
                validationError('businessId, referenceId, and expiresAt are required.')
            );
        }

        try {
            const updatedCount = await repository.setReservationExpiry(businessId, referenceId, expiresAt);
            return ApplicationResult.success({ updatedCount });
        } catch (error) {
            if (isTenantDatabaseUnavailableError(error)) {
                return ApplicationResult.failure(mapTenantDatabaseError(error));
            }
            return ApplicationResult.failure(
                serviceUnavailableError('Failed to set reservation expiry.')
            );
        }
    };
}

export default {
    buildAvailableToSellUseCase,
    buildReserveStockUseCase,
    buildCommitReservationUseCase,
    buildReleaseReservationUseCase,
    buildExpireDueReservationsUseCase,
    buildSetReservationExpiryUseCase
};
