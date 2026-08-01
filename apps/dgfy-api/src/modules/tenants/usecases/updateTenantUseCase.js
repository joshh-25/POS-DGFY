import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
    isValidTenantPlan,
    normalizeRequestedTenantPlan,
    resolveTenantPlanForUpdate
} from './tenantPlanPolicy.js';

export const buildUpdateTenantUseCase = ({
    tenantAdminRepository,
    logger
}) => {
    return async ({ id, body }) => {
        try {
            const { status, plan } = body || {};
            const requestedPlan = normalizeRequestedTenantPlan(plan);
            const tenant = await tenantAdminRepository.findTenantById(id);

            if (!tenant) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }

            if (tenant.status === 'pending' && status === 'active') {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Pending public registrations may only be activated by the dedicated approval workflow.',
                    { statusCode: 422 }
                ));
            }

            if (requestedPlan && !isValidTenantPlan(requestedPlan)) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Plan must be either standard or premium.',
                    { statusCode: 400 }
                ));
            }

            const updates = {};
            if (status) updates.status = status;
            const nextPlan = resolveTenantPlanForUpdate({
                currentStatus: tenant.status,
                requestedStatus: status,
                requestedPlan
            });
            if (nextPlan) updates.plan = nextPlan;

            const updatedTenant = await tenantAdminRepository.updateTenant(tenant, updates);

            return ok({
                statusCode: 200,
                payload: {
                    success: true,
                    message: 'Tenant updated successfully',
                    data: updatedTenant
                }
            });
        } catch (error) {
            logger?.error?.('Update tenant error:', error);
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message,
                { statusCode: 500 }
            ));
        }
    };
};
