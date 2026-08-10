const MAX_ROUTE_AUDIT_ENTRIES = 1000;
const routeAuditLog = [];

const BILLING_ROUTES = new Set([
    'POST /api/v1/payments/upgrade',
    'POST /api/v1/admin/tenants/register'
]);

const normalizeMethod = (method) => String(method || 'GET').toUpperCase();
const normalizeRoute = (route) => String(route || '').trim();

export const recordBillingRouteOutcome = ({
    method,
    route,
    statusCode,
    requestId,
    timestamp = new Date()
} = {}) => {
    const normalizedRoute = `${normalizeMethod(method)} ${normalizeRoute(route)}`;
    if (!BILLING_ROUTES.has(normalizedRoute)) {
        return;
    }

    routeAuditLog.push({
        route: normalizedRoute,
        statusCode: Number(statusCode) || 0,
        requestId: requestId || null,
        timestamp: timestamp instanceof Date ? timestamp : new Date(timestamp)
    });

    if (routeAuditLog.length > MAX_ROUTE_AUDIT_ENTRIES) {
        routeAuditLog.splice(0, routeAuditLog.length - MAX_ROUTE_AUDIT_ENTRIES);
    }
};

export const getBillingRouteOutcomes = ({
    now = new Date(),
    lookbackHours = 24
} = {}) => {
    const windowStart = new Date(now.getTime() - (lookbackHours * 60 * 60 * 1000));
    return routeAuditLog.filter((entry) => entry.timestamp >= windowStart);
};

export const __resetBillingRouteAuditForTests = () => {
    routeAuditLog.length = 0;
};

export default {
    recordBillingRouteOutcome,
    getBillingRouteOutcomes,
    __resetBillingRouteAuditForTests
};
