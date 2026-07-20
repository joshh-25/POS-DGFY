import dbStore from '../utils/dbStore.js';

const buildTenantContextError = () => ({
    success: false,
    data: null,
    message: 'Company token required',
    error_code: 'TENANT_CONTEXT_MISSING',
    timestamp: new Date().toISOString()
});

const normalizeTenantValue = (value) => {
    if (value == null) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
};

export const requireTenantContext = (req, res, next) => {
    const requestTenantId = normalizeTenantValue(req?.tenant?.id);
    const contextTenantId = normalizeTenantValue(dbStore.getStore()?.tenantId);

    const hasTenantContext = (
        requestTenantId
        && contextTenantId
        && contextTenantId.toLowerCase() !== 'default'
        && contextTenantId === requestTenantId
    );

    if (!hasTenantContext) {
        return res.status(400).json(buildTenantContextError());
    }

    return next();
};

export default requireTenantContext;
