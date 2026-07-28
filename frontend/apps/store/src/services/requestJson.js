import { getCsrfToken } from '../../../../src/services/browserSession.js';
import { tagRequestFailureContext } from '../../../../src/observability/sentryClient.js';

const buildRequestError = (message, meta = {}) => {
  const error = new Error(String(message || 'Request failed'));
  Object.assign(error, meta);
  return error;
};

export const withApiOrigin = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (typeof window === 'undefined') return raw;
  return new URL(raw, window.location.origin).toString();
};

const resolveStoreContextHeaders = ({ storeSlug, selectedStore, selectedLocationId } = {}) => {
  const headers = {};
  const explicitStoreSlug = String(storeSlug || '').trim();
  if (explicitStoreSlug) headers['x-store-slug'] = explicitStoreSlug;
  if (selectedStore?.slug) headers['x-store-slug'] = selectedStore.slug;
  if (selectedStore?.store_slug) headers['x-store-slug'] = selectedStore.store_slug;
  if (selectedStore?.tenant_slug) headers['x-tenant-slug'] = selectedStore.tenant_slug;
  if (selectedStore?.tenant_id) headers['x-tenant-id'] = String(selectedStore.tenant_id);
  if (selectedLocationId) headers['x-location-id'] = String(selectedLocationId);
  return headers;
};

export const requestJson = async (url, {
  method = 'GET',
  body,
  storeSlug,
  selectedStore = null,
  selectedLocationId = null,
  authToken = '',
  cache = 'default',
  credentials = 'include'
} = {}) => {
  let response;
  try {
    const token = String(authToken || '').trim();
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const csrfToken = ['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod) ? '' : getCsrfToken();
    response = await fetch(withApiOrigin(url), {
      method: normalizedMethod,
      credentials,
      cache,
      headers: {
        'Content-Type': 'application/json',
        ...resolveStoreContextHeaders({ storeSlug, selectedStore, selectedLocationId }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (networkError) {
    throw buildRequestError('Request failed before reaching API. Check server/proxy/CORS connectivity.', {
      isNetworkError: true,
      cause: networkError
    });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const retryAfterSeconds = Number(
      payload?.retryAfterSeconds
      ?? response.headers?.get?.('Retry-After')
    );
    tagRequestFailureContext({
      requestId: payload?.request_id || null,
      url: response.url,
      status: response.status
    });
    throw buildRequestError(payload?.message || `Request failed (${response.status})`, {
      status: response.status,
      errorCode: payload?.error_code || null,
      details: payload?.errors || payload?.details || null,
      requestId: payload?.request_id || null,
      retryAfterSeconds: Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds
        : null,
      payload
    });
  }
  return payload?.data ?? payload;
};
