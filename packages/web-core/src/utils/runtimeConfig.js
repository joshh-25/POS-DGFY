const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const DEFAULT_API_BASE_URL = '/api/v1';

const trimTrailingSlash = (value = '') => String(value || '').trim().replace(/\/+$/, '');

const normalizeUrl = (value = '', fallbackOrigin = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw, fallbackOrigin || 'http://localhost');
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return trimTrailingSlash(parsed.toString());
  } catch {
    return '';
  }
};

const normalizeBackendOrigin = (value = '', fallbackOrigin = '') => {
  const raw = String(value || '').trim();
  if (!/^https?:\/\//i.test(raw)) return '';

  const normalized = normalizeUrl(value, fallbackOrigin);
  if (!normalized) return '';

  try {
    const parsed = new URL(normalized);
    return HTTP_PROTOCOLS.has(parsed.protocol) ? trimTrailingSlash(parsed.origin) : '';
  } catch {
    return '';
  }
};

const normalizeApiBaseUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return '';
  if (raw.startsWith('/')) return trimTrailingSlash(raw);
  if (!/^https?:\/\//i.test(raw)) return '';

  return normalizeUrl(raw);
};

const readDesktopRuntime = () => {
  if (typeof window === 'undefined') return null;
  const runtime = window.__DGFY_POS_RUNTIME__;
  if (!runtime || typeof runtime !== 'object') return null;
  return runtime;
};

export const getRuntimeConfig = (env = {}, windowLocation = globalThis?.window?.location) => {
  const desktopRuntime = readDesktopRuntime();
  const fallbackOrigin = String(windowLocation?.origin || '').trim();
  const backendOrigin = normalizeBackendOrigin(
    desktopRuntime?.backendOrigin || '',
    fallbackOrigin
  ) || normalizeBackendOrigin(desktopRuntime?.apiBaseUrl || '', fallbackOrigin);
  const desktopApiBaseUrl = normalizeApiBaseUrl(desktopRuntime?.apiBaseUrl || '');
  const apiBaseUrl = backendOrigin
    ? `${backendOrigin}/api/v1`
    : desktopApiBaseUrl;
  const assetBaseUrl = backendOrigin || normalizeBackendOrigin(desktopRuntime?.assetBaseUrl || '', fallbackOrigin);

  return {
    isDesktopShell: Boolean(desktopRuntime?.isDesktopShell),
    backendOrigin,
    apiBaseUrl,
    assetBaseUrl,
    companyToken: String(desktopRuntime?.companyToken || '').trim(),
    terminalId: String(desktopRuntime?.terminalId || '').trim(),
    appSurface: String(desktopRuntime?.appSurface || env.VITE_APP_SURFACE || '').trim().toLowerCase()
  };
};

export const resolveApiBaseUrl = (env = {}, windowLocation = globalThis?.window?.location) => {
  const runtimeConfig = getRuntimeConfig(env, windowLocation);
  if (runtimeConfig.apiBaseUrl) return runtimeConfig.apiBaseUrl;

  const configured = normalizeApiBaseUrl(env.VITE_API_URL || '');
  if (!configured) return DEFAULT_API_BASE_URL;

  if (windowLocation?.origin) {
    try {
      const parsed = new URL(configured, windowLocation.origin);
      const configuredLocal = LOCAL_HOSTS.has(parsed.hostname);
      const runtimeLocal = LOCAL_HOSTS.has(windowLocation.hostname);
      if (configuredLocal && !runtimeLocal) {
        console.warn('[API] VITE_API_URL points to localhost on a non-local host. Falling back to /api/v1.');
        return DEFAULT_API_BASE_URL;
      }
    } catch {
      // Ignore parse failures and use the configured value.
    }
  }

  return configured;
};

export const resolveAssetOrigin = (env = {}, windowOrigin = '', runtimeConfig = getRuntimeConfig(env)) => {
  const runtimeAssetOrigin = normalizeBackendOrigin(runtimeConfig?.assetBaseUrl || '', windowOrigin);
  if (runtimeAssetOrigin) return runtimeAssetOrigin;

  const candidates = [
    env.VITE_ASSET_BASE_URL,
    env.VITE_API_BASE_URL,
    env.VITE_API_URL,
  ];

  for (const candidate of candidates) {
    const origin = normalizeBackendOrigin(candidate, windowOrigin || '');
    if (origin) return origin;
  }

  return '';
};
