import { getCsrfToken } from '../../../../src/services/browserSession.js';

const buildRequestError = (message, meta = {}) => {
  const error = new Error(String(message || 'Request failed'));
  Object.assign(error, meta);
  return error;
};

const withApiOrigin = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (typeof window === 'undefined') return raw;
  return new URL(raw, window.location.origin).toString();
};

export const requestJson = async (url, { method = 'GET', body, storeSlug, authToken = '', cache = 'default' } = {}) => {
  let response;
  try {
    const token = String(authToken || '').trim();
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const csrfToken = ['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod) ? '' : getCsrfToken();
    response = await fetch(withApiOrigin(url), {
      method: normalizedMethod,
      credentials: 'include',
      cache,
      headers: {
        'Content-Type': 'application/json',
        ...(storeSlug ? { 'x-store-slug': storeSlug } : {}),
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
    throw buildRequestError(payload?.message || `Request failed (${response.status})`, {
      status: response.status,
      errorCode: payload?.error_code || null,
      details: payload?.errors || payload?.details || null,
      requestId: payload?.request_id || null,
      payload
    });
  }
  return payload?.data ?? payload;
};
