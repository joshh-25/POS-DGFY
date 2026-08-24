const ACTIVE_BOOKING_STATUSES = new Set([
  'requested',
  'pending',
  'confirmed',
  'scheduled',
  'checked_in',
  'in_service',
  'in_progress'
]);

const PAST_BOOKING_STATUSES = new Set(['completed', 'cancelled', 'no_show', 'expired']);

const normalizeBookingStatus = (value) => String(value || '').trim().toLowerCase();

export const getCustomerBookingBucket = (booking = {}) => {
  const status = normalizeBookingStatus(booking.status);
  if (ACTIVE_BOOKING_STATUSES.has(status)) return 'active';
  if (PAST_BOOKING_STATUSES.has(status)) return 'past';

  const bookingDate = Date.parse(booking.start_at || booking.occurred_at || '');
  return Number.isFinite(bookingDate) && bookingDate < Date.now() ? 'past' : 'active';
};

export const isCustomerBookingReview = (review = {}) => {
  const targetType = String(review.target_type || '').trim().toLowerCase();
  return Boolean(
    review.booking_id
    || review.booking_reference
    || review.service_booking_id
    || review.activity_type === 'service_booking'
    || targetType.includes('booking')
  );
};
