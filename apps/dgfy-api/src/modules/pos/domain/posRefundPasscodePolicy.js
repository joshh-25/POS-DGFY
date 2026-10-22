import bcrypt from 'bcryptjs';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolvePosGlobalPinHash } from './posGlobalPinPolicy.js';
import { isPermissionEffective } from '@sieitzz/shared-constants/permissionDependencies';

const POS_REFUND_AUTHORIZATION_PERMISSION = 'pos:discount_authorize';
const POS_REFUND_PASSCODE_PATTERN = /^[0-9]{4,12}$/;

const refundPasscodeError = (message, reasonCode, statusCode = 422) => {
    throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, message, {
        statusCode,
        details: { reason_code: reasonCode }
    });
};

const normalizePermissions = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const canAuthorizeRefund = (approver) => {
    const role = String(approver?.role || '').trim().toLowerCase();
    return approver?.can_authorize_discounts === true
        || approver?.is_master_admin === true
        || ['admin', 'manager'].includes(role)
        || isPermissionEffective(
            normalizePermissions(approver?.permissions),
            POS_REFUND_AUTHORIZATION_PERMISSION,
            approver?.is_master_admin === true
        );
};

/**
 * Verifies a UTAK-style refund passcode without exposing approval PIN hashes to
 * the client. The repository supplies only active, tenant-scoped approvers.
 */
export const verifyPosRefundPasscode = async ({ approvers = [], passcode } = {}) => {
    const normalizedPasscode = String(passcode || '').trim();
    if (!POS_REFUND_PASSCODE_PATTERN.test(normalizedPasscode)) {
        refundPasscodeError(
            'Refund passcode must contain 4 to 12 digits.',
            'POS_REFUND_PASSCODE_INVALID'
        );
    }

    let hasConfiguredPasscode = false;
    for (const approver of Array.isArray(approvers) ? approvers : []) {
        if (!approver || approver.is_active !== true || approver.deleted_at || !canAuthorizeRefund(approver)) {
            continue;
        }
        const pinHash = resolvePosGlobalPinHash(approver, ['pos_approval_pin_hash']);
        if (!pinHash) continue;
        hasConfiguredPasscode = true;
        if (await bcrypt.compare(normalizedPasscode, pinHash)) {
            return {
                user_id: Number(approver.user_id),
                username: String(approver.username || '').trim(),
                role: String(approver.role || '').trim().toLowerCase()
            };
        }
    }

    if (!hasConfiguredPasscode) {
        refundPasscodeError(
            'No authorized global POS PIN is configured.',
            'POS_REFUND_PASSCODE_NOT_CONFIGURED'
        );
    }
    refundPasscodeError('Invalid global POS PIN.', 'POS_REFUND_PASSCODE_INVALID', 403);
};

export default verifyPosRefundPasscode;
