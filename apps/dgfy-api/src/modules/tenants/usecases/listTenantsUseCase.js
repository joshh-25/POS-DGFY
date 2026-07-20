import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveTenantEffectivePlan } from './tenantPlanPolicy.js';

const FORCE_NON_COMPLIANT_ALLOWED_STATES = new Set(['compliant_pending', 'compliant_active']);

const buildAdminComplianceModeAction = (tenant) => {
    const modeState = String(tenant?.compliance_mode_state || '').trim();
    const choiceRequired = tenant?.compliance_mode_choice_required === true;

    if (choiceRequired || !modeState) {
        return {
            action: 'select_mode',
            allowed: true,
            label: 'Set compliance mode',
            helper_text: 'Select non-compliant POS access or move the tenant into compliant pending mode.',
            options: ['non_compliant', 'compliant']
        };
    }

    if (modeState === 'non_compliant_active') {
        return {
            action: 'upgrade_to_compliant_pending',
            allowed: true,
            label: 'Move to compliant pending',
            helper_text: 'Moves the tenant into the compliant path. Fiscal activation still requires the checklist.',
            options: []
        };
    }

    if (FORCE_NON_COMPLIANT_ALLOWED_STATES.has(modeState)) {
        return {
            action: 'force_non_compliant',
            allowed: true,
            label: 'Force non-compliant',
            helper_text: 'Returns the tenant to non-fiscal POS access and disables fiscal output.',
            options: []
        };
    }

    return {
        action: 'none',
        allowed: false,
        label: 'Compliance mode unavailable',
        helper_text: 'Compliance lifecycle state is not supported for a platform-admin action.',
        options: []
    };
};

const toPlainTenant = (tenant) => {
    if (!tenant) return {};
    if (typeof tenant.get === 'function') {
        return tenant.get({ plain: true });
    }
    return { ...tenant };
};

const buildForceNonCompliantEligibility = (tenant) => {
    const modeState = String(tenant?.compliance_mode_state || '').trim();

    if (modeState === 'non_compliant_active') {
        return {
            can_force_non_compliant: false,
            force_non_compliant_block_reason: 'Tenant is already in non_compliant_active mode.'
        };
    }

    if (FORCE_NON_COMPLIANT_ALLOWED_STATES.has(modeState)) {
        return {
            can_force_non_compliant: true,
            force_non_compliant_block_reason: null
        };
    }

    if (!modeState) {
        return {
            can_force_non_compliant: false,
            force_non_compliant_block_reason: 'Compliance mode has not been selected yet.'
        };
    }

    return {
        can_force_non_compliant: false,
        force_non_compliant_block_reason: 'Platform force non-compliant override is only allowed from compliant_pending or compliant_active'
    };
};

const enrichTenant = (tenant, capabilities = null) => {
    const baseTenant = toPlainTenant(tenant);
    const eligibility = buildForceNonCompliantEligibility(baseTenant);
    const adminComplianceModeAction = buildAdminComplianceModeAction(baseTenant);
    const effectivePlan = resolveTenantEffectivePlan(baseTenant);

    return {
        ...baseTenant,
        effective_plan: effectivePlan,
        plan_policy: effectivePlan !== baseTenant.plan ? 'registered_tenant_premium_capable' : 'stored_plan',
        capabilities,
        admin_compliance_mode_action: adminComplianceModeAction,
        ...eligibility
    };
};

const mapWithConcurrency = async (items = [], limit = 5, mapper) => {
    const results = new Array(items.length);
    let cursor = 0;
    const workerCount = Math.min(Math.max(Number(limit) || 1, 1), items.length || 1);
    const workers = Array.from({ length: workerCount }, async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await mapper(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
};

export const buildListTenantsUseCase = ({ tenantAdminRepository, tenantConnector, readTenantCapabilities, logger }) => {
    return async ({ status }) => {
        try {
            const where = {};
            if (status && status !== 'all') {
                where.status = status;
            }

            const tenants = await tenantAdminRepository.listTenants(where);
            const enrichedTenants = Array.isArray(tenants)
                ? await mapWithConcurrency(tenants, 5, async (tenant) => {
                    let capabilities = null;
                    const plainTenant = toPlainTenant(tenant);
                    if (plainTenant.status === 'active' && tenantConnector && readTenantCapabilities) {
                        try {
                            capabilities = await readTenantCapabilities({ tenant: plainTenant, tenantConnector });
                        } catch (capabilityError) {
                            logger?.warn?.('[ListTenants] Failed to load tenant capability settings', {
                                tenantId: plainTenant.id || null,
                                error: capabilityError.message
                            });
                            capabilities = { unavailable: true };
                        }
                    }
                    return enrichTenant(plainTenant, capabilities);
                })
                : [];

            return ok({
                statusCode: 200,
                payload: {
                    success: true,
                    data: enrichedTenants
                }
            });
        } catch (error) {
            logger?.error?.('List tenants error:', error);
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message,
                { statusCode: 500 }
            ));
        }
    };
};
