import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveTenantEffectivePlan } from './tenantPlanPolicy.js';

const FORCE_NON_COMPLIANT_ALLOWED_STATES = new Set(['compliant_pending', 'compliant_active']);

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

const enrichTenant = (tenant) => {
    const baseTenant = toPlainTenant(tenant);
    const eligibility = buildForceNonCompliantEligibility(baseTenant);
    const effectivePlan = resolveTenantEffectivePlan(baseTenant);

    return {
        ...baseTenant,
        effective_plan: effectivePlan,
        plan_policy: effectivePlan !== baseTenant.plan ? 'registered_tenant_premium_capable' : 'stored_plan',
        ...eligibility
    };
};

export const buildListTenantsUseCase = ({ tenantAdminRepository, logger }) => {
    return async ({ status }) => {
        try {
            const where = {};
            if (status && status !== 'all') {
                where.status = status;
            }

            const tenants = await tenantAdminRepository.listTenants(where);
            const enrichedTenants = Array.isArray(tenants)
                ? tenants.map(enrichTenant)
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
