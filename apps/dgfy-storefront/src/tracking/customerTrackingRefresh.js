export const ACTIVE_CUSTOMER_TRACKING_STATUSES = new Set([
  'placed',
  'confirmed',
  'preparing',
  'packed',
  'ready_for_pickup',
  'out_for_delivery'
]);

export const TERMINAL_CUSTOMER_TRACKING_STATUSES = new Set([
  'completed',
  'delivered',
  'picked_up',
  'cancelled',
  'rejected'
]);

export const CUSTOMER_TRACKING_POLL_INTERVALS = Object.freeze({
  visiblePlaced: 20000,
  visibleActive: 15000,
  visibleFastActive: 10000,
  hidden: 90000,
  terminal: 0
});

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const normalizeReference = (order = {}) => String(
  order.reference
  || order.tracking_pin
  || order.trackingPin
  || order.activity_id
  || ''
).trim().toUpperCase();

const getOrderTimestamp = (order = {}) => (
  Date.parse(order.occurred_at || order.updated_at || order.created_at || 0) || 0
);

export const buildTrackingPinKey = (orders = [], {
  enabled = true,
  excludePin = ''
} = {}) => {
  if (!enabled) return '';
  const normalizedExcludePin = String(excludePin || '').trim().toUpperCase();
  return Array.from(new Set(
    (Array.isArray(orders) ? orders : [])
      .map((entry) => String(entry?.tracking_pin || '').trim().toUpperCase())
      .filter((pin) => Boolean(pin) && pin !== normalizedExcludePin)
  )).sort().join('|');
};

export const dedupeActiveCustomerOrders = (orders = []) => {
  const newestByReference = new Map();

  (Array.isArray(orders) ? orders : []).forEach((order, index) => {
    const reference = normalizeReference(order) || `UNREFERENCED:${index}`;
    const existing = newestByReference.get(reference);
    if (!existing || getOrderTimestamp(order) >= getOrderTimestamp(existing)) {
      newestByReference.set(reference, order);
    }
  });

  return Array.from(newestByReference.values())
    .filter((order) => ACTIVE_CUSTOMER_TRACKING_STATUSES.has(normalizeStatus(order?.status)))
    .sort((left, right) => getOrderTimestamp(right) - getOrderTimestamp(left));
};

export const mergeVisibleTrackingResult = (trackingResult = null, activity = null) => {
  if (!trackingResult || !activity) return trackingResult;

  const trackingReference = normalizeReference({
    reference: trackingResult.tracking_pin || trackingResult.order?.tracking_pin
  });
  const activityReference = normalizeReference(activity);
  if (!trackingReference || trackingReference !== activityReference) return trackingResult;

  return {
    ...trackingResult,
    status: activity.status || trackingResult.status,
    status_label: activity.status_label || activity.status || trackingResult.status_label,
    updated_at: activity.updated_at || activity.occurred_at || trackingResult.updated_at
  };
};

export const resolveSelectedTrackingPollMs = ({
  visibilityState = 'visible',
  status = ''
} = {}) => {
  const normalizedStatus = normalizeStatus(status);
  if (TERMINAL_CUSTOMER_TRACKING_STATUSES.has(normalizedStatus)) {
    return CUSTOMER_TRACKING_POLL_INTERVALS.terminal;
  }
  if (visibilityState === 'hidden') return CUSTOMER_TRACKING_POLL_INTERVALS.hidden;
  if (normalizedStatus === 'out_for_delivery' || normalizedStatus === 'ready_for_pickup') {
    return CUSTOMER_TRACKING_POLL_INTERVALS.visibleFastActive;
  }
  if (normalizedStatus === 'placed' || normalizedStatus === 'confirmed') {
    return CUSTOMER_TRACKING_POLL_INTERVALS.visiblePlaced;
  }
  return CUSTOMER_TRACKING_POLL_INTERVALS.visibleActive;
};

export const resolveTrackingRetryDelayMs = ({
  error = null,
  normalDelayMs = CUSTOMER_TRACKING_POLL_INTERVALS.visibleActive
} = {}) => {
  const normalizedDelayMs = Math.max(0, Number(normalDelayMs) || 0);
  const retryAfterSeconds = Number(
    error?.retryAfterSeconds
    ?? error?.details?.retryAfterSeconds
    ?? error?.data?.retryAfterSeconds
  );
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) return normalizedDelayMs;
  return Math.max(normalizedDelayMs, Math.ceil(retryAfterSeconds * 1000));
};

export const getTrackingRetryAfterSeconds = (error = null) => {
  const retryAfterSeconds = Number(
    error?.retryAfterSeconds
    ?? error?.details?.retryAfterSeconds
    ?? error?.data?.retryAfterSeconds
  );
  return Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? Math.ceil(retryAfterSeconds)
    : 0;
};

export const formatTrackingCooldown = (seconds = 0) => {
  const normalizedSeconds = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (normalizedSeconds <= 0) return '';
  if (normalizedSeconds < 60) return `${normalizedSeconds} second${normalizedSeconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(normalizedSeconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

export const createCompletionTrackingScheduler = ({
  poll,
  resolveDelayMs,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout
} = {}) => {
  if (typeof poll !== 'function') throw new TypeError('poll must be a function');
  if (typeof resolveDelayMs !== 'function') throw new TypeError('resolveDelayMs must be a function');

  let timerId = null;
  let stopped = true;
  let inFlight = false;

  const schedule = (delayMs) => {
    if (stopped) return;
    const normalizedDelayMs = Number(delayMs);
    if (!Number.isFinite(normalizedDelayMs) || normalizedDelayMs <= 0) return;
    timerId = setTimeoutFn(run, normalizedDelayMs);
  };

  const run = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    let result = null;
    let error = null;
    try {
      result = await poll();
    } catch (pollError) {
      error = pollError;
    } finally {
      inFlight = false;
    }
    if (!stopped) schedule(resolveDelayMs({ result, error }));
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      void run();
    },
    stop() {
      stopped = true;
      if (timerId !== null) clearTimeoutFn(timerId);
      timerId = null;
    },
    runNow() {
      return run();
    },
    isInFlight() {
      return inFlight;
    }
  };
};
