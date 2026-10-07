import { safeLocalStorageGet, safeLocalStorageSet } from './posTerminalStorage.js';

export const CUSTOMER_DISPLAY_ENABLED_STORAGE_PREFIX = 'pos_customer_display_enabled_v1:';

const normalizeTerminalId = (terminalId) => String(terminalId || '').trim().toUpperCase();

const getCustomerDisplayPreferenceKey = (terminalId) => {
  const normalizedTerminalId = normalizeTerminalId(terminalId);
  return normalizedTerminalId
    ? `${CUSTOMER_DISPLAY_ENABLED_STORAGE_PREFIX}${normalizedTerminalId}`
    : '';
};

export const readCustomerDisplayEnabled = (terminalId, {
  storage,
  defaultValue = true
} = {}) => {
  const key = getCustomerDisplayPreferenceKey(terminalId);
  if (!key) return defaultValue === true;

  const stored = safeLocalStorageGet(key, { storage });
  if (stored == null || String(stored).trim() === '') return defaultValue === true;

  return !['0', 'false', 'off', 'disabled'].includes(String(stored).trim().toLowerCase());
};

export const writeCustomerDisplayEnabled = (terminalId, enabled, { storage } = {}) => {
  const key = getCustomerDisplayPreferenceKey(terminalId);
  if (!key) return false;
  return safeLocalStorageSet(key, enabled === true ? '1' : '0', { storage });
};
