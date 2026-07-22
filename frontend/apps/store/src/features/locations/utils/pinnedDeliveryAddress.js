export function buildPinnedDeliveryAddress(pin) {
  const latitude = Number(pin?.latitude);
  const longitude = Number(pin?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `Pinned map location (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`;
}

export function isGeneratedPinnedDeliveryAddress(value = '') {
  return /^Pinned map location\s*\(/i.test(String(value || '').trim());
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
