import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// fulfillmentUseCases.js — Clean Architecture Application layer for FUL-01
// (list/process incoming online orders), FUL-02 (progress the shared
// per-mode fulfillment pipeline), and FUL-03 (assign courier + track
// payout), mirroring ../../inventory/usecases/inventoryMovementUseCases.js.
// Each builder receives its dependencies via closure (repository =
// stageEventRepository/courierAssignmentRepository/availmentReadRepository,
// businessRepository = the businesses module's BusinessRepository, used
// ONLY for membership access control since membership lives in the landlord
// dgfy_core database) and every use case always returns an
// ApplicationResult. No HTTP concerns, no direct model imports.

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
);

const notFoundError = (message = 'Availment not found.') => new DomainError(
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
 * than importing a concrete repository class directly — mirrors
 * inventoryMovementUseCases.js's self-contained convention. All three
 * fulfillment repositories (stageEventRepository, courierAssignmentRepository,
 * availmentReadRepository) throw the same-shaped error.
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

/**
 * Shared access-control helper (mirrors inventoryMovementUseCases.js's
 * private requireMembership() — duplicated here rather than imported so
 * this module stays self-contained). Every fulfillment usecase is a
 * staff-or-owner operation, not owner-only (A3, resolved) — any active
 * business membership qualifies.
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

// D-12/D-13/D-14/D-15: per-mode legal stage sequence, app-logic only — NEVER
// a DB constraint (Pitfall 3). pickup and dine_in share the same 5-stage
// sequence; delivery substitutes out_for_delivery for ready.
export const STAGE_SEQUENCES = Object.freeze({
    pickup: Object.freeze(['placed', 'confirmed', 'preparing', 'ready', 'completed']),
    dine_in: Object.freeze(['placed', 'confirmed', 'preparing', 'ready', 'completed']),
    delivery: Object.freeze(['placed', 'confirmed', 'preparing', 'out_for_delivery', 'completed'])
});

/**
 * Returns the next legal stage for `mode` after `current`, or null when
 * `current` is not recognized or is already the terminal stage.
 * @param {string} mode
 * @param {string} current
 */
function nextLegalStage(mode, current) {
    const sequence = STAGE_SEQUENCES[mode];
    if (!sequence) return null;
    const index = sequence.indexOf(current);
    return (index >= 0 && index < sequence.length - 1) ? sequence[index + 1] : null;
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Lists incoming (in-progress, online-only) orders for a business — the
 * concrete FUL-01 read path (D-08). Delegates the read exclusively to the
 * injected availmentReadRepository.findIncomingAvailments; never imports a
 * model here and never reuses stageEventRepository (bound to a different
 * model).
 * @param {{availmentReadRepository, businessRepository}} deps
 */
export function buildListIncomingOrdersUseCase({ availmentReadRepository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, branchId = null, fulfillmentMode = null } = input;

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const orders = await availmentReadRepository.findIncomingAvailments(businessId, {
                branchId,
                fulfillmentMode
            });
            return ApplicationResult.success({ orders });
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            throw repoError;
        }
    };
}

/**
 * Progresses an availment to its next legal stage for its fulfillment_mode
 * (FUL-02), or — when `force: true` — jumps a delivery order out of
 * `out_for_delivery` directly to `completed` with `is_forced: true` + a
 * `reason` (D-10). Rejects an illegal/skipped transition with a 409
 * conflict, and rejects progressing an already-`completed` availment (D-07
 * immutability of the append-only ledger — a completed order has no legal
 * successor).
 *
 * CR-02 fix (11-REVIEW.md): the append-only ledger write
 * (stageEventRepository.create) and the denormalized cache-sync write
 * (availmentRepository.updateFulfillmentState) are made atomic via
 * availmentRepository.runInTransaction — a partial failure between them
 * used to permanently desync the ledger (source of truth) from the cache
 * the NEXT transition is computed from.
 * @param {{stageEventRepository, availmentRepository: {findById, updateFulfillmentState, runInTransaction}, businessRepository}} deps
 */
