import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { normalizeWorkflowMode } from '../../shared/constants/workflowModes.js';
import { resolveRegisteredTenantPlan } from './tenantPlanPolicy.js';
import { resolveCompanyRegistrationStatusUrl } from '../entities/companyRegistrationStatusUrl.js';

const parseTenantSettings = (tenant) => {
    const rawSettings = tenant?.settings;
    if (!rawSettings) return {};

    let parsedSettings = rawSettings;
    if (typeof parsedSettings === 'string') {
        try {
            parsedSettings = JSON.parse(parsedSettings);
        } catch {
            parsedSettings = {};
        }
    }

    return parsedSettings || {};
};

const extractWorkflowModeFromTenant = (tenant) => (
    normalizeWorkflowMode(parseTenantSettings(tenant)?.workflow_mode)
);

// issue #178 "templates become the Operating Mode" follow-up: a tenant
// registered through the Industry picker carries the derived template key
// in its settings JSON (registerCompanyRequestUseCase.js). Tenants
// registered before this change, or via a caller that only sent
// workflowMode, simply have no key here - provisionTenant's own
// resolveProvisioningTemplateSelection falls back to the canonical preset
// for the mode exactly as it always has, so this is additive only.
const extractStoreTemplateKeyFromTenant = (tenant) => {
    const key = parseTenantSettings(tenant)?.store_template_key;
    return typeof key === 'string' && key.trim() ? key.trim() : null;
};

export const buildApproveTenantUseCase = ({
    tenantAdminRepository,
    companyRegistrationRepository,
    dgfyAccountRepository,
    provisionTenant,
    createPayMongoChildAccountForTenant = null,
    shouldAutoCreatePayMongoChildAccounts = () => false,
    emailService,
    logger
}) => {
    return async ({ id, actor, retry = false }) => {
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
                    `Cannot ${retry ? 'retry provisioning for' : 'approve'} tenant with status: ${tenant.status}`,
                    { statusCode: 400 }
                ));
            }

            const application = await companyRegistrationRepository.markProvisioningStarted({ tenantId: tenant.id, actor, retry });
            if (!application) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    retry ? 'Only an approved registration with failed provisioning can be retried.' : 'This tenant is not a pending public registration application.',
                    { statusCode: 422 }
                ));
            }

            let result;
            try {
                result = await provisionTenant({
                tenantId: tenant.id,
                name: tenant.name,
                dbName: tenant.db_name,
                companyToken: tenant.company_token,
                adminEmail: tenant.admin_email,
                adminPhone: tenant.admin_phone,
                adminPasswordHash: tenant.admin_password_hash,
                    workflowMode: extractWorkflowModeFromTenant(tenant),
                    templateKey: extractStoreTemplateKeyFromTenant(tenant)
                });
                await dgfyAccountRepository.upsertFounderMembership({
                    dgfyAccountId: tenant.owner_dgfy_account_id,
                    tenantId: tenant.id,
                    tenantUserId: result?.admin_user_id || null,
                    role: 'admin'
                });
                await companyRegistrationRepository.markProvisioningOutcome({ tenantId: tenant.id, succeeded: true });
            } catch (provisioningError) {
                await companyRegistrationRepository.markProvisioningOutcome({ tenantId: tenant.id, succeeded: false, details: { error: provisioningError.message } });
                throw provisioningError;
            }

            let paymongoChildAccountStatus = 'skipped';
            if (shouldAutoCreatePayMongoChildAccounts() && typeof createPayMongoChildAccountForTenant === 'function') {
                try {
                    const paymongoResult = await createPayMongoChildAccountForTenant({
                        tenantId: tenant.id,
                        payload: { trade_name: tenant.name },
                        actor: 'tenant_approval'
                    });
                    paymongoChildAccountStatus = paymongoResult?.data?.idempotent_replay ? 'existing' : 'created';
                    if (paymongoResult?.success === false || paymongoResult?.error) {
                        paymongoChildAccountStatus = 'failed';
                        logger?.warn?.('[TenantApproval] PayMongo child account creation did not complete', {
                            tenant_id: tenant.id,
                            error: paymongoResult?.error?.message || paymongoResult?.message || 'unknown_error'
                        });
                    }
                } catch (paymongoError) {
                    paymongoChildAccountStatus = 'failed';
                    logger?.warn?.('[TenantApproval] PayMongo child account creation failed after tenant provisioning', {
                        tenant_id: tenant.id,
                        error: paymongoError.message
                    });
                }
            }

            let emailSent = false;
            if (emailService?.isEmailConfigured?.()) {
                try {
                    await emailService.sendCompanyApprovedEmail({
                        email: tenant.admin_email,
                        companyName: tenant.name,
                        statusUrl: resolveCompanyRegistrationStatusUrl(application.id)
                    });
                    emailSent = true;
                    logger?.info?.(`[TenantApproval] Approval email sent to ${tenant.admin_email}`);
                } catch (emailError) {
                    logger?.warn?.(
                        `[TenantApproval] Failed to send approval email to ${tenant.admin_email}: ${emailError.message}`
                    );
                }
            }

            const registeredPlan = resolveRegisteredTenantPlan();
            if (tenant.plan !== registeredPlan) {
                await tenantAdminRepository.updateTenant(tenant, { plan: registeredPlan });
            }

            return ok({
                statusCode: 200,
                payload: {
                    success: true,
                    message: retry ? 'Tenant provisioning retry completed successfully' : 'Tenant approved and provisioned successfully',
                    data: { ...result, email_sent: emailSent, paymongo_child_account_status: paymongoChildAccountStatus }
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
