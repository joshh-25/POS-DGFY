import {
  getServicesLocalFlowDefinition,
  SERVICES_LOCAL_SIMULATION_ENABLED
} from '../../booking/model/servicesLocalFlow.js';

const STORAGE_KEY = 'dgfy_services_local_simulations_v1';

const PROFILE_STEPS = Object.freeze({
  item_pickup_return: Object.freeze([
    { id: 'requested', label: 'Request received' },
    { id: 'for_pickup', label: 'Scheduled for pickup' },
    { id: 'pickup_completed', label: 'Item picked up' },
    { id: 'in_service', label: 'Service in progress' },
    { id: 'out_for_return', label: 'Out for return' },
    { id: 'completed', label: 'Completed' }
  ]),
  item_pickup_collection: Object.freeze([
    { id: 'requested', label: 'Request received' },
    { id: 'for_pickup', label: 'Scheduled for pickup' },
    { id: 'pickup_completed', label: 'Item picked up' },
    { id: 'in_service', label: 'Service in progress' },
    { id: 'ready_for_collection', label: 'Ready for collection' },
    { id: 'completed', label: 'Collected' }
  ]),
  item_dropoff_collection: Object.freeze([
    { id: 'requested', label: 'Request received' },
    { id: 'for_dropoff', label: 'Ready for drop-off' },
    { id: 'dropoff_completed', label: 'Drop-off received' },
    { id: 'in_service', label: 'Service in progress' },
    { id: 'ready_for_collection', label: 'Ready for collection' },
    { id: 'collected', label: 'Collected' },
    { id: 'completed', label: 'Completed' }
  ]),
  quote_request: Object.freeze([
    { id: 'requested', label: 'Quote request received' },
    { id: 'quoted', label: 'Quote prepared' },
    { id: 'accepted', label: 'Quote accepted' },
    { id: 'completed', label: 'Request completed' }
  ]),
  service_at_customer_address: Object.freeze([
    { id: 'requested', label: 'Request received' },
    { id: 'confirmed', label: 'Booking confirmed' },
    { id: 'checked_in', label: 'Ready for your service visit' },
    { id: 'in_service', label: 'Service in progress' },
    { id: 'completed', label: 'Service completed' }
  ]),
  appointment_at_business: Object.freeze([
    { id: 'requested', label: 'Request received' },
    { id: 'confirmed', label: 'Appointment confirmed' },
    { id: 'checked_in', label: 'Ready for your appointment' },
    { id: 'in_service', label: 'Service in progress' },
    { id: 'completed', label: 'Appointment completed' }
  ]),
  online_service: Object.freeze([
    { id: 'requested', label: 'Request received' },
    { id: 'confirmed', label: 'Appointment confirmed' },
    { id: 'checked_in', label: 'Ready for your online appointment' },
    { id: 'in_service', label: 'Session in progress' },
    { id: 'completed', label: 'Appointment completed' }
  ])
});

const normalizeStoreSlug = (value = '') => String(value || '').trim().toLowerCase();
const normalizeReference = (value = '') => String(value || '').trim().toUpperCase();

const readAll = () => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === 'object') : [];
  } catch {
    return [];
  }
};

const writeAll = (entries) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-30)));
  } catch {
    // Browser-only preview storage is best-effort.
  }
};

const getSteps = (profileKey = '') => PROFILE_STEPS[profileKey] || PROFILE_STEPS.item_pickup_return;

const createLocalReference = () => {
  const suffix = typeof window !== 'undefined' && window.crypto?.randomUUID
    ? window.crypto.randomUUID().replace(/-/g, '').slice(0, 8)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `SV-LOCAL-${suffix.toUpperCase()}`;
};

const normalizeLine = (line = {}) => ({
  amount: Number(line.price ?? line.amount ?? 0) || 0,
  image_url: String(line.image_url || line.thumbnail_url || '').trim(),
  image_variants: line.image_variants && typeof line.image_variants === 'object' ? line.image_variants : null,
  item_id: Number(line.item_id) || null,
  name: String(line.variantName || line.name || 'Service request').trim(),
  qty: Math.max(1, Number(line.quantity || line.qty || 1)),
  service_category: String(line.service_detail?.service_category || line.category || '').trim()
});

