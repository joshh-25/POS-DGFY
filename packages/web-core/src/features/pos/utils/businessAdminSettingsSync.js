const BUSINESS_ADMIN_SETTINGS_CHANNEL = 'dgfy_business_admin_settings_sync_v1';
const BUSINESS_ADMIN_SETTINGS_STORAGE_KEY = 'dgfy_business_admin_settings_sync_v1';

export const BUSINESS_ADMIN_SETTINGS_SYNC_EVENT = 'dgfy:business-admin-settings-updated';

const normalizePayload = (payload = {}) => ({
  version: 1,
  eventId: String(payload.eventId || `${Date.now()}-${Math.random().toString(36).slice(2)}`).trim(),
  tenantId: String(payload.tenantId || '').trim(),
  branchId: String(payload.branchId || '').trim(),
  section: String(payload.section || '').trim(),
  source: String(payload.source || 'business-admin').trim() || 'business-admin',
  updatedAt: Number(payload.updatedAt || Date.now())
});

const isValidPayload = (payload) => (
  payload
  && Number(payload.version) === 1
  && String(payload.eventId || '').trim()
  && Number.isFinite(Number(payload.updatedAt))
);

const createChannel = () => {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(BUSINESS_ADMIN_SETTINGS_CHANNEL);
  } catch {
    return null;
  }
};

export const publishBusinessAdminSettingsUpdated = (payload = {}, windowObj = typeof window === 'undefined' ? null : window) => {
  if (!windowObj) return null;
  const normalized = normalizePayload(payload);

  try {
    windowObj.dispatchEvent(new windowObj.CustomEvent(BUSINESS_ADMIN_SETTINGS_SYNC_EVENT, {
      detail: normalized
    }));
  } catch {
    // A local event is best effort; the storage/channel paths still notify other windows.
  }

  try {
    windowObj.localStorage.setItem(BUSINESS_ADMIN_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Private browsing and embedded WebViews may deny localStorage. BroadcastChannel is optional.
  }

  const channel = createChannel();
  if (channel) {
    try {
      channel.postMessage(normalized);
    } catch {
      // Cross-window refresh is advisory and must never block a successful settings save.
    } finally {
      channel.close();
    }
  }

  return normalized;
};

export const subscribeToBusinessAdminSettingsUpdates = (
  handler,
  windowObj = typeof window === 'undefined' ? null : window
) => {
  if (!windowObj || typeof handler !== 'function') return () => {};

  const seenEventIds = new Set();
  const emit = (payload) => {
    if (!isValidPayload(payload)) return;
    const normalized = normalizePayload(payload);
    if (seenEventIds.has(normalized.eventId)) return;
    seenEventIds.add(normalized.eventId);
    if (seenEventIds.size > 20) {
      const oldest = seenEventIds.values().next().value;
      seenEventIds.delete(oldest);
    }
    handler(normalized);
  };
  const handleLocalEvent = (event) => emit(event?.detail);
  const handleStorageEvent = (event) => {
    if (event?.key !== BUSINESS_ADMIN_SETTINGS_STORAGE_KEY || !event?.newValue) return;
    try {
      emit(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed storage entries from an older or interrupted writer.
    }
  };

  windowObj.addEventListener(BUSINESS_ADMIN_SETTINGS_SYNC_EVENT, handleLocalEvent);
  windowObj.addEventListener('storage', handleStorageEvent);

  const channel = createChannel();
  if (channel) channel.addEventListener('message', (event) => emit(event?.data));

  return () => {
    windowObj.removeEventListener(BUSINESS_ADMIN_SETTINGS_SYNC_EVENT, handleLocalEvent);
    windowObj.removeEventListener('storage', handleStorageEvent);
    if (channel) channel.close();
  };
};

export const shouldRefreshBusinessAdminSettingsUpdate = ({
  payload = {},
  activeTenantId = '',
  activeBranchId = null
} = {}) => {
  const eventTenantId = String(payload?.tenantId || '').trim();
  const currentTenantId = String(activeTenantId || '').trim();
  if (eventTenantId && eventTenantId !== currentTenantId) return false;

  const branchIdText = String(payload?.branchId || '').trim();
  if (!branchIdText) return true;
  if (!/^\d+$/.test(branchIdText)) return false;

  const eventBranchId = Number(branchIdText);
  const currentBranchId = Number(activeBranchId || 0);
  return Number.isInteger(eventBranchId)
    && eventBranchId > 0
    && Number.isInteger(currentBranchId)
    && currentBranchId > 0
    && eventBranchId === currentBranchId;
};

// OPIS (issue #2052) lives on another origin, so its saves never reach POS through the
// same-origin CustomEvent/localStorage/BroadcastChannel paths above. Instead POS
// revalidates its canonical settings when it regains focus/visibility or reconnects
// after offline state. Duplicate triggers are coalesced behind a minimum interval; the
// caller owns the actual refresh (scoped hydration that must not change tenant, reset
// checkout, close a shift, overwrite dirty settings, or silently reprice an active
// sale). No realtime service and no cross-origin token messaging.
export const OPIS_SETTINGS_REFRESH_MIN_INTERVAL_MS = 15000;

export const installPosFocusSettingsRefresh = (
  refresh,
  windowObj = typeof window === 'undefined' ? null : window,
  { minIntervalMs = OPIS_SETTINGS_REFRESH_MIN_INTERVAL_MS } = {}
) => {
  if (!windowObj || typeof refresh !== 'function') return () => {};
  let lastRefreshAt = 0;
  let offlineSeen = false;

  const maybeRefresh = (reason) => {
    if (windowObj.document?.visibilityState === 'hidden') return;
    const now = Date.now();
    if (now - lastRefreshAt < minIntervalMs) return;
    lastRefreshAt = now;
    try {
      const result = refresh({ reason });
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          // A background refresh failure leaves POS on its current snapshot.
        });
      }
    } catch {
      // A background refresh must never break the terminal that triggered it.
    }
  };

  const handleFocus = () => maybeRefresh('focus');
  const handleVisibility = () => {
    if (windowObj.document?.visibilityState === 'visible') maybeRefresh('visible');
  };
  const handleOffline = () => { offlineSeen = true; };
  const handleOnline = () => {
    if (!offlineSeen) return;
    offlineSeen = false;
    maybeRefresh('reconnect');
  };

  windowObj.addEventListener('focus', handleFocus);
  windowObj.document?.addEventListener('visibilitychange', handleVisibility);
  windowObj.addEventListener('offline', handleOffline);
  windowObj.addEventListener('online', handleOnline);

  return () => {
    windowObj.removeEventListener('focus', handleFocus);
    windowObj.document?.removeEventListener('visibilitychange', handleVisibility);
    windowObj.removeEventListener('offline', handleOffline);
    windowObj.removeEventListener('online', handleOnline);
  };
};

export { BUSINESS_ADMIN_SETTINGS_CHANNEL, BUSINESS_ADMIN_SETTINGS_STORAGE_KEY };
