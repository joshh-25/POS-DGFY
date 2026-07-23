const ACCOUNT_ROUTE_SEGMENT = 'account';

export function normalizeCustomerDashboardRoutePath(pathname = '/') {
  return String(pathname || '').replace(/\/+$/, '') || '/';
}

export function isCustomerDashboardStandalonePath(pathname = '/') {
  const normalizedPath = normalizeCustomerDashboardRoutePath(pathname);
  return normalizedPath === '/map-dgfy/account' || normalizedPath === '/tenant-store/account';
}

export function buildCustomerDashboardRouteFlags({
  currentPathname = '/',
  routeSubpage = '',
  currentPathSubpage = ''
} = {}) {
  const normalizedCurrentPath = normalizeCustomerDashboardRoutePath(currentPathname);
  const isGlobalAccountPage = isCustomerDashboardStandalonePath(normalizedCurrentPath);
  const isTenantAccountPage = routeSubpage === ACCOUNT_ROUTE_SEGMENT || currentPathSubpage === ACCOUNT_ROUTE_SEGMENT;

  return {
    normalizedCurrentPath,
    isGlobalAccountPage,
    isTenantAccountPage,
    isStandaloneAccountPage: isGlobalAccountPage || isTenantAccountPage
  };
}

export default buildCustomerDashboardRouteFlags;
