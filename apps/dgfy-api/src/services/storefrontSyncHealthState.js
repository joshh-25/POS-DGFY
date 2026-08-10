const syncHealthByTenant = new Map();

const safeIsoNow = () => new Date().toISOString();

export const recordStorefrontSyncHealth = ({
    tenantId,
    ok = false,
    source = 'unknown_source',
    attempts = 0,
    reconciled = false,
    errors = [],
    result = null
} = {}) => {
    const normalizedTenantId = String(tenantId || '').trim();
    if (!normalizedTenantId) return null;

    const status = ok ? 'healthy' : 'degraded';
    const payload = {
        tenant_id: normalizedTenantId,
        status,
        source: String(source || 'unknown_source'),
        attempts: Number.isFinite(Number(attempts)) ? Number(attempts) : 0,
        reconciled: reconciled === true,
        errors: Array.isArray(errors) ? errors.slice(0, 8) : [],
        last_checked_at: safeIsoNow(),
        result_status: result?.status || null
    };

    syncHealthByTenant.set(normalizedTenantId, payload);
    return payload;
};

export const getStorefrontSyncHealth = ({ tenantId } = {}) => {
    const normalizedTenantId = String(tenantId || '').trim();
    if (!normalizedTenantId) return null;
    return syncHealthByTenant.get(normalizedTenantId) || null;
};

export const __resetStorefrontSyncHealthStateForTests = () => {
    syncHealthByTenant.clear();
};