export const getServicesLocalSimulationSteps = (profileKey = '') => getSteps(profileKey);

export const readServicesLocalSimulation = (storeSlug = '', reference = '') => {
  if (!SERVICES_LOCAL_SIMULATION_ENABLED) return null;
  const normalizedSlug = normalizeStoreSlug(storeSlug);
  const normalizedReference = normalizeReference(reference);
  if (!normalizedSlug || !normalizedReference) return null;
  return readAll().find((entry) => (
    normalizeStoreSlug(entry.store_slug) === normalizedSlug
      && normalizeReference(entry.tracking_pin || entry.public_reference) === normalizedReference
  )) || null;
};

export const createServicesLocalSimulation = ({
  customerAddress = '',
  customerEmail = '',
  customerName = '',
  customerPhone = '',
  fallbackAmount = null,
  routeSlug = '',
  selectedLocation = null,
  selectedStore = null,
  serviceAppointmentAt = null,
  serviceCartLines = [],
  serviceBookingLine = null,
  serviceOrderMethod = 'delivery'
} = {}) => {
  const flow = getServicesLocalFlowDefinition(serviceOrderMethod);
  const lines = (serviceCartLines.length > 0 ? serviceCartLines : [serviceBookingLine].filter(Boolean)).map(normalizeLine);
  const firstLine = lines[0] || normalizeLine();
  const reference = createLocalReference();
  const now = new Date().toISOString();
  const amount = flow.profileKey === 'quote_request'
    ? null
    : (Number(fallbackAmount) || lines.reduce((total, line) => total + (line.amount * line.qty), 0));
  const storeSlug = normalizeStoreSlug(selectedStore?.slug || routeSlug);
  const locationName = String(selectedLocation?.name || selectedStore?.name || selectedStore?.tenant_name || '').trim();
  const locationAddress = String(selectedLocation?.full_address || selectedLocation?.address_line || selectedStore?.address || '').trim();
  const booking = {
    created_at: now,
    customer_email: String(customerEmail || '').trim(),
    customer_name: String(customerName || '').trim(),
    customer_phone: String(customerPhone || '').trim(),
    location: { address_line: locationAddress, name: locationName },
    notes: String(customerAddress || '').trim() ? `Service address: ${String(customerAddress).trim()}` : '',
    public_reference: reference,
    quantity: firstLine.qty,
    service_item_id: firstLine.item_id,
    service_category: firstLine.service_category,
    service_name: firstLine.name,
    start_at: serviceAppointmentAt || null,
    status: 'requested',
    total_amount: amount,
    updated_at: now
  };
  const record = {
    booking,
    created_at: now,
    items: lines.map((line) => ({
      amount: line.amount * line.qty,
      image_url: line.image_url,
      image_variants: line.image_variants,
      item_id: line.item_id,
      name: line.name,
      qty: line.qty,
      unit_of_measure: line.service_category
    })),
    local_simulation: true,
    profile_key: flow.profileKey,
    service_name: firstLine.name,
    status: 'requested',
    status_index: 0,
    store_slug: storeSlug,
    total_amount: amount,
    tracking_pin: reference,
    updated_at: now
  };
  writeAll([...readAll(), record]);
  return record;
};

export const advanceServicesLocalSimulation = (storeSlug = '', reference = '') => {
  const current = readServicesLocalSimulation(storeSlug, reference);
  if (!current) return null;
  const steps = getSteps(current.profile_key);
  const nextIndex = Math.min(Math.max(0, Number(current.status_index || 0) + 1), steps.length - 1);
  const nextStatus = steps[nextIndex]?.id || 'completed';
  const now = new Date().toISOString();
  const updated = {
    ...current,
    booking: { ...current.booking, status: nextStatus, updated_at: now },
    status: nextStatus,
    status_index: nextIndex,
    updated_at: now
  };
  writeAll(readAll().map((entry) => (
    normalizeReference(entry.tracking_pin || entry.public_reference) === normalizeReference(reference)
      && normalizeStoreSlug(entry.store_slug) === normalizeStoreSlug(storeSlug)
      ? updated
      : entry
  )));
  return updated;
};
