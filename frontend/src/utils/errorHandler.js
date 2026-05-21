const STATUS_MESSAGE_MAP = {
  400: 'Invalid request.',
  401: 'Unauthorized. Please login again.',
  403: 'You do not have permission to perform this action.',
  404: 'Resource not found.',
  408: 'Request timed out. Please try again.',
  409: 'Request conflict. Please refresh and try again.',
  422: 'Validation failed.',
  429: 'Too many requests. Please wait and try again.',
  500: 'Server error. Please try again.',
  502: 'Bad gateway. Please try again.',
  503: 'Service unavailable. Please try again.',
  504: 'Gateway timeout. Please try again.'
};

const FALLBACK_NETWORK_MESSAGE = 'No response from server. Check your connection.';
const FALLBACK_UNKNOWN_MESSAGE = 'An unexpected error occurred.';

const buildEvent = (type, detail) => {
  if (typeof CustomEvent === 'function') {
    return new CustomEvent(type, { detail });
  }
  return { type, detail };
};

export const normalizeApiError = (error) => {
  const status = error?.response?.status ?? null;
  const hasResponse = status !== null;
  const looksLikeNetworkMessage = /network|timeout|failed to fetch|socket/i.test(error?.message || '');
  const isNetwork = !hasResponse && (Boolean(error?.request) || looksLikeNetworkMessage);
  const isServer = hasResponse && status >= 500;
  const validationErrors = Array.isArray(error?.response?.data?.errors)
    ? error.response.data.errors
    : null;
  const message =
    error?.response?.data?.message ||
    (status ? STATUS_MESSAGE_MAP[status] : null) ||
    (isNetwork ? FALLBACK_NETWORK_MESSAGE : null) ||
    error?.message ||
    FALLBACK_UNKNOWN_MESSAGE;

  return {
    status,
    message,
    kind: isNetwork ? 'network' : (isServer ? 'server' : 'http'),
    validationErrors,
    isGlobalCandidate: isNetwork || isServer
  };
};

export const emitGlobalApiError = ({ error, source }) => {
  const normalized = normalizeApiError(error);
  if (!normalized.isGlobalCandidate) return null;
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return null;

  const detail = {
    kind: normalized.kind === 'network' ? 'network' : 'server',
    status: normalized.status,
    message: normalized.message,
    source: source || 'tenant-api',
    url: error?.config?.url,
    method: error?.config?.method?.toUpperCase(),
    timestamp: new Date().toISOString()
  };

  window.dispatchEvent(buildEvent('api:error', detail));

  // Legacy compatibility path while old listeners are phased out.
  if (detail.kind === 'server') {
    window.dispatchEvent(buildEvent('api:server-error', { message: detail.message, ...detail }));
  }

  return detail;
};
