import bcrypt from 'bcryptjs';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const drawerAuthorizationError = (message, reasonCode, statusCode = 422) => {
    throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, message, {
        statusCode,
        details: { reason_code: reasonCode }
    });
};

const isAdminOperator = (operator) => {
    const role = String(operator?.role || '').trim().toLowerCase();
    return operator?.is_master_admin === true || ['admin', 'manager'].includes(role);
};

export const verifyPosDrawerOperator = async ({ operator, pin } = {}) => {
    if (!operator || operator.is_active !== true || operator.deleted_at) {
        drawerAuthorizationError('The current POS user is not active.', 'DRAWER_OPERATOR_INACTIVE', 403);
    }

    if (isAdminOperator(operator) && !String(pin || '').trim()) {
        return {
            user_id: Number(operator.user_id),
            username: String(operator.username || '').trim() || null,
            role: String(operator.role || '').trim().toLowerCase(),
            authorization_mode: 'admin_bypass'
        };
    }

    const normalizedPin = String(pin || '').trim();
    const pinHash = String(operator.pos_approval_pin_hash || '').trim();
    if (!pinHash) {
        drawerAuthorizationError('Your POS PIN is not configured. Set your personal POS PIN before opening the drawer.', 'DRAWER_PIN_NOT_CONFIGURED');
    }
    if (!/^[0-9]{4,12}$/.test(normalizedPin) || !await bcrypt.compare(normalizedPin, pinHash)) {
        drawerAuthorizationError('Invalid POS PIN.', 'DRAWER_PIN_INVALID', 403);
    }

    return {
        user_id: Number(operator.user_id),
        username: String(operator.username || '').trim() || null,
        role: String(operator.role || '').trim().toLowerCase(),
        authorization_mode: 'pin'
    };
};

export const isPosDrawerAdmin = isAdminOperator;

export default verifyPosDrawerOperator;
