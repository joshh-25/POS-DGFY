import { normalizeServiceTrackingStatus, getServiceTrackingStatusCopyForProfile } from './serviceTrackingPresentation.js';
import { readServicesLocalSimulation } from './servicesLocalSimulation.js';
import { resolveFulfillmentProfilesForServiceAreaType } from '@sieitzz/shared-constants/fulfillmentProfiles';

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const quantityOrOne = (value) => Math.max(1, numberOrNull(value) ?? 1);

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

const normalizeServiceItem = (item, { index, reference }) => {
  const source = item && typeof item === 'object' ? item : {};
  const service = source.service && typeof source.service === 'object' ? source.service : {};
  const itemId = numberOrNull(source.item_id ?? source.service_item_id ?? service.item_id);
  const name = String(
    source.name
      || source.name_snapshot
      || source.item_name
      || source.service_name
      || service.name
      || ''
  ).trim();
  const imageVariants = source.image_variants && typeof source.image_variants === 'object'
    ? source.image_variants
    : (service.image_variants && typeof service.image_variants === 'object' ? service.image_variants : null);

  return {
    id: itemId || `${reference || 'service'}-${index}`,
    item_id: itemId,
    name,
    qty: quantityOrOne(source.qty ?? source.quantity),
    amount: numberOrNull(
      source.amount
        ?? source.line_amount
        ?? source.line_total
        ?? source.line_subtotal
        ?? source.subtotal
        ?? source.total_amount
    ),
    image_url: String(
      source.image_url
        || source.thumbnail_url
        || service.image_url
        || service.thumbnail_url
        || service.storefront_image_url
        || service.storefront_image_path
        || ''
    ).trim(),
    image_variants: imageVariants,
    unit_of_measure: String(
      source.service_category
        || source.unit_of_measure
        || source.category
        || source.service_category_name
        || service.service_category
        || ''
    ).trim()
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
    const service = booking.service && typeof booking.service === 'object' ? booking.service : {};
    const serviceAreaType = String(
      service?.service_area_type
        || booking.service_area_type
        || ''
    ).trim();
    const serviceProfileKey = String(root?.profile_key || booking.profile_key || '').trim()
      || resolveFulfillmentProfilesForServiceAreaType(serviceAreaType)[0]
      || '';
    const statusCode = normalizeServiceTrackingStatus(root?.status || booking.status);
    const statusCopy = getServiceTrackingStatusCopyForProfile(statusCode, serviceProfileKey);
    const rawItems = Array.isArray(root?.items)
      ? root.items
      : (Array.isArray(booking?.items)
        ? booking.items
        : (Array.isArray(booking?.lines) ? booking.lines : []));
    const firstItem = rawItems[0] && typeof rawItems[0] === 'object' ? rawItems[0] : {};
    const location = resolveBookingLocation(booking);
    const reference = String(booking.public_reference || booking.ticket?.reference || '').trim().toUpperCase();
    const totalAmount = numberOrNull(booking.total_amount);
    const normalizedItems = rawItems
      .filter((item) => item && typeof item === 'object')
      .map((item, index) => normalizeServiceItem(item, { index, reference }))
      .filter((item) => item.name);
    const serviceName = String(booking.service_name || service.name || normalizedItems[0]?.name || firstItem.name || '').trim();
    const serviceItemId = numberOrNull(booking.service_item_id || normalizedItems[0]?.item_id || firstItem.item_id);
    const firstNormalizedItem = normalizedItems[0] || {};
    const serviceImageUrl = String(
      firstNormalizedItem.image_url
        || firstItem.image_url
        || firstItem.thumbnail_url
        || service.image_url
        || service.thumbnail_url
        || service.storefront_image_url
        || service.storefront_image_path
        || ''
    ).trim();
    const serviceImageVariants = firstNormalizedItem.image_variants
      || (firstItem.image_variants && typeof firstItem.image_variants === 'object' ? firstItem.image_variants : null)
      || (service.image_variants && typeof service.image_variants === 'object' ? service.image_variants : null);

    const items = normalizedItems.length > 0
      ? normalizedItems
      : (serviceName ? [{
          id: serviceItemId || reference,
          item_id: serviceItemId,
          name: serviceName,
          qty: quantityOrOne(booking.quantity || firstItem.qty),
          amount: totalAmount ?? numberOrNull(firstItem.amount),
          image_url: serviceImageUrl,
          image_variants: serviceImageVariants,
          unit_of_measure: String(booking.service_category || firstItem.unit_of_measure || '').trim()
        }] : []);

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
      serviceCategory: String(booking.service_category || firstNormalizedItem.unit_of_measure || '').trim(),
      serviceItemId,
      serviceAreaType: String(service.service_area_type || booking.service_area_type || '').trim(),
      appointmentStartAt: String(booking.start_at || '').trim() || null,
      appointmentEndAt: String(booking.end_at || '').trim() || null,
      durationMinutes: numberOrNull(booking.duration_minutes || service.duration_minutes),
      paymentTiming: String(booking.payment_timing || '').trim(),
      paymentStatus: String(booking.payment_status || '').trim(),
      notes: String(booking.notes || '').trim(),
      booking,
      items,
      rawRoot: root,
      localSimulation: root?.local_simulation === true,
      serviceProfileKey
    };
  }
});
