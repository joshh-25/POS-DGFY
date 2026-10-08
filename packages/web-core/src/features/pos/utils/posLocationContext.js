const POS_LOCATION_CONTEXT_CHANNEL = 'dgfy_pos_location_context_v1';
const POS_LOCATION_CONTEXT_STORAGE_KEY = 'dgfy_pos_location_context_v1';

export const POS_LOCATION_CONTEXT_SYNC_EVENT = 'dgfy:pos-location-context-updated';

const normalizeLocationId = (value) => {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const normalizePayload = (payload = {}) => ({
  version: 1,
  eventId: String(payload.eventId || `${Date.now()}-${Math.random().toString(36).slice(2)}`).trim(),
  tenantId: String(payload.tenantId || '').trim(),
  operatingLocationId: normalizeLocationId(payload.operatingLocationId),
  viewingLocationId: normalizeLocationId(payload.viewingLocationId),
  queueLocationScopeId: normalizeLocationId(payload.queueLocationScopeId),
  contextVersion: Number(payload.contextVersion) > 0 ? Number(payload.contextVersion) : Date.now(),
  source: String(payload.source || 'pos-terminal').trim() || 'pos-terminal',
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
    return new BroadcastChannel(POS_LOCATION_CONTEXT_CHANNEL);
  } catch {
    return null;
  }
};

export const publishPosLocationContext = (
  payload = {},
  windowObj = typeof window === 'undefined' ? null : window
) => {
  if (!windowObj) return null;
  const normalized = normalizePayload(payload);

  try {
    windowObj.dispatchEvent(new windowObj.CustomEvent(POS_LOCATION_CONTEXT_SYNC_EVENT, {
      detail: normalized
    }));
  } catch {
    // Embedded WebViews may not expose CustomEvent. Storage/channel still provide best effort sync.
  }

  try {
    windowObj.localStorage.setItem(POS_LOCATION_CONTEXT_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Storage can be unavailable in private browsing or restricted WebViews.
  }

  const channel = createChannel();
  if (channel) {
    try {
      channel.postMessage(normalized);
    } catch {
      // Cross-window context sync is advisory and must never block a committed shift switch.
    } finally {
      channel.close();
    }
  }

  return normalized;
};

export const subscribeToPosLocationContext = (
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
      seenEventIds.delete(seenEventIds.values().next().value);
    }
    handler(normalized);
  };
  const handleLocalEvent = (event) => emit(event?.detail);
  const handleStorageEvent = (event) => {
    if (event?.key !== POS_LOCATION_CONTEXT_STORAGE_KEY || !event?.newValue) return;
    try {
      emit(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed or interrupted context writes.
    }
  };

  windowObj.addEventListener(POS_LOCATION_CONTEXT_SYNC_EVENT, handleLocalEvent);
  windowObj.addEventListener('storage', handleStorageEvent);

  const channel = createChannel();
  if (channel) channel.addEventListener('message', (event) => emit(event?.data));

  return () => {
    windowObj.removeEventListener(POS_LOCATION_CONTEXT_SYNC_EVENT, handleLocalEvent);
    windowObj.removeEventListener('storage', handleStorageEvent);
    if (channel) channel.close();
  };
};

export const isPosLocationContextForTenant = (payload, tenantId) => {
  const eventTenantId = String(payload?.tenantId || '').trim();
  const currentTenantId = String(tenantId || '').trim();
  return Boolean(eventTenantId && currentTenantId && eventTenantId === currentTenantId);
};

export { POS_LOCATION_CONTEXT_CHANNEL, POS_LOCATION_CONTEXT_STORAGE_KEY };
