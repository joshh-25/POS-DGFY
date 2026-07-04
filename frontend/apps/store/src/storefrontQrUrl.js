const TENANT_STORE_BASE_PATH = '/tenant-store';

const trimTrailingSlash = (value = '') => String(value || '').trim().replace(/\/+$/, '');

const normalizeSlug = (value = '') => (
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
);

const normalizeOrigin = (value = '', fallbackOrigin = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, fallbackOrigin || 'http://localhost');
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return trimTrailingSlash(parsed.origin);
  } catch {
    return '';
  }
};

const isLocalLikeHostname = (hostname = '') => {
  const normalized = String(hostname || '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '0.0.0.0') return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  return false;
};

const buildCanonicalStorefrontPath = (slug) => `/${encodeURIComponent(normalizeSlug(slug))}`;
const buildTenantStorefrontPath = (slug) => `${TENANT_STORE_BASE_PATH}/${encodeURIComponent(normalizeSlug(slug))}`;

const resolveDefaultPath = ({ slug = '', fallbackPath = '/', currentPath = '/' } = {}) => {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return String(fallbackPath || currentPath || '/').trim() || '/';
  const normalizedCurrentPath = String(currentPath || '').trim();
  if (normalizedCurrentPath.startsWith(`${TENANT_STORE_BASE_PATH}/`)) {
    return buildTenantStorefrontPath(normalizedSlug);
  }
  return buildCanonicalStorefrontPath(normalizedSlug);
};

export const buildStorefrontQrUrl = ({
  slug = '',
  fallbackPath = '/',
  currentOrigin = typeof window !== 'undefined' ? window.location.origin : '',
  currentPath = typeof window !== 'undefined' ? window.location.pathname : '/',
  configuredPublicOrigin = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_PUBLIC_STOREFRONT_ORIGIN : ''
} = {}) => {
  const runtimeOrigin = normalizeOrigin(currentOrigin);
  const publicOrigin = normalizeOrigin(configuredPublicOrigin, runtimeOrigin);
  const normalizedSlug = normalizeSlug(slug);
  const path = resolveDefaultPath({ slug: normalizedSlug, fallbackPath, currentPath });

  if (publicOrigin && publicOrigin !== runtimeOrigin) {
    if (normalizedSlug) return `${publicOrigin}${buildCanonicalStorefrontPath(normalizedSlug)}`;
    return `${publicOrigin}${String(fallbackPath || '/').trim() || '/'}`;
  }

  if (runtimeOrigin) {
    try {
      const hostname = new URL(runtimeOrigin).hostname;
      if (normalizedSlug && isLocalLikeHostname(hostname)) {
        return `${runtimeOrigin}${buildTenantStorefrontPath(normalizedSlug)}`;
      }
    } catch {
      // Ignore URL parsing failures and continue with the computed path.
    }
    return `${runtimeOrigin}${path}`;
  }

  return normalizedSlug ? buildCanonicalStorefrontPath(normalizedSlug) : String(fallbackPath || '/').trim() || '/';
};

export default buildStorefrontQrUrl;
