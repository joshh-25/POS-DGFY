import bcrypt from 'bcryptjs';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const dayCloseError = (message, reasonCode, statusCode = 422) => {
    throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, message, {
        statusCode,
        details: { reason_code: reasonCode }
    });
};

export const verifyPosDayCloseOperator = async ({ operator, pin }) => {
    if (!operator || operator.is_active !== true || operator.deleted_at) {
        dayCloseError('The current cashier is not active for day close.', 'DAY_CLOSE_OPERATOR_INACTIVE', 403);
    }

    const pinHash = String(operator.pos_day_close_pin_hash || '').trim();
    if (!pinHash) {
        dayCloseError('Your POS Day Close PIN is not configured. Set your personal PIN from DGFY Business before closing the day.', 'DAY_CLOSE_PIN_NOT_CONFIGURED');
    }

    const normalizedPin = String(pin || '').trim();
    if (!/^[0-9]{4,12}$/.test(normalizedPin) || !await bcrypt.compare(normalizedPin, pinHash)) {
        dayCloseError('Invalid POS Day Close PIN.', 'DAY_CLOSE_PIN_INVALID', 403);
    }

    return {
        user_id: Number(operator.user_id),
        username: String(operator.username || '').trim() || null
    };
};

export default verifyPosDayCloseOperator;
