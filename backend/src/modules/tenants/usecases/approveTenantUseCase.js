import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const buildApproveTenantUseCase = ({
    tenantAdminRepository,
    provisionTenant,
    emailService,
    logger
}) => {
    return async ({ id }) => {
        try {
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
                    `Cannot approve tenant with status: ${tenant.status}`,
                    { statusCode: 400 }
                ));
            }

            const result = await provisionTenant({
                tenantId: tenant.id,
                name: tenant.name,
                dbName: tenant.db_name,
                companyToken: tenant.company_token,
                adminEmail: tenant.admin_email,
                adminPasswordHash: tenant.admin_password_hash
            });

            let emailSent = false;
            if (emailService?.isEmailConfigured?.()) {
                try {
                    await emailService.sendCompanyApprovedEmail({
                        email: tenant.admin_email,
                        companyName: tenant.name,
                        companyToken: tenant.company_token
                    });
                    emailSent = true;
                    logger?.info?.(`[TenantApproval] Approval email sent to ${tenant.admin_email}`);
                } catch (emailError) {
                    logger?.warn?.(
                        `[TenantApproval] Failed to send approval email to ${tenant.admin_email}: ${emailError.message}`
                    );
                }
            }

            return ok({
                statusCode: 200,
                payload: {
                    success: true,
                    message: 'Tenant approved and provisioned successfully',
                    data: { ...result, email_sent: emailSent }
                }
            });
        } catch (error) {
            logger?.error?.('Approve tenant error:', error);
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message,
                { statusCode: 500 }
            ));
        }
    };
};
