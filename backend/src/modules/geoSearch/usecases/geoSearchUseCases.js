import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const buildGeoSearchUseCase = ({ geoSearchRepository }) => {
    return async ({ query, latitude, longitude, radius, stockFilter, page, limit }) => {
        try {
            const result = await geoSearchRepository.searchNearbyStores({
                query,
                latitude,
                longitude,
                radius,
                stockFilter,
                page,
                limit
            });
            return ok(result);
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error?.message || 'Geo search failed',
                { statusCode: 500 }
            ));
        }
    };
};

const formatReverseGeocodedAddress = (payload = {}) => {
    const address = payload?.address || {};
    const parts = [
        address.road || address.pedestrian || address.footway || address.neighbourhood || address.suburb,
        address.village || address.town || address.city || address.municipality,
        address.state || address.province || address.region,
        address.postcode
    ].map((part) => String(part || '').trim()).filter(Boolean);

    const formatted = parts.length > 0
        ? parts.join(', ')
        : String(payload?.display_name || '').trim();

    return formatted || null;
};

export const buildReverseGeocodeUseCase = ({ fetchImpl = globalThis.fetch } = {}) => {
    return async ({ latitude, longitude }) => {
        const lat = Number(latitude);
        const lon = Number(longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Latitude and longitude are required.',
                { statusCode: 422 }
            ));
        }
        if (typeof fetchImpl !== 'function') {
            return fail(new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'Reverse geocoding is unavailable in this runtime.',
                { statusCode: 503 }
            ));
        }

        try {
            const params = new URLSearchParams({
                lat: String(lat),
                lon: String(lon),
                format: 'jsonv2',
                addressdetails: '1'
            });
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            let response;
            try {
                response = await fetchImpl(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
                    headers: {
                        Accept: 'application/json',
                        'User-Agent': 'DGFY-SKU-Inventory-Manager/1.0 (https://dgfy.ph)'
                    },
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timeout);
            }

            if (!response?.ok) {
                return fail(new DomainError(
                    DomainErrorCode.SERVICE_UNAVAILABLE,
                    'Reverse geocoding provider did not return a usable address.',
                    { statusCode: 502 }
                ));
            }

            const providerPayload = await response.json();
            const addressLine = formatReverseGeocodedAddress(providerPayload);
            return ok({
                address_line: addressLine,
                provider: 'nominatim',
                latitude: lat,
                longitude: lon
            });
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                error?.name === 'AbortError'
                    ? 'Reverse geocoding provider timed out.'
                    : 'Reverse geocoding provider is unavailable.',
                { statusCode: error?.name === 'AbortError' ? 504 : 502 }
            ));
        }
    };
};
