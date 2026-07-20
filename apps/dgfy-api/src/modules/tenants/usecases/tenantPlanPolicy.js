export const REGISTERED_TENANT_PLAN = 'premium';

const REGISTERED_TENANT_STATUSES = new Set(['pending', 'active']);

export const isRegisteredTenantStatus = (status) => REGISTERED_TENANT_STATUSES.has(status);

export const normalizeRequestedTenantPlan = (plan) => (
    typeof plan === 'string' ? plan.trim().toLowerCase() : ''
);

export const isValidTenantPlan = (plan) => ['standard', REGISTERED_TENANT_PLAN].includes(plan);

export const resolveRegisteredTenantPlan = () => REGISTERED_TENANT_PLAN;

export const resolveTenantPlanForUpdate = ({ currentStatus, requestedStatus, requestedPlan }) => {
    const nextStatus = requestedStatus || currentStatus;
    if (isRegisteredTenantStatus(nextStatus)) {
        return REGISTERED_TENANT_PLAN;
    }

    const normalizedRequestedPlan = normalizeRequestedTenantPlan(requestedPlan);
    return normalizedRequestedPlan || null;
};

export const resolveTenantEffectivePlan = (tenant = {}) => {
    if (isRegisteredTenantStatus(tenant.status)) {
        return REGISTERED_TENANT_PLAN;
    }

    const normalizedPlan = normalizeRequestedTenantPlan(tenant.plan);
    return normalizedPlan || REGISTERED_TENANT_PLAN;
};
