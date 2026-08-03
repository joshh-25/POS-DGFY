const PUBLIC_AUTH_ROUTE_PREFIXES = [
  '/login',
  '/register',
  '/dgfy/auth',
  '/dgfy/companies',
  '/dgfy/reset-password',
  '/register-company',
  '/legal',
  '/privacy',
  '/accept-invite',
  '/reactivate',
  '/admin'
];

export const shouldRefreshBrowserSessionForPath = (pathname = '/') => {
  const normalizedPath = String(pathname || '/').trim() || '/';
  return !PUBLIC_AUTH_ROUTE_PREFIXES.some((path) => (
    normalizedPath === path || normalizedPath.startsWith(`${path}/`)
  ));
};
