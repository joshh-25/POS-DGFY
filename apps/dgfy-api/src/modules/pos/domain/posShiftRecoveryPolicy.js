import {
    DomainError,
    DomainErrorCode
} from '../../shared/contracts/domainErrors.js';

export const POS_SHIFT_RECOVERY_REASON_CODES = Object.freeze({
    SHIFT_NOT_OPEN: 'POS_SHIFT_RECOVERY_SHIFT_NOT_OPEN',
    MASTER_ADMIN_REQUIRED: 'POS_SHIFT_RECOVERY_MASTER_ADMIN_REQUIRED',
    REASON_REQUIRED: 'POS_SHIFT_RECOVERY_REASON_REQUIRED',
    SHIFT_NOT_STALE: 'POS_SHIFT_RECOVERY_SHIFT_NOT_STALE'
});

export const DEFAULT_POS_STALE_SHIFT_HOURS = 12;

const toPositiveInteger = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const isMasterAdmin = (user = {}) => (
    user?.is_master_admin === true
    || user?.is_master_admin === 1
    || user?.is_master_admin === '1'
);

export const resolvePosStaleShiftHours = (
    value = process.env.POS_STALE_SHIFT_HOURS
) => {
    const normalized = toPositiveInteger(value);
    return normalized && normalized <= 168
        ? normalized
        : DEFAULT_POS_STALE_SHIFT_HOURS;
};

export const evaluatePosShiftStaleness = ({
    shift,
    now = new Date(),
    staleAfterHours = resolvePosStaleShiftHours()
} = {}) => {
    const openedAt = shift?.opened_at ? new Date(shift.opened_at) : null;
    const evaluatedAt = now instanceof Date ? now : new Date(now);
    const thresholdHours = resolvePosStaleShiftHours(staleAfterHours);
    const validDates = openedAt
        && Number.isFinite(openedAt.getTime())
        && Number.isFinite(evaluatedAt.getTime());
    const ageMilliseconds = validDates
        ? Math.max(0, evaluatedAt.getTime() - openedAt.getTime())
        : 0;
    const ageMinutes = Math.floor(ageMilliseconds / (60 * 1000));
    const staleAt = validDates
        ? new Date(openedAt.getTime() + (thresholdHours * 60 * 60 * 1000))
        : null;
    const isOpen = String(shift?.status || '').trim().toLowerCase() === 'open';

    return {
        is_stale: Boolean(isOpen && validDates && evaluatedAt >= staleAt),
        age_minutes: ageMinutes,
        stale_after_hours: thresholdHours,
        stale_at: staleAt ? staleAt.toISOString() : null,
        evaluated_at: Number.isFinite(evaluatedAt.getTime())
            ? evaluatedAt.toISOString()
            : null
    };
};

export const authorizePosStaleShiftRecovery = ({
    shift,
    actorUser,
    reason,
    now = new Date(),
    staleAfterHours = resolvePosStaleShiftHours()
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
            'Only an open shift can be recovered.',
            {
                statusCode: 422,
                details: {
                    reason_code: POS_SHIFT_RECOVERY_REASON_CODES.SHIFT_NOT_OPEN
                }
            }
        );
    }

    if (!isMasterAdmin(actorUser)) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Only a master administrator can force-close a stale shift.',
            {
                statusCode: 403,
                details: {
                    reason_code: POS_SHIFT_RECOVERY_REASON_CODES.MASTER_ADMIN_REQUIRED
                }
            }
        );
    }

    const normalizedReason = String(reason || '').trim();
    if (normalizedReason.length < 8) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'A recovery reason of at least 8 characters is required.',
            {
                statusCode: 422,
                details: {
                    reason_code: POS_SHIFT_RECOVERY_REASON_CODES.REASON_REQUIRED
                }
            }
        );
    }

    const staleState = evaluatePosShiftStaleness({
        shift,
        now,
        staleAfterHours
    });
    if (!staleState.is_stale) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'This shift is not stale and must be closed by its operator.',
            {
                statusCode: 409,
                details: {
                    reason_code: POS_SHIFT_RECOVERY_REASON_CODES.SHIFT_NOT_STALE,
                    stale_recovery: staleState
                }
            }
        );
    }

    return {
        authorization_mode: 'master_admin_stale_recovery',
        actor_user_id: actorUserId,
        shift_cashier_id: toPositiveInteger(shift.cashier_id),
        reason: normalizedReason,
        ...staleState
    };
};
