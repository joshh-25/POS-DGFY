import { reverseGeocodeDeliveryCoordinates } from '../../../services/geocodingService.js';

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

/**
 * #759: a pin placed by choosing an address-search suggestion carries the chosen address line,
 * so the pin's address is already known and needs no reverse-geocode round trip. Map taps, drags
 * and "Use Current Location" produce bare coordinates and return ''.
 */
export function getSearchSelectedPinAddress(pin) {
  return String(pin?.address_line || '').trim();
}

/** #506: reverse-geocodes through dgfy-api; never throws except for an aborted request. */
export async function reverseGeocodeDeliveryPin(pin, { signal } = {}) {
  const normalized = normalizeCoordinatePair(pin);
  if (!normalized) return '';
  try {
    const addressLine = await reverseGeocodeDeliveryCoordinates({ ...normalized, signal });
    return addressLine || buildPinnedDeliveryAddress(normalized);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return buildPinnedDeliveryAddress(normalized);
  }
}
