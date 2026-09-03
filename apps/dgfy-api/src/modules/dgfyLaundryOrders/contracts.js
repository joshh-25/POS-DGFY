import crypto from 'node:crypto';

export const DGLAUNDRY_EVENT_TYPES = Object.freeze({
  CATALOG: 'dglaundry.laundry_catalog.published.v1',
  AVAILABILITY: 'dglaundry.laundry_branch.availability_changed.v1',
  ACCEPTED: 'dglaundry.laundry_order.accepted.v1',
  REJECTED: 'dglaundry.laundry_order.rejected.v1',
  COUNTER_ACTIVITY: 'dglaundry.laundry_order.counter_registered.v1',
  PROGRESS: 'dglaundry.laundry_order.service_progressed.v1',
  STATUS: 'dglaundry.laundry_order.status_changed.v1',
  FULFILLMENT: 'dglaundry.laundry_order.fulfillment_changed.v1'
});

export const DGLAUNDRY_EVENT_TYPE_SET = new Set(Object.values(DGLAUNDRY_EVENT_TYPES));
export const ORDER_EVENT_TYPES = new Set([
  DGLAUNDRY_EVENT_TYPES.ACCEPTED,
  DGLAUNDRY_EVENT_TYPES.REJECTED,
  DGLAUNDRY_EVENT_TYPES.COUNTER_ACTIVITY,
  DGLAUNDRY_EVENT_TYPES.PROGRESS,
  DGLAUNDRY_EVENT_TYPES.STATUS,
  DGLAUNDRY_EVENT_TYPES.FULFILLMENT
]);

const MAX_SOURCE_LENGTH = 240;
const MAX_JSON_DEPTH = 8;

export const toTrimmed = (value, max = 200) => String(value ?? '').trim().slice(0, max);

const cloneSafe = (value, depth = 0) => {
  if (depth > MAX_JSON_DEPTH) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.slice(0, 1000).map((entry) => cloneSafe(entry, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 200).map(([key, entry]) => [toTrimmed(key, 120), cloneSafe(entry, depth + 1)]));
  }
  return null;
};

export const sanitizeCatalog = (data = {}) => ({
  companyId: toTrimmed(data.companyId, 160),
  catalogVersion: toTrimmed(data.catalogVersion, 120),
  publishedAt: toTrimmed(data.publishedAt || data.published_at, 80) || null,
  entries: Array.isArray(data.entries) ? data.entries.slice(0, 5000).map((entry) => ({
    id: toTrimmed(entry?.id || entry?.variantId, 160),
    type: entry?.type === 'product' ? 'product' : 'service',
    name: toTrimmed(entry?.name, 200),
    description: toTrimmed(entry?.description, 1000) || null,
    pricingMode: toTrimmed(entry?.pricingMode || entry?.pricing_mode, 40) || null,
    unitAmountCentavos: Number.isInteger(entry?.unitAmountCentavos) ? entry.unitAmountCentavos : null,
    averageDurationMinutes: Number.isInteger(entry?.averageDurationMinutes) ? entry.averageDurationMinutes : null,
    media: Array.isArray(entry?.media) ? entry.media.slice(0, 5).map((media) => ({
      url: toTrimmed(media?.url, 1000),
      displayOrder: Number.isInteger(media?.displayOrder) ? media.displayOrder : 0,
      isPrimary: media?.isPrimary === true
    })) : []
  })) : [],
  branches: Array.isArray(data.branches) ? data.branches.slice(0, 500).map((branch) => ({
    locationId: toTrimmed(branch?.locationId, 160),
    online: branch?.online === true,
    status: toTrimmed(branch?.status, 40) || 'unavailable'
  })) : []
});

export const sanitizeAvailability = (data = {}) => ({
  companyId: toTrimmed(data.companyId, 160),
  locationId: toTrimmed(data.locationId, 160),
  availabilityVersion: toTrimmed(data.availabilityVersion, 120),
  timezone: toTrimmed(data.timezone, 80) || 'UTC',
  online: data.online === true,
  readiness: data.readiness && typeof data.readiness === 'object' ? {
    catalog: data.readiness.catalog === true,
    sell: data.readiness.sell === true,
    team: data.readiness.team === true,
    storefront: data.readiness.storefront === true
  } : null,
  fulfillmentModes: Array.isArray(data.fulfillmentModes) ? data.fulfillmentModes.filter((mode) => ['pickup', 'delivery'].includes(mode)).slice(0, 4) : [],
  hours: Array.isArray(data.hours) ? cloneSafe(data.hours) : []
});

