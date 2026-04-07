import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const buildProvisionNewTenantUseCase = ({ provisionTenant, logger }) => {
    return async ({ body }) => {
        try {
            const { name, adminEmail, adminPassword, plan = 'standard', subscriptionId, complianceMode } = body || {};
            const normalizedComplianceMode = typeof complianceMode === 'string'
                ? complianceMode.trim().toLowerCase()
                : '';

            if (!name || !adminEmail || !adminPassword || !['non_compliant', 'compliant'].includes(normalizedComplianceMode)) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Missing required fields: name, adminEmail, adminPassword, complianceMode',
                    { statusCode: 400 }
                ));
            }

            const result = await provisionTenant({
                name,
                adminEmail,
                adminPassword,
                plan,
                subscriptionId,
                complianceMode: normalizedComplianceMode
            });

            return ok({
                statusCode: 201,
                payload: {
                    success: true,
                    data: result,
                    message: 'Tenant provisioned successfully'
                }
            });
        } catch (error) {
            logger?.error?.('Provisioning error:', error);
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Provisioning failed',
                { statusCode: 500 }
            ));
        }
    };
};
