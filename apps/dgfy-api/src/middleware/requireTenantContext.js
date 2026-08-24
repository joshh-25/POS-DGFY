import dbStore from '../utils/dbStore.js';
import { resolveDegradedTenantContextFailure, sendTenantContextError } from './tenantHandler.js';

const normalizeTenantValue = (value) => {
    if (value == null) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
};

export const requireTenantContext = (req, res, next) => {
    const store = dbStore.getStore();
    const requestTenantId = normalizeTenantValue(req?.tenant?.id);
    const contextTenantId = normalizeTenantValue(store?.tenantId);

    const hasTenantContext = (
        requestTenantId
        && contextTenantId
        && contextTenantId.toLowerCase() !== 'default'
        && contextTenantId === requestTenantId
    );

    if (!hasTenantContext) {
        // Same flat-400-regardless-of-cause bug as auth.js had (issue #916) -- a
        // degraded/mismatched context here can equally mean "no company token,"
        // "invalid company token," or "tenant DB is unavailable," and only the first
        // of those is actually a 400. Delegate to the same mapping tenantHandler.js
        // already applies elsewhere rather than a second, divergent one here.
        const failure = resolveDegradedTenantContextFailure(store, {
            defaultMessage: 'Company token required',
            defaultErrorCode: 'TENANT_CONTEXT_MISSING'
        });
        return sendTenantContextError(res, failure.statusCode, failure.message, failure.errorCode);
    }

    return next();
};

export default requireTenantContext;
