import logger from '../../../config/logger.js';
import { geocodeConfig } from '../../../config/geocodeConfig.js';
import {
    mapForwardSearchResponse,
    mapReverseGeocodeResponse
} from '../mappers/photonFeatureMapper.js';

// An unknown parameter makes the service return HTTP 400, so parameter NAMES are fixed here
// and user input is only ever a parameter VALUE.
export const FORWARD_PARAM_ALLOWLIST = ['q', 'limit', 'lang', 'bbox', 'lat', 'lon'];
export const REVERSE_PARAM_ALLOWLIST = ['lat', 'lon', 'radius', 'limit', 'lang', 'distance_sort'];

const MAX_FORWARD_LIMIT = 20;
const REVERSE_RADIUS_KM = 0.4;
const REVERSE_LIMIT = 15;

const buildQuery = (allowlist, values) => {
    const params = new URLSearchParams();
    allowlist.forEach((name) => {
        const value = values[name];
        if (value === undefined || value === null || value === '') return;
        params.set(name, String(value));
    });
    return params.toString();
};

/** Returns `null` for every transport failure; the caller converts that to the `undefined` sentinel. */
const fetchJson = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), geocodeConfig.timeoutMs);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal
        });

        if (!response.ok) {
            logger.warn('[Geocode] Quadruper returned a non-success status', { status: response.status });
            return null;
        }

        return await response.json();
    } catch (error) {
        logger.warn('[Geocode] Quadruper request failed', { err: error?.message, name: error?.name });
        return null;
    } finally {
        clearTimeout(timer);
    }
};

const hasBias = (latitude, longitude) => Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));

/**
 * Returns `undefined` on a transport failure, `null` on a genuine miss (HTTP 200, no match),
 * and a mapped object on a hit. The use case's circuit breaker counts only `undefined` as a
 * failure — otherwise a run of unmatched searches would look identical to an outage.
 */
export const quadruperGeocodeProvider = {
    reverseGeocode: async ({ latitude, longitude }) => {
        const query = buildQuery(REVERSE_PARAM_ALLOWLIST, {
            lat: latitude,
            lon: longitude,
            radius: REVERSE_RADIUS_KM,
            limit: REVERSE_LIMIT,
            lang: 'en',
            distance_sort: 'true'
        });

        const payload = await fetchJson(`${geocodeConfig.baseUrl}/reverse?${query}`);
        if (payload === null || payload === undefined) return undefined;

        // May still be null: HTTP 200 with an empty feature list is a miss, not a failure.
        return mapReverseGeocodeResponse(payload, { latitude, longitude });
    },

    searchAddresses: async ({ query, limit, biasLatitude, biasLongitude }) => {
        const biased = hasBias(biasLatitude, biasLongitude);
        const search = buildQuery(FORWARD_PARAM_ALLOWLIST, {
            q: query,
            limit: Math.min(Number(limit) || 8, MAX_FORWARD_LIMIT),
            lang: 'en',
            bbox: geocodeConfig.phBbox,
            lat: biased ? biasLatitude : undefined,
            lon: biased ? biasLongitude : undefined
        });

        const payload = await fetchJson(`${geocodeConfig.baseUrl}/api?${search}`);
        if (payload === null || payload === undefined) return undefined;

        const results = mapForwardSearchResponse(payload);
        return results.length > 0 ? { results } : null;
    },

    getStatus: async () => fetchJson(`${geocodeConfig.baseUrl}/status`)
};

export const __testing = { buildQuery };
