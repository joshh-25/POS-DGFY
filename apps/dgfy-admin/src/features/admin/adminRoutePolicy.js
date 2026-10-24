export const ADMIN_ROUTE_POLICIES = Object.freeze([
    { path: '/admin/feedback', permission: 'admin.feedback' },
    { path: '/admin/contact-inquiries', permission: 'admin.contact_inquiries' },
    { path: '/admin/tenants', permission: 'admin.tenants' },
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

export const resolveAdminRoute = (pathname, routes = ADMIN_ROUTE_POLICIES) => {
    const path = String(pathname || '');
    return routes
        .filter((route) => path === route.path || path.startsWith(`${route.path}/`))
        .sort((left, right) => right.path.length - left.path.length)[0] || null;
};

export const canAccessAdminRoute = (route, adminProfile) => Boolean(
    route
    && (adminProfile?.is_master
        || (!route.masterOnly && adminProfile?.permissions?.includes(route.permission)))
);
