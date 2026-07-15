import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';
import { createShiftEntity } from '../entities/shiftEntity.js';

// shiftUseCases.js — Clean Architecture Application layer for the
// tenant-scoped shift/cash-drawer domain (SFT-01/SFT-02/SFT-03), mirroring
// ../../inventory/usecases/inventoryMovementUseCases.js. Each builder
// receives its dependencies via closure (repository = ShiftRepository,
// businessRepository = the businesses module's BusinessRepository, used
// ONLY for membership access control since membership lives in the landlord
// dgfy_core database) and every use case always returns an
// ApplicationResult. No HTTP concerns, no direct model imports.
//
// The compliance gate (FSC-02) is NOT wired into openShift this phase —
// 08-PLAN.md's objective is explicit that Phase 9 wires all gate call
// sites. buildOpenShiftUseCase accepts an OPTIONAL assertComplianceGate so a
// later phase can inject it without restructuring this file, but this
// phase's usecase never calls it.

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
);

const notFoundError = (message = 'Shift not found.') => new DomainError(
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
 * than importing shiftRepository.js's class directly — mirrors
 * inventoryMovementUseCases.js's self-contained convention.
 * @param {Error} error
 */
const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

/** @param {Error} error */
const isDuplicateOpenShiftError = (error) => Boolean(error) && error.name === 'DuplicateOpenShiftError';

/** @param {Error} error */
const isShiftNotFoundError = (error) => Boolean(error) && error.name === 'ShiftNotFoundError';

/** @param {Error} error */
const isShiftNotOpenError = (error) => Boolean(error) && error.name === 'ShiftNotOpenError';

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

const isNonNegativeNumber = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;

/**
 * Shared access-control helper (mirrors inventoryMovementUseCases.js's
 * private requireMembership() — duplicated here rather than imported so
 * this module stays self-contained). Shift open/close/no-sale-pop are
 * staff-or-owner operations, not owner-only — any active business
 * membership qualifies (there is no distinct 'staff' role value at the
 * landlord business_memberships level; roles are 'owner'/'member').
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
 * Reconciliation helper (SFT-02, D-10): expected_cash_amount is shaped to
 * accept Phase 9's sales/refunds/pay-in/pay-out inputs now so the formula
 * never needs restructuring later — every Phase-9 input defaults to 0 this
 * phase, so expected_cash_amount === opening_float_amount until Phase 9
 * wires real values through.
 *
 *   expected_cash = opening_float_amount + salesCash - refundsCash + payIns - payOuts
 *
 * @param {{openingFloatAmount, salesCash?, refundsCash?, payIns?, payOuts?}} args
 * @returns {number}
 */
export function computeExpectedCash({
    openingFloatAmount,
    salesCash = 0,
    refundsCash = 0,
    payIns = 0,
    payOuts = 0
}) {
    return Number(openingFloatAmount) + Number(salesCash) - Number(refundsCash) + Number(payIns) - Number(payOuts);
}

/**
 * Opens a shift (SFT-01). Staff-or-owner membership required.
 * `cashierAccountId` is the tenant-local staff_accounts.id (D-13) that
 * becomes part of the DB-enforced one-open-shift key (D-12) — a second
 * openShift for the same terminalId+cashierAccountId while one is already
 * open is rejected as a clean 409 (repository maps the DB unique-index
 * violation, never a raw 500).
 *
 * `assertComplianceGate` is accepted for forward-compatibility only
 * (FSC-02) — Phase 9 wires the real call site; this phase never invokes it.
 * @param {{repository, businessRepository, assertComplianceGate?: Function}} deps
 */
export function buildOpenShiftUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const {
            businessId,
            requestingAccountId,
            terminalId,
            cashierAccountId,
            cashierDgfyAccountId,
            openingFloatAmount
        } = input;

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        if (terminalId === undefined || terminalId === null) {
            return ApplicationResult.failure(validationError('terminalId is required.'));
        }
        if (cashierAccountId === undefined || cashierAccountId === null) {
            return ApplicationResult.failure(validationError('cashierAccountId is required.'));
        }
        if (!isNonNegativeNumber(openingFloatAmount)) {
            return ApplicationResult.failure(validationError('openingFloatAmount must be a non-negative number.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const shift = await repository.openShift(businessId, {
                terminalId,
                cashierAccountId,
                cashierDgfyAccountId: cashierDgfyAccountId ?? null,
                openingFloatAmount: Number(openingFloatAmount)
            });
            return ApplicationResult.success({ shift });
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (isDuplicateOpenShiftError(repoError)) {
                return ApplicationResult.failure(conflictError(
                    'An open shift already exists for this terminal and cashier.',
                    { error_code: 'SHIFT_ALREADY_OPEN' }
                ));
            }
            throw repoError;
        }
    };
}

