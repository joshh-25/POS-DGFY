const LEGACY_BACK_OFFICE_PREFIX = /^\/(?:backoffice|business-admin)(?=\/|$)/;

export const canonicalizeOpisPath = (pathname = '') => {
  const rawPath = String(pathname || '/');
  const suffix = rawPath.replace(LEGACY_BACK_OFFICE_PREFIX, '') || '/';
  if (suffix === '/' || suffix === '/overview') return '/';
  return `/${suffix.replace(/^\/+/, '')}`;
};
