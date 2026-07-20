const toPositiveInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
};

const mergeVaryHeader = (currentValue, valueToAppend) => {
  const currentParts = String(currentValue || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const nextParts = String(valueToAppend || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const merged = new Set([...currentParts, ...nextParts]);
  return Array.from(merged).join(', ');
};

export const setReadCacheControl = ({
  maxAgeSeconds = 15,
  sMaxAgeSeconds = 15,
  staleWhileRevalidateSeconds = 30,
  staleIfErrorSeconds = 60,
  scope = 'public',
  varyHeaders = []
} = {}) => {
  const normalizedMaxAge = toPositiveInt(maxAgeSeconds, 15);
  const normalizedSharedMaxAge = toPositiveInt(sMaxAgeSeconds, normalizedMaxAge);
  const normalizedStaleWhileRevalidate = toPositiveInt(staleWhileRevalidateSeconds, 30);
  const normalizedStaleIfError = toPositiveInt(staleIfErrorSeconds, 60);
  const normalizedScope = scope === 'private' ? 'private' : 'public';

  const headerValue = [
    normalizedScope,
    `max-age=${normalizedMaxAge}`,
    `s-maxage=${normalizedSharedMaxAge}`,
    `stale-while-revalidate=${normalizedStaleWhileRevalidate}`,
    `stale-if-error=${normalizedStaleIfError}`
  ].join(', ');
  const additionalVaryHeaders = Array.isArray(varyHeaders)
    ? varyHeaders.map((header) => String(header || '').trim()).filter(Boolean)
    : String(varyHeaders || '').split(',').map((header) => header.trim()).filter(Boolean);
  const varyHeaderValue = ['Accept-Encoding', 'Origin', ...additionalVaryHeaders].join(', ');

  return (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    res.setHeader('Cache-Control', headerValue);
    res.setHeader('Vary', mergeVaryHeader(res.getHeader('Vary'), varyHeaderValue));
    return next();
  };
};

export const setNoStoreCacheControl = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Vary', mergeVaryHeader(res.getHeader('Vary'), 'Accept-Encoding, Origin'));
  return next();
};

export default {
  setReadCacheControl,
  setNoStoreCacheControl
};
