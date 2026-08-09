import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { isWorkflowMode, normalizeWorkflowMode } from '../../shared/constants/workflowModes.js';
import { resolveRegisteredTenantPlan } from './tenantPlanPolicy.js';
import { isValidPhoneNumber, normalizePhoneNumber } from '../../../utils/phoneNumber.js';

export const buildProvisionNewTenantUseCase = ({ provisionTenant, logger }) => {
    return async ({ body }) => {
        try {
            const {
                name,
                adminEmail,
                adminPhone,
                adminPassword,
                subscriptionId,
                complianceMode,
                workflowMode,
                templateKey
            } = body || {};
            const normalizedComplianceMode = typeof complianceMode === 'string'
                ? complianceMode.trim().toLowerCase()
                : '';
            const normalizedWorkflowMode = normalizeWorkflowMode(workflowMode);

            if (
                !name
                || !adminEmail
                || !normalizePhoneNumber(adminPhone)
                || !adminPassword
                || !['non_compliant', 'compliant'].includes(normalizedComplianceMode)
                || !isWorkflowMode(workflowMode)
            ) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Missing required fields: name, adminEmail, adminPhone, adminPassword, complianceMode, workflowMode',
                    { statusCode: 400 }
                ));
            }
            const normalizedAdminPhone = normalizePhoneNumber(adminPhone);
            if (!isValidPhoneNumber(normalizedAdminPhone)) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'adminPhone must be a valid phone number.',
                    { statusCode: 400 }
                ));
            }

            const result = await provisionTenant({
                name,
                adminEmail,
                adminPhone: normalizedAdminPhone,
                adminPassword,
                plan: resolveRegisteredTenantPlan(),
                subscriptionId,
                complianceMode: normalizedComplianceMode,
                workflowMode: normalizedWorkflowMode,
                // Issue #178 Phase 17: optional, best-effort - see
                // tenantProvisioningService.js's provisionTenant doc comment.
                templateKey: templateKey ? String(templateKey).trim() : null
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
