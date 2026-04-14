import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { isWorkflowMode, normalizeWorkflowMode } from '../../shared/constants/workflowModes.js';

export const buildProvisionNewTenantUseCase = ({ provisionTenant, logger }) => {
    return async ({ body }) => {
        try {
            const {
                name,
                adminEmail,
                adminPassword,
                plan = 'standard',
                subscriptionId,
                complianceMode,
                workflowMode
            } = body || {};
            const normalizedComplianceMode = typeof complianceMode === 'string'
                ? complianceMode.trim().toLowerCase()
                : '';
            const normalizedWorkflowMode = normalizeWorkflowMode(workflowMode);

            if (
                !name
                || !adminEmail
                || !adminPassword
                || !['non_compliant', 'compliant'].includes(normalizedComplianceMode)
                || !isWorkflowMode(workflowMode)
            ) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Missing required fields: name, adminEmail, adminPassword, complianceMode, workflowMode',
                    { statusCode: 400 }
                ));
            }

            const result = await provisionTenant({
                name,
                adminEmail,
                adminPassword,
                plan,
                subscriptionId,
                complianceMode: normalizedComplianceMode,
                workflowMode: normalizedWorkflowMode
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
