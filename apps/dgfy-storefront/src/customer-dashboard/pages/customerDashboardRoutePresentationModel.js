const ACCOUNT_ROUTE_SEGMENT = 'account';

export const CUSTOMER_DASHBOARD_DEFAULT_TAB = 'overview';

const CUSTOMER_DASHBOARD_TAB_ROUTE_SEGMENTS = Object.freeze({
  overview: 'overview',
  orders: 'orders',
  bookings: 'bookings',
  addresses: 'addresses',
  affiliate: 'affiliate',
  account: 'settings',
  business: 'business'
});

const CUSTOMER_DASHBOARD_ROUTE_SEGMENT_TO_TAB = Object.freeze(
  Object.fromEntries(
    Object.entries(CUSTOMER_DASHBOARD_TAB_ROUTE_SEGMENTS).map(([tab, segment]) => [segment, tab])
  )
);

const CUSTOMER_DASHBOARD_ROUTE_PATTERNS = Object.freeze([
  { kind: 'global', pattern: /^\/map-dgfy\/account(?:\/([^/]+))?$/i },
  { kind: 'tenant', pattern: /^\/(tenant-store|store|s)\/([^/]+)\/account(?:\/([^/]+))?$/i },
  // Custom storefront domains resolve the tenant context before rendering and
  // therefore expose the account route without a tenant-store prefix.
  { kind: 'tenant', scope: 'custom-domain', pattern: /^\/account(?:\/([^/]+))?$/i }
]);

export function normalizeCustomerDashboardRoutePath(pathname = '/') {
  return String(pathname || '').replace(/\/+$/, '') || '/';
}

function matchCustomerDashboardRoute(pathname = '/') {
  const normalizedPath = normalizeCustomerDashboardRoutePath(pathname);
  for (const entry of CUSTOMER_DASHBOARD_ROUTE_PATTERNS) {
    const match = normalizedPath.match(entry.pattern);
    if (!match) continue;
    if (entry.kind === 'global') {
      return { ...entry, basePath: '/map-dgfy/account', routeSegment: match[1] || '' };
    }
    if (entry.scope === 'custom-domain') {
      return { ...entry, basePath: '/account', routeSegment: match[1] || '' };
    }
    return {
      ...entry,
      basePath: `/${match[1]}/${match[2]}/account`,
      routeSegment: match[3] || ''
    };
  }
  return null;
}

const normalizeDashboardTab = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'settings') return 'account';
  return Object.prototype.hasOwnProperty.call(CUSTOMER_DASHBOARD_TAB_ROUTE_SEGMENTS, normalized)
    ? normalized
    : CUSTOMER_DASHBOARD_DEFAULT_TAB;
};

export function getCustomerDashboardTabFromLocation({ pathname = '/', search = '' } = {}) {
  const route = matchCustomerDashboardRoute(pathname);
  if (!route) return null;

  const routeTab = CUSTOMER_DASHBOARD_ROUTE_SEGMENT_TO_TAB[route.routeSegment];
  if (routeTab) return routeTab;

  const queryTab = new URLSearchParams(search || '').get('tab');
  return normalizeDashboardTab(queryTab);
}

export function buildCustomerDashboardTabPath({ pathname = '/', tab = CUSTOMER_DASHBOARD_DEFAULT_TAB } = {}) {
  const route = matchCustomerDashboardRoute(pathname) || { basePath: '/map-dgfy/account' };
  const routeSegment = CUSTOMER_DASHBOARD_TAB_ROUTE_SEGMENTS[normalizeDashboardTab(tab)]
    || CUSTOMER_DASHBOARD_TAB_ROUTE_SEGMENTS[CUSTOMER_DASHBOARD_DEFAULT_TAB];
  return `${route.basePath}/${routeSegment}`;
}

export function isCustomerDashboardStandalonePath(pathname = '/') {
  return Boolean(matchCustomerDashboardRoute(pathname));
}

export function isCustomerDashboardGlobalPath(pathname = '/') {
  return matchCustomerDashboardRoute(pathname)?.kind === 'global';
}

export function buildCustomerDashboardRouteFlags({
  currentPathname = '/',
  routeSubpage = '',
  currentPathSubpage = ''
} = {}) {
  const normalizedCurrentPath = normalizeCustomerDashboardRoutePath(currentPathname);
  const dashboardRoute = matchCustomerDashboardRoute(normalizedCurrentPath);
  const isGlobalAccountPage = dashboardRoute?.kind === 'global';
  const isTenantAccountPage = dashboardRoute?.kind === 'tenant'
    || routeSubpage === ACCOUNT_ROUTE_SEGMENT
    || currentPathSubpage === ACCOUNT_ROUTE_SEGMENT;

  return {
    normalizedCurrentPath,
    dashboardTab: dashboardRoute
      ? getCustomerDashboardTabFromLocation({
        pathname: normalizedCurrentPath,
        search: typeof window === 'undefined' ? '' : window.location.search
      })
      : CUSTOMER_DASHBOARD_DEFAULT_TAB,
    isGlobalAccountPage,
    isTenantAccountPage,
    isStandaloneAccountPage: isGlobalAccountPage || isTenantAccountPage
  };
}

export default buildCustomerDashboardRouteFlags;
