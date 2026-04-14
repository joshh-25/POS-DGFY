import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { normalizeWorkflowMode } from '../../shared/constants/workflowModes.js';

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

                if (plan && plan !== tenant.plan) {
                    const refreshed = await tenantAdminRepository.findTenantById(tenant.id);
                    await tenantAdminRepository.updateTenant(refreshed, { plan });
                }

                return ok({
                    statusCode: 200,
                    payload: {
                        success: true,
                        message: 'Tenant approved and provisioned successfully.',
                        data: { ...result, plan: plan || tenant.plan }
                    }
                });
            }

            const updates = {};
            if (status) updates.status = status;
            if (plan) updates.plan = plan;

            await tenantAdminRepository.updateTenant(tenant, updates);

            return ok({
                statusCode: 200,
                payload: {
                    success: true,
                    message: 'Tenant updated successfully',
                    data: tenant
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
