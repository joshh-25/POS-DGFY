export const ADMIN_ROUTE_POLICIES = Object.freeze([
    { path: '/admin/feedback', permission: 'admin.feedback' },
    { path: '/admin/contact-inquiries', permission: 'admin.contact_inquiries' },
    { path: '/admin/tenants', permission: 'admin.tenants' },
    { path: '/admin/tenants/billing', masterOnly: true },
    { path: '/admin/tenants/:id/billing', masterOnly: true },
    { path: '/admin/dgfy-accounts', permission: 'admin.dgfy_accounts' },
    { path: '/admin/payments', permission: 'admin.payments' },
    { path: '/admin/pricing', permission: 'admin.pricing' },
    { path: '/admin/hosting', permission: 'admin.hosting' },
    { path: '/admin/invoices', permission: 'admin.invoices' },
    { path: '/admin/push-diagnostics', permission: 'admin.push_diagnostics' },
    { path: '/admin/platform-admins', masterOnly: true },
    { path: '/admin/store-templates', masterOnly: true },
    { path: '/admin/external-discovery', masterOnly: true }
]);

const normalizePath = (value) => String(value || '').replace(/\/+$/, '') || '/';

const matchesRoute = (pathname, routePath) => {
    const pathSegments = normalizePath(pathname).split('/').filter(Boolean);
    const routeSegments = normalizePath(routePath).split('/').filter(Boolean);
    if (pathSegments.length < routeSegments.length) return false;
    return routeSegments.every((segment, index) => (
        segment.startsWith(':') ? Boolean(pathSegments[index]) : segment === pathSegments[index]
    ));
};

export const resolveAdminRoute = (pathname, routes = ADMIN_ROUTE_POLICIES) => {
    return routes
        .filter((route) => matchesRoute(pathname, route.path))
        .sort((left, right) => right.path.length - left.path.length)[0] || null;
};

export const canAccessAdminRoute = (route, adminProfile) => Boolean(
    route
    && (adminProfile?.is_master
        || (!route.masterOnly && adminProfile?.permissions?.includes(route.permission)))
);
