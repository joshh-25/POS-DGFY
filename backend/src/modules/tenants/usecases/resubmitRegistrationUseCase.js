import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

/**
 * Allows a previously rejected user to re-submit their registration request.
 * Resets status from 'rejected' back to 'pending' and clears the rejection reason.
 */
export const buildResubmitRegistrationUseCase = ({
    tenantAdminRepository,
    emailService,
    logger
}) => {
    return async ({ tenantId, dgfyAccountId }) => {
        const tenant = await tenantAdminRepository.findTenantById(tenantId);
        if (!tenant) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_NOT_FOUND,
                'Tenant not found',
                { statusCode: 404 }
            ));
        }

        if (!dgfyAccountId || tenant.owner_dgfy_account_id !== dgfyAccountId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'Only the DGFY account that submitted this application may resubmit it.',
                { statusCode: 403 }
            ));
        }

        if (tenant.status !== 'rejected') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Only rejected registrations can be re-submitted.',
                { statusCode: 400 }
            ));
        }

        await tenant.update({
            status: 'pending',
            rejection_reason: null
        });

        if (emailService?.isEmailConfigured?.()) {
            await emailService.sendResubmissionConfirmationEmail({
                email: tenant.admin_email,
                companyName: tenant.name
            }).catch(err => logger?.warn?.('Email send failed (resubmission):', err.message));
        }

        logger?.info?.(`Tenant ${tenant.name} re-submitted registration (was rejected).`);

        return ok({
            status: 'pending',
            message: 'Your registration has been re-submitted for review.'
        });
    };
};
