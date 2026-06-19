const STOREFRONT_AUTH_TOKEN_KEYS = ['dgfy_store_customer_token', 'store_customer_token', 'store_token'];
const DGFY_CUSTOMER_AUTH_TOKEN_KEYS = ['dgfy_customer_account_token', 'dgfy_account_token'];
const DGFY_EXPLICIT_SIGN_OUT_KEY = 'dgfy_customer_explicit_sign_out';

const readSessionToken = (key) => {
  try {
    return String(window.sessionStorage.getItem(key) || '').trim();
  } catch {
    return '';
  }
};

const writeSessionToken = (key, token) => {
  try {
    window.sessionStorage.setItem(key, token);
  } catch {
    // Session storage can be unavailable in hardened/private browser modes.
  }
};

const clearTokenKeys = (storage, keys) => {
  if (!storage) return;
  keys.forEach((key) => {
    try {
      storage.removeItem(key);
    } catch {
      // Storage cleanup is best-effort.
    }
  });
};

export const readStoreAuthToken = () => {
  if (typeof window === 'undefined') return '';
  for (const key of STOREFRONT_AUTH_TOKEN_KEYS) {
    const token = readSessionToken(key);
    if (token) return token;
  }
  return '';
};

export const readDgfyAuthToken = () => {
  if (typeof window === 'undefined') return '';
  for (const key of DGFY_CUSTOMER_AUTH_TOKEN_KEYS) {
    const token = readSessionToken(key);
    if (token) return token;
  }
  return '';
};

export const writeStoreAuthToken = (token) => {
  if (typeof window === 'undefined') return;
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return;
  writeSessionToken(STOREFRONT_AUTH_TOKEN_KEYS[0], normalizedToken);
  clearTokenKeys(window.sessionStorage, STOREFRONT_AUTH_TOKEN_KEYS.slice(1));
  clearTokenKeys(window.localStorage, STOREFRONT_AUTH_TOKEN_KEYS);
};

export const writeDgfyAuthToken = (token) => {
  if (typeof window === 'undefined') return;
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return;
  writeSessionToken(DGFY_CUSTOMER_AUTH_TOKEN_KEYS[0], normalizedToken);
  clearTokenKeys(window.sessionStorage, DGFY_CUSTOMER_AUTH_TOKEN_KEYS.slice(1));
  clearTokenKeys(window.localStorage, DGFY_CUSTOMER_AUTH_TOKEN_KEYS);
  clearDgfyExplicitSignOut();
};

export const clearStoreAuthToken = () => {
  if (typeof window === 'undefined') return;
  clearTokenKeys(window.sessionStorage, STOREFRONT_AUTH_TOKEN_KEYS);
  clearTokenKeys(window.localStorage, STOREFRONT_AUTH_TOKEN_KEYS);
};

export const clearDgfyAuthToken = () => {
  if (typeof window === 'undefined') return;
  clearTokenKeys(window.sessionStorage, DGFY_CUSTOMER_AUTH_TOKEN_KEYS);
  clearTokenKeys(window.localStorage, DGFY_CUSTOMER_AUTH_TOKEN_KEYS);
};

export const markDgfyExplicitSignOut = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DGFY_EXPLICIT_SIGN_OUT_KEY, String(Date.now()));
  } catch {
    // Session storage can be unavailable in hardened/private browser modes.
  }
};

export const clearDgfyExplicitSignOut = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(DGFY_EXPLICIT_SIGN_OUT_KEY);
  } catch {
    // Session storage cleanup is best-effort.
  }
};

export const hasDgfyExplicitSignOut = () => {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.sessionStorage.getItem(DGFY_EXPLICIT_SIGN_OUT_KEY));
  } catch {
    return false;
  }
};
