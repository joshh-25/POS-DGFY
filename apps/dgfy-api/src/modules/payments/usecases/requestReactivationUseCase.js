import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

/**
 * An inactive tenant requests manual reactivation via email to the platform admin.
 * This does NOT reactivate the tenant — it simply notifies the admin and stamps
 * `reactivation_requested_at` so the admin can act on it.
 */
export const buildRequestReactivationUseCase = ({
    paymentRepository,
    emailService,
    logger
}) => {
    return async ({ tenantId }) => {
        const tenant = await paymentRepository.findTenantById(tenantId);
        if (!tenant) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_NOT_FOUND,
                'Tenant not found',
                { statusCode: 404 }
            ));
        }

        if (tenant.status !== 'inactive') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Only inactive accounts can request reactivation.',
                { statusCode: 400 }
            ));
        }

        await tenant.update({ reactivation_requested_at: new Date() });

        const adminEmail = process.env.PLATFORM_ADMIN_EMAIL || process.env.SMTP_USER;
        if (adminEmail && emailService?.isEmailConfigured?.()) {
            await emailService.sendReactivationRequestEmail({
                email: adminEmail,
                companyName: tenant.name
            }).catch(err => logger?.warn?.('Email send failed (reactivation request):', err.message));
        }

        logger?.info?.(`Reactivation requested for tenant ${tenant.name}.`);

        return ok({ requested: true, message: 'Reactivation request submitted. You will be contacted shortly.' });
    };
};
