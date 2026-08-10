// Mirrors the static reserved-hostname set in
// backend/src/modules/storefrontDomains/utils/hostnamePolicy.js
// (STATIC_RESERVED_HOSTS + the `*.dgfy.ph` suffix rule). Kept as a small,
// independent client-side copy rather than sharing a module across the
// frontend/backend boundary -- this only needs to answer "is a
// /api/v1/store/domain-context probe pointless on this host?", not enforce
// the policy. The backend also honors STOREFRONT_RESERVED_HOSTNAMES (an env
// var), which isn't available here; a host covered only by that config still
// falls through to firing the probe, same as before this existed.
const STATIC_RESERVED_HOSTS = new Set([
  'localhost',
  'dgfy.ph',
  'www.dgfy.ph',
  'beta.dgfy.ph',
  'api.dgfy.ph',
  'store.dgfy.ph'
]);

// `/api/v1/store/domain-context` always 404s on these hosts (the backend's
// own hostname policy rejects them before a context can ever be resolved),
// so StorefrontApp's custom-domain probe is guaranteed dead weight there --
// skip it to avoid a false-positive 404 on every anonymous root landing.
export const isKnownDgfyPlatformHost = (hostname) => {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  return STATIC_RESERVED_HOSTS.has(host) || host.endsWith('.dgfy.ph');
};
