import { resolveAssetOrigin } from './runtimeConfig.js';
export { resolveAssetOrigin } from './runtimeConfig.js';

const ASSET_ORIGIN = typeof window === 'undefined'
  ? ''
  : resolveAssetOrigin(import.meta.env, window.location.origin);

export const resolveAssetUrl = (value, options = {}) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const assetOrigin = typeof options.assetOrigin === 'string'
    ? options.assetOrigin
    : ASSET_ORIGIN;

  if (/^(data|blob):/i.test(raw)) return raw;

  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    if (!raw.startsWith('/')) return raw;
    return assetOrigin ? `${assetOrigin}${raw}` : raw;
  }
};

const rewriteOptimizedVariantPath = (pathname, variant) => {
  const normalizedVariant = ['thumbnail', 'medium', 'large'].includes(String(variant || '').trim())
    ? String(variant || '').trim()
    : 'large';
  const normalized = String(pathname || '').trim();
  if (!normalized) return normalized;
  return normalized.replace(/\/large(\.[a-z0-9]+)$/i, (_, ext) => {
    if (normalizedVariant === 'thumbnail') return `/thumb${ext}`;
    if (normalizedVariant === 'medium') return `/medium${ext}`;
    return `/large${ext}`;
  });
};

export const resolveAssetVariantUrl = (value, variant = 'large', options = {}) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(data|blob):/i.test(raw)) return raw;

  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    parsed.pathname = rewriteOptimizedVariantPath(parsed.pathname, variant);
    return resolveAssetUrl(parsed.toString(), options);
  } catch {
    return resolveAssetUrl(rewriteOptimizedVariantPath(raw, variant), options);
  }
};

export const resolveAssetVariantUrls = (value, options = {}) => ({
  thumbnail_url: resolveAssetVariantUrl(value, 'thumbnail', options),
  medium_url: resolveAssetVariantUrl(value, 'medium', options),
  large_url: resolveAssetVariantUrl(value, 'large', options)
});

export const resolveAppAssetUrl = (value, options = {}) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const baseHref = String(options.baseHref || (typeof window !== 'undefined' ? window.location.href : '') || '').trim();

  if (/^(data|blob):/i.test(raw)) return raw;

  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:', 'file:', 'dgfypos:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    if (!baseHref) {
      return raw.startsWith('/') ? raw.slice(1) : raw;
    }
    const normalized = raw.startsWith('/') ? raw.slice(1) : raw;

    try {
      return new URL(normalized, baseHref).toString();
    } catch {
      return raw;
    }
  }
};

export default resolveAssetUrl;
