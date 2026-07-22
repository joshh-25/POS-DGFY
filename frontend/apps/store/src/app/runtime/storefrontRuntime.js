import { storePath } from '../routing/storefrontRouting.js';

const resolveConfiguredOrigin = (rawValue = '') => {
  const raw = String(rawValue || '').trim();
  if (!raw || raw.startsWith('/')) return '';
  try {
    const parsed = new URL(raw, window.location.origin);
    return parsed.protocol.startsWith('http') ? parsed.origin : '';
  } catch {
    return '';
  }
};

const inferRuntimeApiOrigin = () => {
  if (typeof window === 'undefined') return '';
  const { hostname, port, protocol } = window.location;
  const numericPort = Number(port);
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const isLikelyViteStorePort = Number.isInteger(numericPort) && (
    (numericPort >= 5173 && numericPort <= 5185)
    || (numericPort >= 4173 && numericPort <= 4185)
  );
  if (!isLocalHost || !isLikelyViteStorePort) return '';
  return `${protocol}//${hostname}:5000`;
};

const configuredApiOrigin = resolveConfiguredOrigin(import.meta.env.VITE_API_BASE_URL);
const apiOrigin = configuredApiOrigin || inferRuntimeApiOrigin();
const configuredAssetOrigin = resolveConfiguredOrigin(import.meta.env.VITE_ASSET_BASE_URL);
const assetOrigin = configuredAssetOrigin || apiOrigin;
const configuredPublicStorefrontOrigin = resolveConfiguredOrigin(import.meta.env.VITE_PUBLIC_STOREFRONT_ORIGIN);
const publicStorefrontOrigin = configuredPublicStorefrontOrigin || 'https://dgfy.ph';

export const buildStamp = String(import.meta.env.VITE_BUILD_STAMP || '').trim();
export const appBasePath = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/';
const serviceWorkerPath = appBasePath === '/' ? '/sw.js' : `${appBasePath}/sw.js`;
export const serviceWorkerUrl = buildStamp
  ? `${serviceWorkerPath}?build=${encodeURIComponent(buildStamp)}`
  : serviceWorkerPath;

export const withApiOrigin = (url) => {
  if (!url || typeof url !== 'string') return url;
  if (!url.startsWith('/')) return url;
  return apiOrigin ? `${apiOrigin}${url}` : url;
};

export const withAssetOrigin = (url) => {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (trimmed.startsWith('storefront-assets/')) {
    const normalized = `/uploads/${trimmed}`;
    return assetOrigin ? `${assetOrigin}${normalized}` : normalized;
  }
  if (trimmed.startsWith('/')) {
    return assetOrigin ? `${assetOrigin}${trimmed}` : trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
};

export const buildPublicStorefrontUrl = (slug) => {
  if (!String(slug || '').trim()) return '';
  return `${publicStorefrontOrigin}${storePath(slug)}`;
};
