const disabled = (value) => ['0', 'false', 'no', 'off'].includes(String(value || '').trim().toLowerCase());
const identifiers = (tenant = {}) => [tenant.id, tenant.tenant_id, tenant.company_token, tenant.slug, tenant.name]
    .map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);

export const isBusinessAdminDashboardEnabled = (tenant = {}) => {
    if (process.env.NODE_ENV !== 'production' && process.env.BUSINESS_ADMIN_DASHBOARD_ENABLED === undefined) return true;
    if (!disabled(process.env.BUSINESS_ADMIN_DASHBOARD_ENABLED)) return true;
    const allowed = String(process.env.BUSINESS_ADMIN_DASHBOARD_ENABLED_TENANTS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
    return allowed.includes('*') || identifiers(tenant).some((value) => allowed.includes(value));
};
