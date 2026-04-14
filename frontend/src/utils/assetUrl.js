const parseConfiguredAssetOrigin = () => {
  const candidates = [
    import.meta.env.VITE_API_URL,
    import.meta.env.VITE_API_BASE_URL
  ];

  for (const candidate of candidates) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;

    try {
      const parsed = new URL(raw, window.location.origin);
      if (!parsed.protocol.startsWith('http')) continue;
      return parsed.origin;
    } catch {
      // Ignore invalid values and continue to next candidate.
    }
  }

  return '';
};

const ASSET_ORIGIN = typeof window === 'undefined' ? '' : parseConfiguredAssetOrigin();

export const resolveAssetUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^(data|blob):/i.test(raw)) return raw;

  try {
    return new URL(raw).toString();
  } catch {
    if (!raw.startsWith('/')) return raw;
    return ASSET_ORIGIN ? `${ASSET_ORIGIN}${raw}` : raw;
  }
};

export default resolveAssetUrl;
