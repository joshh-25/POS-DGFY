const normalizePath = (path = '/') => {
  const raw = String(path || '').trim();
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

export const resolveStorefrontInternalUrl = (path = '/') => {
  const normalizedPath = normalizePath(path);
  if (typeof window === 'undefined') return normalizedPath;
  return new URL(normalizedPath, window.location.origin).toString();
};
