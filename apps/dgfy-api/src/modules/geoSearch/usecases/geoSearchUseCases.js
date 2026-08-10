import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
    PH_LOCAL_ADDRESS_DATASET,
    PH_LOCAL_ADDRESS_PROVIDER,
    PH_LOCAL_ADDRESS_PROVENANCE
} from '../data/phLocalAddressDataset.js';

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

const coordinateFallback = ({ latitude, longitude }) => ({
    address_line: `Pinned location (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`,
    provider: PH_LOCAL_ADDRESS_PROVIDER,
    precision: 'coordinate_only',
    provenance: {
        psgc_release: PH_LOCAL_ADDRESS_PROVENANCE.psgcRelease,
        generated_at: PH_LOCAL_ADDRESS_PROVENANCE.generatedAt
    }
});

const precisionRank = {
    barangay: 0,
    city: 1,
    province: 2,
    coordinate_only: 3
};

const resolveLocalAddress = ({ latitude, longitude }) => {
    const position = { latitude, longitude };
    const candidates = PH_LOCAL_ADDRESS_DATASET
        .map((place) => ({ ...place, distance_km: distanceKm(position, place) }))
        .filter((place) => place.distance_km <= place.maxDistanceKm)
        .sort((a, b) => {
            const precisionDelta = (precisionRank[a.precision] ?? 99) - (precisionRank[b.precision] ?? 99);
            if (precisionDelta !== 0) return precisionDelta;
            return a.distance_km - b.distance_km;
        });
    const nearest = candidates[0];

    if (!nearest) {
        return coordinateFallback({ latitude, longitude });
    }

    return {
        address_line: nearest.label,
        provider: PH_LOCAL_ADDRESS_PROVIDER,
        precision: nearest.precision,
        distance_meters: Math.round(nearest.distance_km * 1000),
        psgc_code: nearest.psgcCode,
        parent_psgc_code: nearest.parentPsgcCode,
        provenance: {
            psgc_release: PH_LOCAL_ADDRESS_PROVENANCE.psgcRelease,
            generated_at: PH_LOCAL_ADDRESS_PROVENANCE.generatedAt
        }
    };
};

export const buildAddressSearchUseCase = () => {
    return async ({ query, limit = 8 }) => {
        const normalizedQuery = String(query || '').trim().toLowerCase();
        if (normalizedQuery.length < 2) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Enter at least 2 characters to search for an address.',
                { statusCode: 422 }
            ));
        }

        const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
        const matches = PH_LOCAL_ADDRESS_DATASET
            .filter((place) => {
                const searchableLabel = String(place.label || '').toLowerCase();
                return tokens.every((token) => searchableLabel.includes(token));
            })
            .slice(0, Math.max(1, Math.min(Number(limit) || 8, 20)))
            .map((place) => ({
                address_line: place.label,
                latitude: place.latitude,
                longitude: place.longitude,
                precision: place.precision,
                provider: PH_LOCAL_ADDRESS_PROVIDER,
                psgc_code: place.psgcCode,
                parent_psgc_code: place.parentPsgcCode
            }));

        return ok({ results: matches });
    };
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
            ...resolveLocalAddress({ latitude: lat, longitude: lon }),
            latitude: lat,
            longitude: lon
        });
    };
};
