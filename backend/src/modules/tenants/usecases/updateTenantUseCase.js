import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { normalizeWorkflowMode } from '../../shared/constants/workflowModes.js';
import {
    isValidTenantPlan,
    normalizeRequestedTenantPlan,
    resolveRegisteredTenantPlan,
    resolveTenantPlanForUpdate
} from './tenantPlanPolicy.js';

const extractWorkflowModeFromTenant = (tenant) => {
    let settings = tenant?.settings || {};
    if (typeof settings === 'string') {
        try {
            settings = JSON.parse(settings);
        } catch {
            settings = {};
        }
    }
    return normalizeWorkflowMode(settings?.workflow_mode);
};

export const buildUpdateTenantUseCase = ({
    tenantAdminRepository,
    provisionTenant,
    emailService,
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
                const result = await provisionTenant({
                    tenantId: tenant.id,
                    name: tenant.name,
                    dbName: tenant.db_name,
                    companyToken: tenant.company_token,
                    adminEmail: tenant.admin_email,
                    adminPhone: tenant.admin_phone,
                    adminPasswordHash: tenant.admin_password_hash,
                    workflowMode: extractWorkflowModeFromTenant(tenant)
                });

                if (emailService?.isEmailConfigured?.()) {
                    try {
                        await emailService.sendCompanyApprovedEmail({
                            email: tenant.admin_email,
                            companyName: tenant.name,
                            companyToken: tenant.company_token
                        });
                    } catch (emailError) {
                        logger?.warn?.('[UpdateTenant] Failed to send approval email:', emailError.message);
                    }
                }

                const nextPlan = resolveRegisteredTenantPlan();
                if (nextPlan !== tenant.plan) {
                    const refreshed = await tenantAdminRepository.findTenantById(tenant.id);
                    await tenantAdminRepository.updateTenant(refreshed, { plan: nextPlan });
                }

                return ok({
                    statusCode: 200,
                    payload: {
                        success: true,
                        message: 'Tenant approved and provisioned successfully.',
                        data: { ...result, plan: nextPlan }
                    }
                });
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
