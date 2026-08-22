const RECOVERABLE_PREFERENCE_PREFIXES = [
  'pos_terminal_last_view_v1:',
  'posTerminalSidebarCollapsed',
  'pos_online_order_sound_enabled_v1'
];

const getLocalStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
const isQuotaExceededError = (error) => (
  error?.name === 'QuotaExceededError'
  || error?.code === 22
  || error?.code === 1014
  || /quota/i.test(String(error?.message || ''))
);

const clearRecoverablePreferences = (storage) => {
  if (!storage) return;
  const keys = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && RECOVERABLE_PREFERENCE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keys.push(key);
      }
    }
    keys.forEach((key) => {
      try {
        storage.removeItem(key);
      } catch {
        // A storage failure must not interrupt POS startup.
      }
    });
  } catch {
    // Storage may be unavailable or blocked by the browser.
  }
};

export const safeLocalStorageGet = (key, { storage = getLocalStorage() } = {}) => {
  if (!storage || !key) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

export const safeLocalStorageRemove = (key, { storage = getLocalStorage() } = {}) => {
  if (!storage || !key) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

export const safeLocalStorageSet = (key, value, {
  storage = getLocalStorage(),
  retryAfterPreferenceCleanup = true
} = {}) => {
  if (!storage || !key) return false;
  try {
    storage.setItem(key, String(value ?? ''));
    return true;
  } catch (error) {
    if (!retryAfterPreferenceCleanup || !isQuotaExceededError(error)) return false;
    clearRecoverablePreferences(storage);
    try {
      storage.setItem(key, String(value ?? ''));
      return true;
    } catch {
      return false;
    }
  }
};
