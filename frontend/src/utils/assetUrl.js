export const resolveAssetOrigin = (env = {}, windowOrigin = '') => {
  const candidates = [
    env.VITE_ASSET_BASE_URL,
    env.VITE_API_BASE_URL,
    env.VITE_API_URL,
  ];

  for (const candidate of candidates) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;
    if (raw.startsWith('/')) continue;

    try {
      const parsed = new URL(raw, windowOrigin || 'http://localhost');
      if (!parsed.protocol.startsWith('http')) continue;
      return parsed.origin;
    } catch {
      // Ignore invalid values and continue to next candidate.
    }
  }

  return '';
};

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

export default resolveAssetUrl;
