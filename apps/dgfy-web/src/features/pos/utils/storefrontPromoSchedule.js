const PROMO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PROMO_TIME_24_HOUR_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const hasValue = (value) => String(value || '').trim().length > 0;

export const getStorefrontPromoScheduleValidationError = (promo = {}) => {
  const validFrom = String(promo.valid_from || '').trim();
  const validUntil = String(promo.valid_until || '').trim();
  const startTime = String(promo.valid_time_start || '').trim();
  const endTime = String(promo.valid_time_end || '').trim();

  if (hasValue(validFrom) && !PROMO_DATE_PATTERN.test(validFrom)) return 'Promo From date must use YYYY-MM-DD format.';
  if (hasValue(validUntil) && !PROMO_DATE_PATTERN.test(validUntil)) return 'Promo To date must use YYYY-MM-DD format.';
  if (hasValue(startTime) && !PROMO_TIME_24_HOUR_PATTERN.test(startTime)) return 'Promo start time must use the 24-hour HH:mm format, for example 14:30.';
  if (hasValue(endTime) && !PROMO_TIME_24_HOUR_PATTERN.test(endTime)) return 'Promo end time must use the 24-hour HH:mm format, for example 14:30.';
  if (hasValue(validFrom) !== hasValue(validUntil)) return 'Promo validity range requires both From and To dates.';
  if (hasValue(startTime) !== hasValue(endTime)) return 'Promo valid time range requires both start and end times.';
  if (validFrom && validUntil && validFrom > validUntil) return 'Promo From date must be on or before the To date.';
  if (validFrom && validUntil && validFrom === validUntil && startTime && endTime && startTime > endTime) {
    return 'Promo From time must be earlier than the To time on the same date.';
  }

  return '';
};
