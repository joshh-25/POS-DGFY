const STOREFRONT_AUTH_TOKEN_KEYS = ['dgfy_store_customer_token', 'store_customer_token', 'store_token'];
const DGFY_CUSTOMER_AUTH_TOKEN_KEYS = ['dgfy_customer_account_token', 'dgfy_account_token'];

export const readStoreAuthToken = () => {
  if (typeof window === 'undefined') return '';
  for (const key of STOREFRONT_AUTH_TOKEN_KEYS) {
    const token = String(window.localStorage.getItem(key) || '').trim();
    if (token) return token;
  }
  return '';
};

export const readDgfyAuthToken = () => {
  if (typeof window === 'undefined') return '';
  for (const key of DGFY_CUSTOMER_AUTH_TOKEN_KEYS) {
    const token = String(window.localStorage.getItem(key) || '').trim();
    if (token) return token;
  }
  return '';
};

export const writeStoreAuthToken = (token) => {
  if (typeof window === 'undefined') return;
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return;
  window.localStorage.setItem(STOREFRONT_AUTH_TOKEN_KEYS[0], normalizedToken);
  STOREFRONT_AUTH_TOKEN_KEYS.slice(1).forEach((key) => window.localStorage.removeItem(key));
};

export const writeDgfyAuthToken = (token) => {
  if (typeof window === 'undefined') return;
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return;
  window.localStorage.setItem(DGFY_CUSTOMER_AUTH_TOKEN_KEYS[0], normalizedToken);
  DGFY_CUSTOMER_AUTH_TOKEN_KEYS.slice(1).forEach((key) => window.localStorage.removeItem(key));
};

export const clearStoreAuthToken = () => {
  if (typeof window === 'undefined') return;
  STOREFRONT_AUTH_TOKEN_KEYS.forEach((key) => window.localStorage.removeItem(key));
};

export const clearDgfyAuthToken = () => {
  if (typeof window === 'undefined') return;
  DGFY_CUSTOMER_AUTH_TOKEN_KEYS.forEach((key) => window.localStorage.removeItem(key));
};