export const sanitizeOrderProjection = (data = {}) => ({
  companyId: toTrimmed(data.companyId, 160),
  locationId: toTrimmed(data.locationId, 160),
  externalOrderReference: toTrimmed(data.externalOrderReference, 200),
  externalTrackingReference: toTrimmed(data.externalTrackingReference, 200),
  externalOrderGroupReference: toTrimmed(data.group?.externalOrderGroupReference || data.externalOrderGroupReference, 200) || null,
  externalTrackingGroupReference: toTrimmed(data.group?.externalTrackingGroupReference || data.externalTrackingGroupReference, 200) || null,
  mode: ['fixed', 'per_kilo'].includes(data.orderMode || data.mode) ? (data.orderMode || data.mode) : null,
  status: toTrimmed(data.status, 60) || null,
  statusLabel: toTrimmed(data.statusLabel, 160) || null,
  occurredAt: toTrimmed(data.occurredAt, 80) || null,
  fulfillment: data.fulfillment && typeof data.fulfillment === 'object' ? {
    mode: ['pickup', 'delivery'].includes(data.fulfillment.mode) ? data.fulfillment.mode : null,
    scheduledAt: toTrimmed(data.fulfillment.scheduledAt, 80) || null,
    // Address is intentionally reduced to the customer-safe snapshot supplied by the provider.
    addressSnapshot: toTrimmed(data.fulfillment.addressSnapshot, 1000) || null
  } : null,
  services: Array.isArray(data.lines || data.services) ? (data.lines || data.services).slice(0, 100).map((line) => ({
    externalLineReference: toTrimmed(line?.externalLineReference, 200),
    serviceName: toTrimmed(line?.serviceName || line?.description, 200),
    quantity: Number.isInteger(line?.quantity) ? line.quantity : 0,
    measurementGrams: Number.isInteger(line?.measurementGrams) ? line.measurementGrams : null,
    status: toTrimmed(line?.status, 60) || null,
    statusLabel: toTrimmed(line?.statusLabel, 160) || null
  })) : [],
  customerActivity: data.customerActivity && typeof data.customerActivity === 'object' ? {
    reference: toTrimmed(data.customerActivity.reference, 200) || null,
    kind: ['dgfy_account', 'dgfy_guest'].includes(data.customerActivity.kind) ? data.customerActivity.kind : null
  } : null,
  notification: data.notification && typeof data.notification === 'object' ? {
    title: toTrimmed(data.notification.title, 160) || null,
    message: toTrimmed(data.notification.message, 500) || null
  } : null
});

export const sanitizeCustomerActivity = (data = {}) => ({
  companyId: toTrimmed(data.companyId, 160),
  locationId: toTrimmed(data.locationId, 160),
  activityReference: toTrimmed(data.activityReference || data.localOrderId || data.externalOrderReference, 200),
  activityKind: toTrimmed(data.activityKind || data.kind, 60) || 'guest_activity',
  trackingReference: toTrimmed(data.externalTrackingReference || data.trackingReference, 200) || null,
  summary: toTrimmed(data.summary || data.customerSafeSummary, 500) || null,
  occurredAt: toTrimmed(data.occurredAt, 80) || null,
  customerReference: data.customerReference && typeof data.customerReference === 'object' ? {
    kind: ['dgfy_account', 'dgfy_guest'].includes(data.customerReference.kind) ? data.customerReference.kind : null,
    reference: toTrimmed(data.customerReference.reference, 200) || null
  } : null
});

export const validateEventEnvelope = (event) => {
  if (!event || typeof event !== 'object') throw new Error('DGLAUNDRY_EVENT_INVALID');
  const specversion = toTrimmed(event.specversion, 20);
  const id = toTrimmed(event.id, 200);
  const type = toTrimmed(event.type, 200);
  const source = toTrimmed(event.source, MAX_SOURCE_LENGTH);
  if (specversion !== '1.0' || !id || !type || !source || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) {
    throw new Error('DGLAUNDRY_EVENT_ENVELOPE_INVALID');
  }
  if (!DGLAUNDRY_EVENT_TYPE_SET.has(type)) throw new Error('DGLAUNDRY_EVENT_TYPE_UNSUPPORTED');
  const aggregateVersion = Number(event.aggregateversion ?? event.aggregateVersion ?? event.data.aggregateVersion ?? event.data.catalogVersion ?? event.data.availabilityVersion);
  if (ORDER_EVENT_TYPES.has(type) && (!Number.isInteger(aggregateVersion) || aggregateVersion < 1)) throw new Error('DGLAUNDRY_EVENT_VERSION_INVALID');
  return { ...event, specversion, id, type, source, aggregateVersion: Number.isInteger(aggregateVersion) ? aggregateVersion : null };
};

export const createDgfyOrderEvent = ({ type, data, source = process.env.DGFY_EVENT_SOURCE || 'https://api.dgfy.ph', id = crypto.randomUUID() }) => ({
  specversion: '1.0',
  id,
  type,
  source: toTrimmed(source, MAX_SOURCE_LENGTH),
  time: new Date().toISOString(),
  data: cloneSafe(data)
});

export const requestHash = (payload) => crypto.createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex');
