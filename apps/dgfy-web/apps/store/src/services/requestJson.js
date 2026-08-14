import { getCsrfToken } from '../../../../../../packages/web-core/src/services/browserSession.js';
import { tagRequestFailureContext, captureRequestFailure } from '../../../../../../packages/web-core/src/observability/sentryClient.js';
import {
  isRetryableTransientFailure,
  computeTransientRetryDelayMs,
  MAX_TRANSIENT_RETRIES,
  TRANSIENT_RETRY_TOTAL_BUDGET_MS,
  sleep
} from '../../../../../../packages/web-core/src/services/transientRetry.js';

const isTestEnvironment = (() => {
  try {
    return import.meta.env?.MODE === 'test';
  } catch {
    return false;
  }
})();

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

// Issue #282, Phase F: collapses genuinely concurrent, identical, unsignaled
// GETs into a single network request -- e.g. two components mounting in the
// same tick that both need the same catalog/discovery data. Deliberately
// NOT a time-based response cache: Phase B already restores real HTTP
// caching via `cache` + the backend's Cache-Control headers, and a second,
// app-level TTL cache here would just be a harder-to-invalidate duplicate
// of that. Entries are removed the instant the shared request settles, so
// this never serves a stale response to a later, non-concurrent call.
//
// Scoped deliberately narrow:
// - Unsignaled GETs only. A caller that passes its own `signal` has
//   explicit cancellation needs a shared in-flight request can't safely
//   honor (aborting it would also cancel every other waiter), so those
//   calls always get their own dedicated fetch, same as before this
//   existed.
// - Never for a bearer-token (`authToken`) request. Those are exactly the
//   authenticated call sites this cache should not touch -- coalescing
//   them risks a session-boundary race (e.g. a logout landing between two
//   otherwise-identical requests) that a public, cookie-scoped storefront
//   read doesn't have.
const inFlightGetRequests = new Map();

const buildGetDedupKey = (resolvedUrl, headers) => JSON.stringify([
  resolvedUrl,
  headers['x-store-slug'] || '',
  headers['x-tenant-slug'] || '',
  headers['x-tenant-id'] || '',
  headers['x-location-id'] || ''
]);

export const requestJson = async (url, options = {}) => {
  const { method = 'GET', signal, authToken = '' } = options;
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const trimmedAuthToken = String(authToken || '').trim();
  if (normalizedMethod !== 'GET' || signal || trimmedAuthToken) {
    return performRequestJson(url, options);
  }

  const resolvedUrl = withApiOrigin(url);
  const headers = resolveStoreContextHeaders(options);
  const dedupKey = buildGetDedupKey(resolvedUrl, headers);

  const existing = inFlightGetRequests.get(dedupKey);
  if (existing) return existing;

  const inFlight = performRequestJson(url, options)
    .finally(() => {
      if (inFlightGetRequests.get(dedupKey) === inFlight) inFlightGetRequests.delete(dedupKey);
    });
  inFlightGetRequests.set(dedupKey, inFlight);
  return inFlight;
};

