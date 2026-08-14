export const createStorefrontIdempotencyKey = (prefix = 'storefront') => {
  const normalizedPrefix = String(prefix || 'storefront').trim() || 'storefront';
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId
    ? `${normalizedPrefix}-${randomId}`
    : `${normalizedPrefix}-${Date.now()}`;
};
