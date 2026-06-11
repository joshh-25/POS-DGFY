import {
  CAPABILITY_BLOCK_TITLE,
  getCapabilityBlockMessage,
  getStorefrontAccessModeMessage
} from './tenantCapabilityMessages.js';

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
  const responseData = error?.response?.data || {};
  const code = responseData?.code || responseData?.error_code || responseData?.error?.code || null;
  const details = responseData?.details && typeof responseData.details === 'object'
    ? responseData.details
    : {};
  const capability = responseData?.capability || details?.capability || null;
  const requestedAction = details?.requested_action || details?.requestedAction || null;
  const requestedMode = details?.requested_mode || details?.requestedMode || null;
  const effectiveMode = details?.effective_mode || details?.effectiveMode || null;
  const hasResponse = status !== null;
  const looksLikeNetworkMessage = /network|timeout|failed to fetch|socket/i.test(error?.message || '');
  const isNetwork = !hasResponse && (Boolean(error?.request) || looksLikeNetworkMessage);
  const isServer = hasResponse && status >= 500;
  const validationErrors = Array.isArray(responseData?.errors)
    ? responseData.errors
    : null;
  const isTenantCapabilityBlock = code === 'TENANT_CAPABILITY_DISABLED';
  const isCustomerAccessModeBlock = code === 'CUSTOMER_ACCESS_MODE_BLOCKED';
  const isCapabilityBlock = isTenantCapabilityBlock || isCustomerAccessModeBlock;
  const capabilityBlockMessage = isTenantCapabilityBlock
    ? (getCapabilityBlockMessage(capability) || responseData?.message || 'This capability is disabled for this company by platform admin.')
    : null;
  const storefrontModeMessage = isCustomerAccessModeBlock
    ? (getStorefrontAccessModeMessage(effectiveMode) || getStorefrontAccessModeMessage(requestedMode) || responseData?.message || 'This Storefront action is not available in the current customer access mode.')
    : null;
  const message =
    capabilityBlockMessage ||
    storefrontModeMessage ||
    responseData?.message ||
    (status ? STATUS_MESSAGE_MAP[status] : null) ||
    (isNetwork ? FALLBACK_NETWORK_MESSAGE : null) ||
    error?.message ||
    FALLBACK_UNKNOWN_MESSAGE;

  return {
    status,
    title: isCapabilityBlock ? CAPABILITY_BLOCK_TITLE : null,
    message,
    code,
    capability,
    requestedAction,
    requestedMode,
    effectiveMode,
    kind: isNetwork ? 'network' : (isServer ? 'server' : 'http'),
    validationErrors,
    isCapabilityBlock,
    isGlobalCandidate: isNetwork || isServer
  };
};

export const emitGlobalApiError = ({ error, source }) => {
  const normalized = normalizeApiError(error);
  if (normalized.isCapabilityBlock) {
    const detail = {
      kind: 'capability',
      status: normalized.status,
      title: normalized.title,
      message: normalized.message,
      code: normalized.code,
      capability: normalized.capability,
      requestedAction: normalized.requestedAction,
      requestedMode: normalized.requestedMode,
      effectiveMode: normalized.effectiveMode,
      source: source || 'tenant-api',
      url: error?.config?.url,
      method: error?.config?.method?.toUpperCase(),
      suppressToast: error?.config?.skipGlobalErrorToast === true,
      timestamp: new Date().toISOString()
    };
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(buildEvent('tenant:capability-blocked', detail));
    }
    return detail;
  }

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
