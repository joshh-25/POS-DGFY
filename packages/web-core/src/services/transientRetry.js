// Retry policy for transient upstream failures (gateway restarts, a single
// worker reload) on IDEMPOTENT requests only. Kept as pure functions so the
// backoff math and eligibility rules are unit-testable without axios or a
// mock adapter -- api.js and requestJson.js both call into this.
//
// Deliberately narrower than "retry any 5xx":
//   - 500 is NOT retried. A 500 is a bug; retrying it doubles write risk on
//     any endpoint that isn't purely read-only and masks the failure instead
//     of surfacing it.
//   - 429 is NOT retried here. The interceptor callers already expose
//     error.retryAfterSeconds for a 429 (see readRetryAfterSeconds below);
//     auto-retrying inside this layer would hide the rate limiter from the
//     caller and pile more load onto something that is already shedding.
//   - Timeouts (ECONNABORTED/ETIMEDOUT) are NOT retried. With a 60s per
//     request timeout, retrying a timeout costs another 60s of user-facing
//     wait on a POS terminal for a server that had a full minute and still
//     didn't answer -- that is not a blip.
export const MAX_TRANSIENT_RETRIES = 2; // 3 attempts total
export const TRANSIENT_RETRY_BASE_DELAY_MS = 400;
export const TRANSIENT_RETRY_MAX_DELAY_MS = 2000;
export const TRANSIENT_RETRY_TOTAL_BUDGET_MS = 8000;
export const MAX_HONOURED_RETRY_AFTER_SECONDS = 5;

export const RETRYABLE_STATUSES = new Set([502, 503, 504]);
export const IDEMPOTENT_METHODS = new Set(['get', 'head', 'options']);

// Axios error `code` values that mean "this was not a transport failure" and
// must never be retried even though error.response is empty for all of them.
const NON_RETRYABLE_CODES = new Set(['ERR_CANCELED', 'ECONNABORTED', 'ETIMEDOUT']);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Mirrors the existing 429 handling in api.js: the header key may arrive
// lowercased (fetch/axios normalize it) or with its original casing when a
// test stubs a plain object, and the body-level fallback matches what
// requestJson.js already parses.
export const readRetryAfterSeconds = (error) => {
  const headers = error?.response?.headers || {};
  const retryAfterHeader = headers['retry-after'] ?? headers['Retry-After'];
  const retryAfterSeconds = Number(
    error?.response?.data?.retryAfterSeconds
    ?? retryAfterHeader
  );
  return Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? retryAfterSeconds
    : null;
};

// A request body that can only be read once cannot be safely replayed.
// Moot for GET/HEAD/OPTIONS (no body); required so the opt-in
// `retryOnTransientFailure` escape hatch can't be misused on a stream.
export const isReplayableBody = (data) => {
  if (!data) return true;
  if (typeof FormData !== 'undefined' && data instanceof FormData) return false;
  if (typeof Blob !== 'undefined' && data instanceof Blob) return false;
  if (typeof ReadableStream !== 'undefined' && data instanceof ReadableStream) return false;
  if (typeof data.pipe === 'function') return false;
  return true;
};

// A "transport failure" is a fetch/axios rejection with no response at all
// (offline, DNS, CORS, connection refused) that isn't a cancellation or a
// timeout -- both of which carry no response either but must not be retried.
export const isTransportFailure = (error) => {
  if (error?.response) return false;
  const code = String(error?.code || '');
  if (NON_RETRYABLE_CODES.has(code)) return false;
  return true;
};

// error: an axios-shaped error ({ response, code, config }) or a fetch-shaped
//   failure object with `status`/no response.
// config: { method, retryOnTransientFailure, data } -- the request config
//   (axios) or an equivalent plain object (requestJson.js).
export const isRetryableTransientFailure = (error, config = {}) => {
  const method = String(config.method || 'get').toLowerCase();
  const isIdempotent = IDEMPOTENT_METHODS.has(method) || config.retryOnTransientFailure === true;
  if (!isIdempotent) return false;
  if (!isReplayableBody(config.data)) return false;

  const status = error?.response?.status ?? error?.status;
  if (status != null) {
    return RETRYABLE_STATUSES.has(Number(status));
  }
  return isTransportFailure(error);
};

// Equal-jitter backoff: attempt 1 -> 200-400ms, attempt 2 -> 400-800ms.
// Small on purpose -- this survives a gateway worker reload, not a 10s
// container swap; a multi-second outage should still surface as an error.
export const computeTransientRetryDelayMs = ({ attempt, retryAfterSeconds } = {}) => {
  if (retryAfterSeconds != null) {
    return retryAfterSeconds <= MAX_HONOURED_RETRY_AFTER_SECONDS
      ? retryAfterSeconds * 1000
      : null; // caller must treat null as "do not retry"
  }
  const base = Math.min(
    TRANSIENT_RETRY_BASE_DELAY_MS * (2 ** (Math.max(attempt, 1) - 1)),
    TRANSIENT_RETRY_MAX_DELAY_MS
  );
  return base / 2 + Math.random() * (base / 2);
};
