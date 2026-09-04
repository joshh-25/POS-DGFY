export function buildPinnedDeliveryAddress(pin) {
  const latitude = Number(pin?.latitude);
  const longitude = Number(pin?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `Pinned map location (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`;
}

export function isGeneratedPinnedDeliveryAddress(value = '') {
  return /^Pinned map location\s*\(/i.test(String(value || '').trim());
}

/**
 * #1219: an explicit customer edit outranks anything the map produced.
 * `customerAddress` wins when it is non-empty AND is not itself the
 * auto-generated "Pinned map location (lat, lng)" fallback -- otherwise the
 * reverse-geocoded value, then the raw pin coordinates, then ''.
 * Before this existed the chain was `resolved || customer || pin`, which
 * discarded every edit made after a pin was geocoded.
 */
export function resolveDeliveryAddress({
  customerAddress = '',
  resolvedDeliveryAddress = '',
  customerPin = null
} = {}) {
  const typed = String(customerAddress || '').trim();
  if (typed && !isGeneratedPinnedDeliveryAddress(typed)) return typed;
  const geocoded = String(resolvedDeliveryAddress || '').trim();
  if (geocoded) return geocoded;
  return buildPinnedDeliveryAddress(customerPin) || '';
}

export function hasExplicitDeliveryAddressEdit(customerAddress = '', comparedTo = '') {
  const typed = String(customerAddress || '').trim();
  if (!typed || isGeneratedPinnedDeliveryAddress(typed)) return false;
  return typed !== String(comparedTo || '').trim();
}

export function normalizeCoordinatePair({ latitude, longitude } = {}) {
  if (latitude == null || longitude == null || latitude === '' || longitude === '') return null;
  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);
  if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) return null;
  return { latitude: parsedLatitude, longitude: parsedLongitude };
}

export function extractSavedLocationLabel(address = '') {
  const normalized = String(address || '').trim();
  if (!normalized) return 'Saved location';
  const segments = normalized.split(',').map((segment) => segment.trim()).filter(Boolean);
  return segments.slice(0, 2).join(', ') || normalized;
}

export function formatReverseGeocodedAddress(payload = {}) {
  const address = payload?.address || {};
  const localParts = [
    address.house_number && address.road ? `${address.house_number} ${address.road}` : '',
    address.road && !address.house_number ? address.road : '',
    address.neighbourhood,
    address.suburb,
    address.city_district,
    address.city || address.town || address.village || address.municipality,
    address.state
  ].filter(Boolean);
  if (localParts.length > 0) {
    return localParts.join(', ');
  }
  const displayName = String(payload?.display_name || '').trim();
  if (!displayName) return '';
  const segments = displayName.split(',').map((segment) => segment.trim()).filter(Boolean);
  return segments.slice(0, 5).join(', ');
}

export async function reverseGeocodeDeliveryPin(pin, { signal } = {}) {
  const normalized = normalizeCoordinatePair(pin);
  if (!normalized) return '';
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(normalized.latitude)}&lon=${encodeURIComponent(normalized.longitude)}`,
    { signal, headers: { Accept: 'application/json' } }
  );
  if (!response.ok) return buildPinnedDeliveryAddress(normalized);
  return formatReverseGeocodedAddress(await response.json()) || buildPinnedDeliveryAddress(normalized);
}
