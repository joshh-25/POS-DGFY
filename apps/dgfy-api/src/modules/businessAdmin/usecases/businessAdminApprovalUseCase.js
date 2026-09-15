import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveBusinessAdminAccess, userHasBusinessAdminPermission } from '../domain/businessAdminAccessPolicy.js';
import { PERMISSIONS } from '../../../config/permissions.js';

const APPROVAL_STATUSES = new Set(['pending', 'approved', 'rejected', 'executed', 'expired', 'cancelled']);

const canReviewBusinessAdminApprovals = (user = {}) => {
    const access = resolveBusinessAdminAccess(user);
    const canReview = user?.is_master_admin === true
        || userHasBusinessAdminPermission(user, PERMISSIONS.BUSINESS_ADMIN.actions.APPROVE_HIGH_RISK);

    return {
        allowed: access.allowed && access.scope === 'all' && canReview,
        access,
        canReview
    };
};

const highRiskApprovalAccessFailure = () => ({
    success: false,
    error: new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Tenant-wide high-risk approval access is required.', { statusCode: 403 })
});

export const buildListBusinessAdminApprovalsUseCase = ({ businessAdminOverviewRepository }) => async ({ query = {}, user = {} } = {}) => {
    const approvalAccess = canReviewBusinessAdminApprovals(user);
    if (!approvalAccess.allowed) return highRiskApprovalAccessFailure();
    const status = String(query.status || '').trim().toLowerCase();
    if (status && !APPROVAL_STATUSES.has(status)) {
        return { success: false, error: new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Approval status is invalid.', { statusCode: 422 }) };
    }
    return {
        success: true,
        data: {
            approvals: await businessAdminOverviewRepository.listApprovalRequests({
                status,
                limit: query.limit
            })
        }
    };
};

export const buildDecideBusinessAdminApprovalUseCase = ({ decidePosExceptionApprovalUseCase }) => async ({
    approvalRequestId,
    decision,
    note = '',
    user = {}
} = {}) => {
    const approvalAccess = canReviewBusinessAdminApprovals(user);
    if (!approvalAccess.allowed) return highRiskApprovalAccessFailure();

    if (typeof decidePosExceptionApprovalUseCase !== 'function') {
        return {
            success: false,
            error: new DomainError(
                DomainErrorCode.CONFLICT,
                'This approval action is unavailable until its canonical POS owner contract is enabled.',
                { statusCode: 409, details: { reason_code: 'BUSINESS_ADMIN_APPROVAL_OWNER_UNAVAILABLE' } }
            )
        };
    }

    return decidePosExceptionApprovalUseCase({
        approvalRequestId,
        decision,
        note,
        user
    });
};

export const buildCancelBusinessAdminApprovalUseCase = ({ cancelPosExceptionApprovalUseCase }) => async ({
    approvalRequestId,
    note = '',
    user = {}
} = {}) => {
    const approvalAccess = canReviewBusinessAdminApprovals(user);
    if (!approvalAccess.allowed) return highRiskApprovalAccessFailure();

    if (typeof cancelPosExceptionApprovalUseCase !== 'function') {
        return {
            success: false,
            error: new DomainError(
                DomainErrorCode.CONFLICT,
                'This approval cancellation is unavailable until its canonical POS owner contract is enabled.',
                { statusCode: 409, details: { reason_code: 'BUSINESS_ADMIN_APPROVAL_OWNER_UNAVAILABLE' } }
            )
        };
    }

    return cancelPosExceptionApprovalUseCase({
        approvalRequestId,
        note,
        user
    });
};
