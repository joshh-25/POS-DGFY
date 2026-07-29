import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const buildRejectTenantUseCase = ({ tenantAdminRepository, companyRegistrationRepository, emailService, logger }) => {
    return async ({ id, reason, actor }) => {
        try {
            const safeReason = String(reason || '').trim().slice(0, 500);
            if (!safeReason) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'A short applicant-visible rejection reason is required.',
                    { statusCode: 422 }
                ));
            }
            const tenant = await tenantAdminRepository.findTenantById(id);
            if (!tenant) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }

            if (tenant.status !== 'pending') {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    `Cannot reject tenant with status: ${tenant.status}`,
                    { statusCode: 400 }
                ));
            }

            await tenantAdminRepository.updateTenant(tenant, {
                status: 'rejected',
                rejection_reason: safeReason,
                settings: { ...tenant.settings, rejection_reason: safeReason }
            });
            await companyRegistrationRepository.markRejected({ tenantId: tenant.id, actor, reason: safeReason });

            let emailSent = false;
            if (emailService?.isEmailConfigured?.()) {
                try {
                    await emailService.sendCompanyRejectedEmail({
                        email: tenant.admin_email,
                        companyName: tenant.name,
                        rejectionReason: safeReason
                    });
                    emailSent = true;
                    logger?.info?.(`[TenantRejection] Rejection email sent to ${tenant.admin_email}`);
                } catch (emailError) {
                    logger?.warn?.(
                        `[TenantRejection] Failed to send rejection email to ${tenant.admin_email}: ${emailError.message}`
                    );
                }
            }

            return ok({
                statusCode: 200,
                payload: {
                    success: true,
                    message: 'Tenant registration rejected',
                    data: { id: tenant.id, status: 'rejected', email_sent: emailSent }
                }
            });
        } catch (error) {
            logger?.error?.('Reject tenant error:', error);
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message,
                { statusCode: 500 }
            ));
        }
    };
};
