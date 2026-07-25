// Resolves auth-flow return targets to paths the storefront's own router can
// navigate to in-app. Login/register used to live on a separate origin
// (skupervisor.dgfy.ph), so `return_to` was always an absolute cross-origin
// URL; now that auth lives inside the storefront itself, we only need the
// path/search/hash portion to call `navigate()` with.

export const toInternalReturnPath = (target = '', fallback = '/') => {
  const raw = String(target || '').trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1');
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith('/') ? path : fallback;
  } catch {
    return raw.startsWith('/') ? raw : fallback;
  }
};

// Guards against open-redirect-style return_to values and against bouncing
// straight back into the auth pages themselves (which would loop).
export const sanitizeStorefrontReturnPath = (path = '', fallback = '/') => {
  const raw = String(path || '').trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (/^\/(login|register|reset-password)(?:[/?#]|$)/i.test(raw)) return fallback;
  return raw;
};
