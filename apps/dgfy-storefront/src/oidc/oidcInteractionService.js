import api from '../../../../packages/web-core/src/services/api.js';
import { ensureCsrfToken, getCsrfToken } from '../../../../packages/web-core/src/services/browserSession.js';
import { getStoredDgfyToken } from '../../../../packages/web-core/src/services/dgfyAuthService.js';

const requestConfig = () => {
  const token = String(getStoredDgfyToken() || '').trim();
  return {
    withCredentials: true,
    skipTenantAuthHeaders: true,
    skipAuthRefresh: true,
    skipGlobalErrorToast: true,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {})
  };
};
const publicRequestConfig = {
  withCredentials: true,
  skipTenantAuthHeaders: true,
  skipAuthRefresh: true,
  skipGlobalErrorToast: true
};
const pendingBindings = new Map();
const STOREFRONT_ISSUER_HOSTS = Object.freeze({
  'dev.dgfy.ph': 'api.dev.dgfy.ph',
  'stage.dgfy.ph': 'api.stage.dgfy.ph',
  'dgfy.ph': 'api.dgfy.ph'
});
const STOREFRONT_RESTART_ORIGINS = Object.freeze({
  'dev.dgfy.ph': 'laundry.surebizcorp.com',
  'stage.dgfy.ph': 'dglaundry.stage.dgfy.ph',
  'dgfy.ph': 'dglaundry.dgfy.ph'
});
const isLoopbackHost = (hostname) => /^(localhost|[a-z0-9-]+\.localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i.test(hostname);

export const bindOidcInteraction = async (id, handoff = '') => {
  const normalizedId = String(id || '');
  const handoffValue = String(handoff || '');
  const key = `${normalizedId}:${handoffValue}`;
  if (pendingBindings.has(key)) return pendingBindings.get(key);
  const request = (async () => {
    await ensureCsrfToken();
    const csrfToken = getCsrfToken();
    if (!csrfToken) throw new Error('DGFY could not secure this sign-in session. Reload and try again.');
    const config = requestConfig();
    const response = await api.post(`/dgfy/oidc/interactions/${encodeURIComponent(normalizedId)}/bind`, {
      handoff: handoffValue
    }, { ...config, headers: { ...(config.headers || {}), 'x-csrf-token': csrfToken } });
    return response.data?.data || null;
  })().finally(() => { pendingBindings.delete(key); });
  pendingBindings.set(key, request);
  return request;
};

export const fetchOidcInteraction = async (id) => {
  const response = await api.get(`/dgfy/oidc/interactions/${encodeURIComponent(String(id || ''))}`, requestConfig());
  return response.data?.data || null;
};

export const prepareOidcCompletion = async (id, { action, companyId = '' } = {}) => {
  await ensureCsrfToken();
  const csrfToken = getCsrfToken();
  if (!csrfToken) throw new Error('DGFY could not prepare this sign-in. Reload and try again.');
  const config = requestConfig();
  const response = await api.post(`/dgfy/oidc/interactions/${encodeURIComponent(String(id || ''))}/complete`, {
    action,
    ...(companyId ? { company_id: companyId } : {})
  }, { ...config, headers: { ...(config.headers || {}), 'x-csrf-token': csrfToken } });
  return response.data?.data || null;
};

export const fetchOidcInteractionError = async (id) => {
  const response = await api.get(`/dgfy/oidc/errors/${encodeURIComponent(String(id || ''))}`, publicRequestConfig);
  return response.data?.data || null;
};

export const validateOidcCompletionUrl = (value, { storefrontHost = globalThis.window?.location?.hostname || '' } = {}) => {
  try {
    const url = new URL(String(value || ''));
    const ticket = new URLSearchParams(url.hash.slice(1)).get('ticket');
    const currentStorefrontHost = String(storefrontHost || '').toLowerCase();
    const localStorefront = isLoopbackHost(currentStorefrontHost);
    const loopbackIssuer = isLoopbackHost(url.hostname);
    const issuerAllowed = localStorefront
      ? loopbackIssuer || url.hostname.toLowerCase() === 'api.dev.dgfy.ph'
      : url.hostname.toLowerCase() === STOREFRONT_ISSUER_HOSTS[currentStorefrontHost];
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && localStorefront && loopbackIssuer))
      || !issuerAllowed
      || (!localStorefront && url.port)
      || url.username || url.password || url.pathname !== '/oidc/complete'
      || url.search || !ticket || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) return '';
    return url.toString();
  } catch { return ''; }
};

export const validateOidcRestartUrl = (value, { storefrontHost = globalThis.window?.location?.hostname || '' } = {}) => {
  try {
    const url = new URL(String(value || ''));
    const currentStorefrontHost = String(storefrontHost || '').toLowerCase();
    const expectedRestartHost = isLoopbackHost(currentStorefrontHost)
      ? STOREFRONT_RESTART_ORIGINS['dev.dgfy.ph']
      : STOREFRONT_RESTART_ORIGINS[currentStorefrontHost];
    if (url.protocol !== 'https:' || !expectedRestartHost || url.hostname.toLowerCase() !== expectedRestartHost
      || url.port || url.username || url.password || url.search || url.hash) return '';
    return url.origin;
  } catch { return ''; }
};