const performRequestJson = async (url, {
  method = 'GET',
  body,
  storeSlug,
  selectedStore = null,
  selectedLocationId = null,
  authToken = '',
  cache = 'default',
  credentials = 'include',
  signal = undefined,
  // Opt-in only -- requestJson fronts ~30 call sites including order
  // creation and OTP sends, and a 200 response with `success: false` is a
  // domain failure that must never be retried (it falls out naturally
  // below: 200 is never in the retryable-status set, so no special-casing
  // is needed for that, but retry must still default off so a global
  // change here can't silently start retrying every POST-shaped call site).
  retry = false,
  // Mirrors api.js's per-request `skipRequestFailureCapture` axios config
  // flag for parity between the two request layers. No storefront call site
  // needs it today, but a future optional-capability probe (the kind
  // fetchPosDeviceStatus is on the POS side) should have the same escape
  // hatch here without inventing a third convention.
  skipRequestFailureCapture = false
} = {}) => {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const token = String(authToken || '').trim();
  const csrfToken = ['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod) ? '' : getCsrfToken();
  const requestInit = {
    method: normalizedMethod,
    credentials,
    cache,
    headers: {
      'Content-Type': 'application/json',
      ...resolveStoreContextHeaders({ storeSlug, selectedStore, selectedLocationId }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    // Spread rather than a bare `signal` key so a call site that omits it
    // sees no new key on the fetch init (kept for parity with existing
    // `objectContaining` assertions in requestJson.csrfSession.test.js).
    ...(signal ? { signal } : {})
  };
  // Shared shape isRetryableTransientFailure expects for both the
  // network-failure and HTTP-failure retry decisions below.
  const retryConfig = { method: normalizedMethod, data: body };

  let attempt = 0;
  let retryDeadlineAt = null;

  for (;;) {
    let response;
    try {
      response = await fetch(withApiOrigin(url), requestInit);
    } catch (networkError) {
      // The platform's own AbortError DOMException is re-thrown verbatim
      // rather than wrapped: buildRequestError produces a plain Error (name
      // "Error"), which would defeat every `error?.name === 'AbortError'`
      // guard downstream. An abort is a caller decision, not a failure, so
      // it is never retried and never reported to Sentry.
      if (networkError?.name === 'AbortError' || signal?.aborted) throw networkError;

      if (retry && attempt < MAX_TRANSIENT_RETRIES && isRetryableTransientFailure(networkError, retryConfig)) {
        attempt += 1;
        retryDeadlineAt = retryDeadlineAt || (Date.now() + TRANSIENT_RETRY_TOTAL_BUDGET_MS);
        const delayMs = computeTransientRetryDelayMs({ attempt });
        if (delayMs != null && Date.now() + delayMs < retryDeadlineAt) {
          await sleep(isTestEnvironment ? 0 : delayMs);
          continue;
        }
      }

      // No response at all (offline, CORS, DNS) -- tagRequestFailureContext
      // below never runs for this path since it requires a requestId that
      // only a response payload carries, so this is the only place a
      // storefront network failure reaches Sentry. Only reached once retry
      // is exhausted or not applicable, so a recovered request never fires.
      if (!skipRequestFailureCapture) {
        captureRequestFailure({ error: networkError, method: normalizedMethod, url });
      }
      throw buildRequestError('Request failed before reaching API. Check server/proxy/CORS connectivity.', {
        isNetworkError: true,
        cause: networkError
      });
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      const rawRetryAfterSeconds = Number(
        payload?.retryAfterSeconds
        ?? response.headers?.get?.('Retry-After')
      );
      const retryAfterSeconds = Number.isFinite(rawRetryAfterSeconds) ? rawRetryAfterSeconds : null;

      if (
        retry
        && attempt < MAX_TRANSIENT_RETRIES
        && isRetryableTransientFailure({ status: response.status }, retryConfig)
      ) {
        attempt += 1;
        retryDeadlineAt = retryDeadlineAt || (Date.now() + TRANSIENT_RETRY_TOTAL_BUDGET_MS);
        const delayMs = computeTransientRetryDelayMs({ attempt, retryAfterSeconds });
        if (delayMs != null && Date.now() + delayMs < retryDeadlineAt) {
          await sleep(isTestEnvironment ? 0 : delayMs);
          continue;
        }
      }

      // Build the error object first so the real server message/status
      // reaches Sentry instead of the generic message captureRequestFailure
      // would otherwise synthesize when `error` is omitted.
      const requestError = buildRequestError(payload?.message || `Request failed (${response.status})`, {
        status: response.status,
        errorCode: payload?.error_code || null,
        details: payload?.errors || payload?.details || null,
        requestId: payload?.request_id || null,
        retryAfterSeconds,
        payload
      });
      tagRequestFailureContext({
        requestId: payload?.request_id || null,
        url: response.url,
        status: response.status
      });
      if (!skipRequestFailureCapture) {
        captureRequestFailure({
          error: requestError,
          method: normalizedMethod,
          url: response.url,
          status: response.status,
          requestId: payload?.request_id || null
        });
      }
      throw requestError;
    }

    return payload?.data ?? payload;
  }
};
