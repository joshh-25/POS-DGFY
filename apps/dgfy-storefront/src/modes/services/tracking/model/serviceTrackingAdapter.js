import { normalizeServiceTrackingStatus, getServiceTrackingStatusCopyForProfile } from './serviceTrackingPresentation.js';
import { readServicesLocalSimulation } from './servicesLocalSimulation.js';

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const unwrapServiceBookingPayload = (raw) => {
  const root = raw?.data && typeof raw.data === 'object' ? raw.data : (raw || {});
  const booking = root?.booking && typeof root.booking === 'object'
    ? root.booking
    : (raw?.booking && typeof raw.booking === 'object' ? raw.booking : {});
  return { root, booking };
};

const resolveBookingLocation = (booking) => {
  const location = booking?.location && typeof booking.location === 'object' ? booking.location : {};
  return {
    name: String(location.name || location.label || '').trim(),
    address: String(location.full_address || location.address_line || location.address || '').trim()
  };
};

export const serviceTrackingAdapter = Object.freeze({
  mode: 'services',
  canHandle: (input) => Boolean(
    String(input?.mode || '') === 'services'
    && String(input?.rawReference || '').trim()
    && String(input?.storeSlug || '').trim()
  ),
  fetch: async (input, { requestJson }) => {
    const reference = String(input?.rawReference || '').trim().toUpperCase();
    const localSimulation = readServicesLocalSimulation(input?.storeSlug, reference);
    if (localSimulation) return localSimulation;
    return requestJson(`/api/v1/store/services/bookings/${encodeURIComponent(reference)}`, {
      storeSlug: input.storeSlug
    });
  },
  normalize: (raw) => {
    const { root, booking } = unwrapServiceBookingPayload(raw);
    const serviceProfileKey = String(root?.profile_key || booking.profile_key || '').trim();
    const statusCode = normalizeServiceTrackingStatus(root?.status || booking.status);
    const statusCopy = getServiceTrackingStatusCopyForProfile(statusCode, serviceProfileKey);
    const service = booking.service && typeof booking.service === 'object' ? booking.service : {};
    const firstItem = Array.isArray(root?.items) && root.items[0] && typeof root.items[0] === 'object'
      ? root.items[0]
      : {};
    const location = resolveBookingLocation(booking);
    const reference = String(booking.public_reference || booking.ticket?.reference || '').trim().toUpperCase();
    const serviceName = String(booking.service_name || service.name || firstItem.name || '').trim();
    const totalAmount = numberOrNull(booking.total_amount);
    const serviceItemId = numberOrNull(booking.service_item_id || firstItem.item_id);
    const serviceImageUrl = String(
      firstItem.image_url
        || firstItem.thumbnail_url
        || service.image_url
        || service.thumbnail_url
        || service.storefront_image_url
        || service.storefront_image_path
        || ''
    ).trim();
    const serviceImageVariants = firstItem.image_variants && typeof firstItem.image_variants === 'object'
      ? firstItem.image_variants
      : (service.image_variants && typeof service.image_variants === 'object' ? service.image_variants : null);

    return {
      reference,
      statusCode,
      statusLabel: statusCopy.label,
      statusGuidance: statusCopy.guidance,
      orderMethod: 'service',
      createdAt: String(booking.created_at || '').trim() || null,
      updatedAt: String(booking.updated_at || '').trim() || null,
      subtotalAmount: null,
      deliveryFee: null,
      discountAmount: null,
      serviceFeeAmount: null,
      totalAmount,
      branchName: location.name,
      branchAddress: location.address,
      serviceName,
      serviceCategory: String(booking.service_category || '').trim(),
      serviceItemId,
      serviceAreaType: String(service.service_area_type || booking.service_area_type || '').trim(),
      appointmentStartAt: String(booking.start_at || '').trim() || null,
      appointmentEndAt: String(booking.end_at || '').trim() || null,
      durationMinutes: numberOrNull(booking.duration_minutes || service.duration_minutes),
      paymentTiming: String(booking.payment_timing || '').trim(),
      paymentStatus: String(booking.payment_status || '').trim(),
      notes: String(booking.notes || '').trim(),
      booking,
      items: serviceName ? [{
        id: serviceItemId || reference,
        item_id: serviceItemId,
        name: serviceName,
        qty: Math.max(1, Number(booking.quantity || firstItem.qty || 1)),
        amount: totalAmount ?? numberOrNull(firstItem.amount),
        image_url: serviceImageUrl,
        image_variants: serviceImageVariants,
        unit_of_measure: String(booking.service_category || firstItem.unit_of_measure || '').trim()
      }] : [],
      rawRoot: root,
      localSimulation: root?.local_simulation === true,
      serviceProfileKey
    };
  }
});
