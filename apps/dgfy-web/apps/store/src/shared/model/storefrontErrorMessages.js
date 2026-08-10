import { getStorefrontAccessModeMessage } from '../../../../../src/utils/tenantCapabilityMessages.js';

const getValidationErrors = (error) => {
  const candidates = [
    error?.details,
    error?.payload?.errors,
    error?.errors
  ];
  return candidates.find(Array.isArray) || [];
};

const getValidationField = (entry = {}) => String(entry?.field || entry?.path || '').trim();

const normalizeCheckoutValidationMessage = (error, fallback) => {
  const validationErrors = getValidationErrors(error);
  const first = validationErrors[0] || null;
  const field = getValidationField(first);
  const message = String(first?.message || error?.message || '').trim();

  if (field === 'payment_type') return 'Choose a valid payment method before placing the order.';
  if (field === 'lines') return 'Your cart is empty or contains an invalid item. Review the cart and try again.';
  if (field === 'customer_email') return 'Enter a valid email address or leave it blank.';
  if (field === 'customer_name') return 'Enter the customer name before checkout.';
  if (field === 'customer_phone') return 'Enter a valid contact number before checkout.';
  if (field === 'delivery_address') return 'Delivery address is required for delivery orders.';
  if (field === 'idempotency_key') return 'Checkout session expired. Refresh the cart and try again.';
  if (field === 'location_id') return 'Choose a valid fulfillment location before checkout.';

  if (message && message.toLowerCase() !== 'validation failed') {
    return `Fix required: ${message}`;
  }

  return fallback || 'Review the checkout details and try again.';
};

export const normalizeStorefrontErrorMessage = (error, fallback = 'Request failed.') => {
  if (error?.isNetworkError) {
    return 'Request failed before reaching API. Check store API proxy/CORS connectivity.';
  }

  const errorCode = String(error?.errorCode || '').trim().toUpperCase();
  const baseMessage = String(error?.message || '').trim() || fallback;
  const details = error?.details || {};
  const reasonCode = String(details?.reason_code || '').trim().toUpperCase();

  if (reasonCode === 'FNB_RECIPE_INGREDIENT_SHORTFALL') {
    const product = details.product_name || 'Selected menu item';
    const ingredient = details.ingredient_name || `ingredient ${details.ingredient_item_id || ''}`.trim();
    const available = details.available ?? '0';
    const requested = details.requested ?? details.required ?? '';
    const unit = details.unit_of_measure ? ` ${details.unit_of_measure}` : '';
    const location = details.location_id ? ` at location ${details.location_id}` : '';
    return `${product} cannot be checked out because ${ingredient} is short${location}. Available: ${available}${unit}; required: ${requested}${unit}.`;
  }

  if (reasonCode === 'FNB_RECIPE_UOM_INCOMPATIBLE') {
    const product = details.product_name || 'Selected menu item';
    const ingredient = details.ingredient_name || `ingredient ${details.ingredient_item_id || ''}`.trim();
    return `${product} cannot be checked out because ${ingredient} uses incompatible recipe units (${details.recipe_uom || 'recipe UOM'} to ${details.ingredient_uom || 'stock UOM'}). Update the recipe or ingredient UOM, then retry.`;
  }

  if (reasonCode === 'FNB_KITCHEN_ORDER_UNAVAILABLE') {
    return 'Kitchen order could not be queued. Ask staff to refresh the F&B setup, then retry checkout.';
  }

  if (errorCode === 'RESOURCE_NOT_FOUND') {
    return 'Tracking PIN not found. Verify the latest PIN from your checkout confirmation.';
  }
  if (errorCode === 'VALIDATION_FAILED') {
    return normalizeCheckoutValidationMessage(error, fallback);
  }
  if (errorCode === 'AUTHENTICATION_FAILED' || errorCode === 'AUTHORIZATION_FAILED') {
    return 'Session or permission check failed. Sign in again, then retry.';
  }
  if (errorCode === 'CUSTOMER_ACCESS_MODE_BLOCKED') {
    const effectiveMode = String(
      details?.effective_customer_access_mode
        || details?.effective_mode
        || details?.customer_access_mode
        || ''
    ).trim().toLowerCase();
    const requestedMode = String(
      details?.requested_customer_access_mode
        || details?.requested_mode
        || ''
    ).trim().toLowerCase();
    return getStorefrontAccessModeMessage(effectiveMode)
      || getStorefrontAccessModeMessage(requestedMode)
      || 'This Storefront action is not available in the current customer access mode.';
  }

  const normalized = baseMessage.toLowerCase();
  if (normalized.includes('does not support')) {
    return `Selected fulfillment option is not available for this location. ${baseMessage}`;
  }
  if (normalized.includes('delivery_address is required')) {
    return 'Delivery address is required for delivery orders.';
  }
  if (normalized.includes('storefront ordering is currently closed by the pos')) {
    return 'Online ordering is closed because there is no active POS shift. Open a POS shift, then try again.';
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
  const retryAfterSeconds = Number(error?.details?.retryAfterSeconds ?? error?.retryAfterSeconds ?? error?.retry_after_seconds);

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

  if (
    Number(error?.status) === 429
    || errorCode === 'RATE_LIMITED'
    || baseMessage.toLowerCase().includes('too many requests')
  ) {
    const retryLabel = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? ` Please wait about ${Math.ceil(retryAfterSeconds / 60)} minute(s) before retrying.`
      : ' Please wait a moment before retrying.';
    return {
      message: 'This storefront is temporarily rate-limited for your current IP.',
      guidance: `The storefront API blocked additional discovery requests.${retryLabel}`
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