/**
 * Closes a shift (SFT-02). Staff-or-owner membership required. Computes
 * expected_cash_amount and the signed cash_variance_amount via
 * computeExpectedCash() before delegating the actual persistence write to
 * the repository (which writes the shift update + close event in one
 * transaction). salesCash/refundsCash/payIns/payOuts all default to 0 this
 * phase (D-10) — real values arrive from Phase 9's checkout completion.
 * @param {{repository, businessRepository}} deps
 */
export function buildCloseShiftUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const {
            businessId,
            requestingAccountId,
            shiftId,
            closingCashAmount,
            salesCash = 0,
            refundsCash = 0,
            payIns = 0,
            payOuts = 0
        } = input;

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        if (shiftId === undefined || shiftId === null) {
            return ApplicationResult.failure(validationError('shiftId is required.'));
        }
        if (!isNonNegativeNumber(closingCashAmount)) {
            return ApplicationResult.failure(validationError('closingCashAmount must be a non-negative number.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const existing = await repository.findById(businessId, shiftId);
            if (!existing) {
                return ApplicationResult.failure(notFoundError());
            }
            if (existing.status !== 'open') {
                return ApplicationResult.failure(conflictError('This shift is not open.'));
            }

            const expectedCashAmount = computeExpectedCash({
                openingFloatAmount: existing.opening_float_amount,
                salesCash: Number(salesCash) || 0,
                refundsCash: Number(refundsCash) || 0,
                payIns: Number(payIns) || 0,
                payOuts: Number(payOuts) || 0
            });
            const cashVarianceAmount = Number(closingCashAmount) - expectedCashAmount;

            const shift = await repository.closeShift(businessId, shiftId, {
                closingCashAmount: Number(closingCashAmount),
                expectedCashAmount,
                cashVarianceAmount
            });
            return ApplicationResult.success({ shift });
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (isShiftNotFoundError(repoError)) {
                return ApplicationResult.failure(notFoundError());
            }
            if (isShiftNotOpenError(repoError)) {
                return ApplicationResult.failure(conflictError(repoError.message));
            }
            throw repoError;
        }
    };
}

/**
 * Logs a no-sale drawer pop (SFT-03) against an open shift. Staff-or-owner
 * membership required.
 * @param {{repository, businessRepository}} deps
 */
export function buildRecordNoSalePopUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, shiftId, reason, actorStaffAccountId } = input;

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        if (shiftId === undefined || shiftId === null) {
            return ApplicationResult.failure(validationError('shiftId is required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const event = await repository.recordNoSalePop(businessId, shiftId, {
                reason: reason ?? null,
                actorStaffAccountId: actorStaffAccountId ?? null
            });
            return ApplicationResult.success({ event });
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (isShiftNotFoundError(repoError)) {
                return ApplicationResult.failure(notFoundError());
            }
            if (isShiftNotOpenError(repoError)) {
                return ApplicationResult.failure(conflictError(repoError.message));
            }
            throw repoError;
        }
    };
}

/**
 * Lists shifts for a business, annotating each with an is_stale flag (D-11)
 * computed from the injected staleThresholdMinutes — a shift open longer
 * than the threshold is flagged, NEVER auto-closed (this use case only
 * reads and annotates; nothing here mutates shift status). Membership
 * required (any active member — read access).
 * @param {{repository, businessRepository, staleThresholdMinutes}} deps
 */
export function buildListShiftsUseCase({ repository, businessRepository, staleThresholdMinutes }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId } = input;
        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const shifts = await repository.findAll(businessId);
            const now = new Date();
            const annotated = shifts.map((shift) => {
                const entity = createShiftEntity(shift);
                return { ...entity.toPlain(), is_stale: entity.isStale(staleThresholdMinutes, now) };
            });
            return ApplicationResult.success({ shifts: annotated });
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            throw repoError;
        }
    };
}
