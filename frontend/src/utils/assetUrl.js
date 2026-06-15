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
