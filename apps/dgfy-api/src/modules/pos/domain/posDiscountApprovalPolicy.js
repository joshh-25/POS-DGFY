import bcrypt from 'bcryptjs';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const POS_DISCOUNT_AUTHORIZATION_PERMISSION = 'pos:discount_authorize';

const approvalError = (message, reasonCode, statusCode = 422) => {
    throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, message, {
        statusCode,
        details: { reason_code: reasonCode }
    });
};

const normalizedEmail = (value) => String(value || '').trim().toLowerCase();
const positiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

export const verifyPosDiscountApprover = async ({
    approver,
    pin,
    employeeUserId = null,
    employeeDirectoryId = null,
    employeeEmail = '',
    allowSelfApproval = false,
    applyingUserId = null
}) => {
    if (!approver || approver.is_active !== true || approver.deleted_at) {
        approvalError('Select an active POS discount approver.', 'DISCOUNT_APPROVER_INACTIVE');
    }
    const role = String(approver.role || '').trim().toLowerCase();
    const permissions = Array.isArray(approver.permissions)
        ? approver.permissions
        : (typeof approver.permissions === 'string'
            ? (() => {
                try {
                    const parsed = JSON.parse(approver.permissions);
                    return Array.isArray(parsed) ? parsed : [];
                } catch {
                    return [];
                }
            })()
            : []);
    const hasDiscountAuthorization = approver.can_authorize_discounts === true
        || approver.is_master_admin === true
        || ['admin', 'manager'].includes(role)
        || permissions.includes(POS_DISCOUNT_AUTHORIZATION_PERMISSION);
    if (!hasDiscountAuthorization) {
        approvalError('Selected employee is not authorized to approve POS discounts.', 'DISCOUNT_APPROVER_ROLE_INVALID', 403);
    }
    const pinHash = String(approver.pos_approval_pin_hash || '').trim();
    if (!pinHash) {
        approvalError('Selected approver has no POS approval PIN configured.', 'DISCOUNT_APPROVER_PIN_NOT_CONFIGURED');
    }
    const normalizedPin = String(pin || '').trim();
    if (!/^[0-9]{4,12}$/.test(normalizedPin) || !await bcrypt.compare(normalizedPin, pinHash)) {
        approvalError('Invalid POS approval PIN.', 'DISCOUNT_APPROVER_PIN_INVALID', 403);
    }
    const beneficiaryMatchesApprover = Boolean(
        (employeeUserId && Number(employeeUserId) === Number(approver.user_id))
        || (normalizedEmail(employeeEmail)
            && normalizedEmail(employeeEmail) === normalizedEmail(approver.email))
    );
    const approverIsApplyingUser = positiveInt(applyingUserId) === positiveInt(approver.user_id);
    if (positiveInt(employeeDirectoryId) && approverIsApplyingUser && !normalizedEmail(employeeEmail)) {
        approvalError(
            'The selected employee needs an email before self-approval can be verified.',
            'DISCOUNT_SELF_APPROVAL_IDENTITY_UNVERIFIED',
            403
        );
    }
    if (beneficiaryMatchesApprover && allowSelfApproval !== true) {
        approvalError('Employees cannot approve their own discount.', 'DISCOUNT_SELF_APPROVAL_BLOCKED', 403);
    }
    if (beneficiaryMatchesApprover && !approverIsApplyingUser) {
        approvalError(
            'Self-approval must be completed by the authenticated cashier receiving the discount.',
            'DISCOUNT_SELF_APPROVAL_ACTOR_MISMATCH',
            403
        );
    }
    return {
        user_id: Number(approver.user_id),
        username: String(approver.username || '').trim(),
        role,
        self_approved: beneficiaryMatchesApprover && approverIsApplyingUser
    };
};

export default verifyPosDiscountApprover;