export function buildProgressStageUseCase({ stageEventRepository, availmentRepository, businessRepository }) {
    return async (input = {}) => {
        const {
            businessId,
            requestingAccountId,
            availmentId,
            force = false,
            reason = null,
            actorStaffAccountId = null,
            transaction = null
        } = input;

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        if (availmentId === undefined || availmentId === null) {
            return ApplicationResult.failure(validationError('availmentId is required.'));
        }
        if (force && !reason) {
            return ApplicationResult.failure(validationError('reason is required for a forced stage transition.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const availment = await availmentRepository.findById(businessId, availmentId);
            if (!availment) {
                return ApplicationResult.failure(notFoundError());
            }

            const { fulfillment_mode: mode, fulfillment_status: currentStatus } = availment;
            if (!mode || !STAGE_SEQUENCES[mode]) {
                return ApplicationResult.failure(conflictError('This availment has no valid fulfillment_mode set.'));
            }
            if (currentStatus === 'completed') {
                return ApplicationResult.failure(conflictError('This availment is already completed.'));
            }

            let targetStatus;
            let isForced = false;
            if (force) {
                // D-10: only a delivery order in out_for_delivery may be
                // force-completed.
                if (mode !== 'delivery' || currentStatus !== 'out_for_delivery') {
                    return ApplicationResult.failure(conflictError(
                        'Force-complete is only valid for a delivery order currently out_for_delivery.'
                    ));
                }
                targetStatus = 'completed';
                isForced = true;
            } else {
                targetStatus = nextLegalStage(mode, currentStatus);
                if (!targetStatus) {
                    return ApplicationResult.failure(conflictError(
                        `There is no legal next stage from "${currentStatus}" for fulfillment_mode "${mode}".`
                    ));
                }
            }

            // CR-02 fix (11-REVIEW.md): both writes below must commit or
            // roll back together. When the caller already supplied an outer
            // transaction (e.g. a future composed call), reuse it directly;
            // otherwise open one here via availmentRepository.runInTransaction
            // so the wired production path (no outer transaction) is atomic
            // by default.
            const writeStageProgress = async (tx) => {
                const options = tx ? { transaction: tx } : {};
                const event = await stageEventRepository.create(businessId, {
                    availmentId,
                    fulfillmentMode: mode,
                    fulfillmentStatus: targetStatus,
                    fulfillmentStage: targetStatus,
                    reason: reason ?? null,
                    isForced,
                    actorStaffAccountId,
                    actorAccountId: requestingAccountId || null
                }, options);

                await availmentRepository.updateFulfillmentState(businessId, availmentId, {
                    fulfillmentStatus: targetStatus,
                    fulfillmentStage: targetStatus
                }, options);

                return event;
            };

            const stageEvent = transaction
                ? await writeStageProgress(transaction)
                : await availmentRepository.runInTransaction(businessId, writeStageProgress);

            return ApplicationResult.success({ stageEvent, fulfillmentStatus: targetStatus, isForced });
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            throw repoError;
        }
    };
}

/**
 * Assigns a free-text courier to an availment (FUL-03, D-01). Supersedes
 * any prior active assignment for that availment (D-04) then inserts a new
 * active row.
 * @param {{courierAssignmentRepository, businessRepository}} deps
 */
export function buildAssignCourierUseCase({ courierAssignmentRepository, businessRepository }) {
    return async (input = {}) => {
        const {
            businessId,
            requestingAccountId,
            availmentId,
            courierName,
            courierContact = null,
            payoutAmount = null,
            assignedByStaffAccountId = null
        } = input;

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        if (availmentId === undefined || availmentId === null) {
            return ApplicationResult.failure(validationError('availmentId is required.'));
        }
        if (!courierName || typeof courierName !== 'string' || !courierName.trim()) {
            return ApplicationResult.failure(validationError('courier_name is required.'));
        }
        if (courierName.length > 255) {
            return ApplicationResult.failure(validationError('courier_name must be 255 characters or fewer.'));
        }
        if (payoutAmount !== null && payoutAmount !== undefined) {
            if (!Number.isFinite(Number(payoutAmount)) || Number(payoutAmount) < 0) {
                return ApplicationResult.failure(validationError('payout_amount must be a non-negative number.'));
            }
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const priorActive = await courierAssignmentRepository.findActiveForAvailment(businessId, availmentId);
            if (priorActive) {
                await courierAssignmentRepository.markSuperseded(businessId, priorActive.id);
            }

            const assignment = await courierAssignmentRepository.create(businessId, {
                availmentId,
                courierName: courierName.trim(),
                courierContact,
                payoutAmount,
                assignedByStaffAccountId
            });

            return ApplicationResult.success({ assignment });
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            throw repoError;
        }
    };
}

/**
 * Marks a courier assignment's payout owed -> paid (FUL-03, D-02).
 * @param {{courierAssignmentRepository, businessRepository}} deps
 */
export function buildMarkPayoutUseCase({ courierAssignmentRepository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, assignmentId, paidAt = null } = input;

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        if (assignmentId === undefined || assignmentId === null) {
            return ApplicationResult.failure(validationError('assignmentId is required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const affectedRows = await courierAssignmentRepository.updatePayout(businessId, assignmentId, {
                payoutStatus: 'paid',
                paidAt: paidAt || new Date()
            });
            if (!affectedRows) {
                return ApplicationResult.failure(notFoundError('Courier assignment not found.'));
            }
            return ApplicationResult.success({ assignmentId, payoutStatus: 'paid' });
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            throw repoError;
        }
    };
}

export { isPlainObject as _isPlainObject };
