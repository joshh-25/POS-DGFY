export const normalizeStorefrontErrorMessage = (error, fallback = 'Request failed.') => {
  if (error?.isNetworkError) {
    return 'Request failed before reaching API. Check store API proxy/CORS connectivity.';
  }

  const errorCode = String(error?.errorCode || '').trim().toUpperCase();
  const baseMessage = String(error?.message || '').trim() || fallback;

  if (errorCode === 'RESOURCE_NOT_FOUND') {
    return 'Tracking PIN not found. Verify the latest PIN from your checkout confirmation.';
  }
  if (errorCode === 'VALIDATION_FAILED') {
    return `Fix required: ${baseMessage}`;
  }
  if (errorCode === 'AUTHENTICATION_FAILED' || errorCode === 'AUTHORIZATION_FAILED') {
    return 'Session or permission check failed. Sign in again, then retry.';
  }

  const normalized = baseMessage.toLowerCase();
  if (normalized.includes('does not support')) {
    return `Selected fulfillment option is not available for this location. ${baseMessage}`;
  }
  if (normalized.includes('delivery_address is required')) {
    return 'Delivery address is required for delivery orders.';
  }
  if (normalized.includes('currently closed')) {
    return 'Selected location is currently closed. Choose another location or try again later.';
  }
  if (normalized.includes('tracking pin')) {
    return `Tracking input issue: ${baseMessage}`;
  }

  return baseMessage;
};

export const classifyStoreCatalogError = (error, fallback = 'Failed to load tenant catalog.') => {
  const baseMessage = String(error?.message || '').trim() || fallback;
  const errorCode = String(error?.errorCode || '').trim().toUpperCase();

  if (error?.isNetworkError) {
    return {
      message: 'Request failed before reaching API. Check store API proxy/CORS connectivity.',
      guidance: 'Connectivity issue detected. Please retry after confirming the API and proxy are reachable.'
    };
  }

  if (errorCode === 'STORE_CATALOG_RUNTIME_ERROR' || errorCode === 'INTERNAL_ERROR') {
    return {
      message: baseMessage,
      guidance: 'Server/runtime issue while loading catalog. This is not the same as tenant item setup. Please retry or escalate with request details.'
    };
  }

  if (errorCode === 'STORE_CATALOG_LOCATION_INVALID') {
    return {
      message: baseMessage,
      guidance: 'Selected fulfillment location is invalid for this tenant. Refresh the tenant page and reselect a valid branch.'
    };
  }

  return {
    message: baseMessage,
    guidance: ''
  };
};

export default {
  normalizeStorefrontErrorMessage,
  classifyStoreCatalogError
};
