const TENANTS_PATH = '/admin/tenants';

export const normalizeAdminRouteLabel = (pathname) => {
    const path = String(pathname || '');
    if (path === `${TENANTS_PATH}/new` || path === `${TENANTS_PATH}/billing`) return path;
    if (!path.startsWith(`${TENANTS_PATH}/`)) return path;

    const [, tenantId, ...suffix] = path.slice(TENANTS_PATH.length).split('/');
    if (!tenantId || tenantId === 'new') return path;
    return `${TENANTS_PATH}/:id${suffix.length ? `/${suffix.join('/')}` : ''}`;
};
