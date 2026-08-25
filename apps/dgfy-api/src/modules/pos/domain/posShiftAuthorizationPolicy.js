import {
    DomainError,
    DomainErrorCode
} from '../../shared/contracts/domainErrors.js';

export const POS_SHIFT_AUTHORIZATION_REASON_CODES = Object.freeze({
    SHIFT_NOT_OPEN: 'POS_SHIFT_NOT_OPEN',
    ACTOR_MISMATCH: 'POS_SHIFT_MUTATION_ACTOR_MISMATCH',
    OVERRIDE_REASON_REQUIRED: 'POS_SHIFT_OVERRIDE_REASON_REQUIRED'
});

const toPositiveInteger = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const isMasterAdmin = (user = {}) => (
    user?.is_master_admin === true
    || user?.is_master_admin === 1
    || user?.is_master_admin === '1'
);

export const authorizePosShiftMutation = ({
    shift,
    actorUser,
    operation,
    overrideReason = null
} = {}) => {
    const actorUserId = toPositiveInteger(actorUser?.user_id);
    if (!actorUserId) {
        throw new DomainError(
            DomainErrorCode.AUTHENTICATION_FAILED,
            'Authenticated POS user is required.',
            { statusCode: 401 }
        );
    }

    if (!shift || String(shift.status || '').trim().toLowerCase() !== 'open') {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Only an open shift can be changed.',
            {
                statusCode: 422,
                details: {
                    reason_code: POS_SHIFT_AUTHORIZATION_REASON_CODES.SHIFT_NOT_OPEN,
                    operation: String(operation || '').trim() || null
                }
            }
        );
    }

    const shiftCashierId = toPositiveInteger(shift.cashier_id);
    if (shiftCashierId === actorUserId) {
        return {
            authorization_mode: 'shift_owner',
            actor_user_id: actorUserId,
            shift_cashier_id: shiftCashierId,
            override_reason: null
        };
    }

    const registerShiftOwnerUserId = toPositiveInteger(actorUser?.register_shift_owner_user_id);
    const operatorSessionId = toPositiveInteger(actorUser?.operator_session_id);
    if (operatorSessionId && registerShiftOwnerUserId === shiftCashierId) {
        return {
            authorization_mode: 'active_operator',
            actor_user_id: actorUserId,
            shift_cashier_id: shiftCashierId,
            operator_session_id: operatorSessionId,
            override_reason: null
        };
    }

    if (!isMasterAdmin(actorUser)) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Only the operator who opened this shift can change it.',
            {
                statusCode: 403,
                details: {
                    reason_code: POS_SHIFT_AUTHORIZATION_REASON_CODES.ACTOR_MISMATCH,
                    operation: String(operation || '').trim() || null,
                    shift_cashier_id: shiftCashierId,
                    actor_user_id: actorUserId
                }
            }
        );
    }

    const normalizedOverrideReason = String(overrideReason || '').trim();
    if (normalizedOverrideReason.length < 8) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'A master-admin override reason of at least 8 characters is required.',
            {
                statusCode: 422,
                details: {
                    reason_code: POS_SHIFT_AUTHORIZATION_REASON_CODES.OVERRIDE_REASON_REQUIRED,
                    operation: String(operation || '').trim() || null,
                    shift_cashier_id: shiftCashierId,
                    actor_user_id: actorUserId
                }
            }
        );
    }

    return {
        authorization_mode: 'master_admin_override',
        actor_user_id: actorUserId,
        shift_cashier_id: shiftCashierId,
        override_reason: normalizedOverrideReason
    };
};
