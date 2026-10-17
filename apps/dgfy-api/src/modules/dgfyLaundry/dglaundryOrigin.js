// Where DGLaundry lives is deployment configuration, not a constant (#2513): staging and
// production are different hosts, and a hardcoded origin silently sent staff to the wrong one.
// DGLAUNDRY_PARTNER_BASE_URL is validated as an HTTPS origin at boot whenever the hosted
// integration is enabled (productionEnvValidation.cjs), so this only normalizes it.
export const resolveDglaundryOrigin = (env = process.env) => {
  const raw = String(env.DGLAUNDRY_PARTNER_BASE_URL || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
};

// The browser-flow callback DGLaundry registers with DGFY lives on the same origin. An explicit
// DGFY_DGLAUNDRY_REDIRECT_URI always wins; with neither it and the base URL set there is no
// redirect, so the client is simply not configured (never a guessed host).
export const resolveDglaundryRedirectUri = (env = process.env) => {
  const explicit = String(env.DGFY_DGLAUNDRY_REDIRECT_URI || '').trim();
  if (explicit) return explicit;
  const origin = resolveDglaundryOrigin(env);
  return origin ? `${origin}/api/v1/session/dgfy/callback` : '';
};
