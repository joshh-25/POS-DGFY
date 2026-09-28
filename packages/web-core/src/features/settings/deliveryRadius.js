export const DEFAULT_DELIVERY_RADIUS_KM = 5;

// A zero-kilometer radius is an intentional configuration value. Only a missing or unusable
// input receives the default; truthiness checks would incorrectly turn the valid value `0` into
// the default radius before the tenant-location API can persist it.
export const normalizeDeliveryRadiusKm = (value, fallback = DEFAULT_DELIVERY_RADIUS_KM) => {
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '' || raw === null || raw === undefined) return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};
