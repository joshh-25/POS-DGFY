import { requestJson } from './requestJson.js';

/**
 * Storefront geocoding goes through dgfy-api's geoSearch module (Quadruper, with the bundled PH
 * dataset as fallback), never a third-party geocoder called from the browser (#506). The module's
 * own contract: apps/dgfy-api/src/modules/geoSearch/README.md.
 */

export const ADDRESS_SEARCH_MIN_LENGTH = 2;
const ADDRESS_SEARCH_MAX_LENGTH = 120;

// The backend's last-resort reverse-geocode answer when no place is near the pin. It carries no
// address information, so callers fall back to their own pinned-coordinate wording instead.
const COORDINATE_ONLY_PRECISION = 'coordinate_only';

const toCoordinate = (value) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeSearchResult = (result) => {
  const latitude = toCoordinate(result?.latitude);
  const longitude = toCoordinate(result?.longitude);
  const addressLine = String(result?.address_line || '').trim();
  if (latitude == null || longitude == null || !addressLine) return null;
  return {
    addressLine,
    latitude,
    longitude,
    precision: result?.precision || null,
    houseNumber: String(result?.components?.housenumber || '').trim() || null
  };
};

export const searchDeliveryAddresses = async ({ query, limit = 6, bias = null, signal } = {}) => {
  const normalizedQuery = String(query || '').trim().slice(0, ADDRESS_SEARCH_MAX_LENGTH);
  if (normalizedQuery.length < ADDRESS_SEARCH_MIN_LENGTH) return [];

  const params = new URLSearchParams({ query: normalizedQuery, limit: String(limit) });
  const biasLatitude = toCoordinate(bias?.latitude);
  const biasLongitude = toCoordinate(bias?.longitude);
  if (biasLatitude != null && biasLongitude != null) {
    params.set('lat', String(biasLatitude));
    params.set('lon', String(biasLongitude));
  }

  const data = await requestJson(`/api/v1/storefront/address-search?${params.toString()}`, { method: 'GET', signal });
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map(normalizeSearchResult).filter(Boolean);
};

/** Resolves to the address line for a pin, or '' when the backend has nothing better than coordinates. */
export const reverseGeocodeDeliveryCoordinates = async ({ latitude, longitude, signal } = {}) => {
  const lat = toCoordinate(latitude);
  const lon = toCoordinate(longitude);
  if (lat == null || lon == null) return '';

  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  const data = await requestJson(`/api/v1/storefront/reverse-geocode?${params.toString()}`, { method: 'GET', signal });
  if (data?.precision === COORDINATE_ONLY_PRECISION) return '';
  return String(data?.address_line || '').trim();
};
