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
  const rawTyped = String(customerAddress || '');
  const typed = rawTyped.trim();
  if (!typed || isGeneratedPinnedDeliveryAddress(typed)) return false;
  // Preserve whitespace while the customer is editing. The resolved checkout payload trims
  // the final value, but the controlled input must not fall back to the map-generated address
  // when the customer has only entered a trailing space or is deleting the last character.
  return rawTyped !== String(comparedTo || '');
}

/**
 * The delivery-address field's value. The customer's own text is shown verbatim; the display
 * address only fills an empty field (or replaces the generated "Pinned map location (...)"
 * wording). The display address is derived from that same text but trimmed, so feeding it back
 * whenever the two matched after trimming swallowed every trailing space as it was typed
 * ("Jaro Plaza" became "JaroPlaza").
 */
export function resolveDeliveryAddressInputValue(customerAddress = '', displayAddress = '') {
  const typed = String(customerAddress || '');
  if (typed.trim() && !isGeneratedPinnedDeliveryAddress(typed)) return typed;
  return String(displayAddress || '');
}

/**
 * #759: an emptied field would otherwise fall straight back to the pin's looked-up address
 * (resolveDeliveryAddressInputValue -> display address) and refill itself, so emptying it also
 * runs the checkout's own location reset -- the same one "Add New Location" uses -- dropping the
 * pin, its address and any selected saved address. The customer then searches or pins again.
 */
export function applyDeliveryAddressFieldChange(nextValue, { setCustomerAddress, clearDeliveryLocation } = {}) {
  setCustomerAddress?.(nextValue);
  if (!String(nextValue || '').trim()) clearDeliveryLocation?.();
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

/** #759: the map pin for a chosen address-search suggestion, carrying its address line. */
export function buildSearchSelectedPin(result) {
  return {
    latitude: Number(Number(result.latitude).toFixed(6)),
    longitude: Number(Number(result.longitude).toFixed(6)),
    address_line: result.addressLine
  };
}

/**
 * #759: rank address-search suggestions near the fulfilling branch (most deliveries are local),
 * falling back to the customer's current pin when the branch has no coordinates.
 */
export function resolveAddressSearchBias(fulfillmentLocation, customerPin) {
  return normalizeCoordinatePair(fulfillmentLocation || {}) || normalizeCoordinatePair(customerPin || {});
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
