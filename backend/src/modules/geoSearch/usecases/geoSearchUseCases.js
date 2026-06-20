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

const LOCAL_REVERSE_GEOCODE_PLACES = [
    {
        name: 'Iloilo City',
        region: 'Iloilo',
        country: 'Philippines',
        latitude: 10.7202,
        longitude: 122.5621,
        radiusKm: 35
    },
    {
        name: 'Manila',
        region: 'Metro Manila',
        country: 'Philippines',
        latitude: 14.5995,
        longitude: 120.9842,
        radiusKm: 35
    }
];

const toRadians = (value) => value * Math.PI / 180;

const distanceKm = (first, second) => {
    const earthRadiusKm = 6371;
    const dLat = toRadians(second.latitude - first.latitude);
    const dLon = toRadians(second.longitude - first.longitude);
    const lat1 = toRadians(first.latitude);
    const lat2 = toRadians(second.latitude);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const resolveLocalAddressLine = ({ latitude, longitude }) => {
    const position = { latitude, longitude };
    const nearest = LOCAL_REVERSE_GEOCODE_PLACES
        .map((place) => ({ ...place, distance_km: distanceKm(position, place) }))
        .sort((a, b) => a.distance_km - b.distance_km)[0];

    if (!nearest) return `Pinned location (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`;

    const prefix = nearest.distance_km <= nearest.radiusKm
        ? nearest.name
        : `Near ${nearest.name}`;
    return [prefix, nearest.region, nearest.country]
        .filter(Boolean)
        .join(', ');
};

export const buildReverseGeocodeUseCase = () => {
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
        return ok({
            address_line: resolveLocalAddressLine({ latitude: lat, longitude: lon }),
            provider: 'dgfy-local',
            latitude: lat,
            longitude: lon
        });
    };
};
