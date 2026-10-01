const RECOVERABLE_PREFERENCE_PREFIXES = [
  'pos_terminal_last_view_v1:',
  'posTerminalSidebarCollapsed',
  'pos_online_order_sound_enabled_v1',
  // Phase 230 (#1288): Active Queue view-mode toggle (card/table).
  'pos_queue_view_mode_v1'
];
const POS_CASHIER_RESUME_CONTEXT_STORAGE_KEY = 'pos_cashier_resume_context_v1';

const getLocalStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
const getSessionStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
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

export const safeSessionStorageGet = (key, { storage = getSessionStorage() } = {}) => {
  if (!storage || !key) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

export const safeSessionStorageRemove = (key, { storage = getSessionStorage() } = {}) => {
  if (!storage || !key) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

export const safeSessionStorageSet = (key, value, { storage = getSessionStorage() } = {}) => {
  if (!storage || !key) return false;
  try {
    storage.setItem(key, String(value ?? ''));
    return true;
  } catch {
    return false;
  }
};

const normalizeResumeContext = (context) => {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;

  const shiftId = Number(context.shiftId);
  const cashierId = Number(context.cashierId);
  const locationId = Number(context.locationId);
  const terminalId = String(context.terminalId || '').trim().toUpperCase();
  const tenantId = String(context.tenantId || '').trim();
  if (
    !Number.isSafeInteger(shiftId)
    || shiftId <= 0
    || !Number.isSafeInteger(locationId)
    || locationId <= 0
    || !terminalId
    || terminalId.length > 32
    || !tenantId
    || tenantId.length > 128
  ) return null;

  return {
    version: 1,
    shiftId,
    cashierId: Number.isSafeInteger(cashierId) && cashierId > 0 ? cashierId : null,
    terminalId,
    locationId,
    tenantId
  };
};

// This tab-local pointer is not authentication or shift authority. Never store
// credentials, tokens, email addresses, or financial snapshots in it; the API
// revalidates the user, shift, attendance, break, and terminal scope on resume.
export const readStoredCashierResumeContext = ({ storage = getSessionStorage() } = {}) => {
  const raw = safeSessionStorageGet(POS_CASHIER_RESUME_CONTEXT_STORAGE_KEY, { storage });
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeResumeContext(parsed);
    if (parsed?.version !== 1 || !normalized) {
      safeSessionStorageRemove(POS_CASHIER_RESUME_CONTEXT_STORAGE_KEY, { storage });
      return null;
    }
    return normalized;
  } catch {
    safeSessionStorageRemove(POS_CASHIER_RESUME_CONTEXT_STORAGE_KEY, { storage });
    return null;
  }
};

export const writeStoredCashierResumeContext = (context, { storage = getSessionStorage() } = {}) => {
  if (!context) return safeSessionStorageRemove(POS_CASHIER_RESUME_CONTEXT_STORAGE_KEY, { storage });
  const normalized = normalizeResumeContext(context);
  if (!normalized) {
    safeSessionStorageRemove(POS_CASHIER_RESUME_CONTEXT_STORAGE_KEY, { storage });
    return false;
  }
  return safeSessionStorageSet(POS_CASHIER_RESUME_CONTEXT_STORAGE_KEY, JSON.stringify(normalized), { storage });
};
