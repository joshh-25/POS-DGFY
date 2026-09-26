import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const terminal = (value) => String(value || '').trim().toUpperCase();

export const normalizePosOperatingConflict = (error) => {
    const code = error?.original?.code || error?.parent?.code || error?.code;
    if (error?.name === 'SequelizeUniqueConstraintError'
        || ['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(code)) {
        return new DomainError(DomainErrorCode.CONFLICT, 'Register state changed concurrently. Refresh and retry.', {
            statusCode: 409, details: { reason_code: 'POS_OPERATOR_CONCURRENT_CHANGE' }
        });
    }
    return error;
};

// Lock the existing tenant user before inspecting either authority model. The
// lock is retained by the caller's acquisition/mutation transaction, including
// when this location uses legacy shifts and another uses operator sessions.
export const createAssertPosUserOperatingScope = ({ repository }) => async ({
    userId, terminalId, locationId, transaction
}) => {
    if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0
        || !Number.isSafeInteger(Number(locationId)) || Number(locationId) <= 0 || !terminal(terminalId)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A user, terminal and location are required.', { statusCode: 422 });
    }
    const state = await repository.lockUserOperatingState({ userId, transaction });
    if (!state.user || !state.user.is_active || state.user.deleted_at) {
        throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'The POS user is not active.', {
            statusCode: 403, details: { reason_code: 'POS_OPERATOR_INACTIVE' }
        });
    }
    if (!state.user.is_master_admin) {
        const grant = await repository.findUserLocationGrant({ userId, locationId, transaction, lock: true });
        if (!grant) {
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'This cashier is not assigned to this location.', {
                statusCode: 403, details: { reason_code: 'POS_OPERATOR_LOCATION_GRANT_REQUIRED' }
            });
        }
    }
    const conflicting = [...state.shifts, ...state.operators].find((row) => (
        terminal(row.terminal_id) !== terminal(terminalId)
        || Number(row.location_id) !== Number(locationId)
    )) || state.attendance.find((row) => Number(row.location_id) !== Number(locationId));
    if (conflicting) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'This cashier is already active at another register or location.', {
            statusCode: 409,
            details: {
                reason_code: 'POS_OPERATOR_ACTIVE_ELSEWHERE',
                existing_terminal_id: conflicting.terminal_id || null,
                existing_location_id: Number(conflicting.location_id),
                existing_shift_id: conflicting.pos_terminal_shift_id || null
            }
        });
    }
    return state.user;
};
