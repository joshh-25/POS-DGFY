const PUBLIC_AUTH_ROUTE_PREFIXES = [
  '/login',
  '/register',
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
