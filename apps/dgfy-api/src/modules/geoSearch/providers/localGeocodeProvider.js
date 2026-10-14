import { distanceKm } from '../shared/geoDistance.js';
import {
    PH_LOCAL_ADDRESS_DATASET,
    PH_LOCAL_ADDRESS_PROVIDER,
    PH_LOCAL_ADDRESS_PROVENANCE
} from '../data/phLocalAddressDataset.js';

const PRECISION_RANK = {
    barangay: 0,
    city: 1,
    province: 2,
    coordinate_only: 3
};

const EMPTY_COMPONENTS = Object.freeze({
    housenumber: null, street: null, locality: null, district: null, city: null, state: null, postcode: null
});

const provenance = () => ({
    psgc_release: PH_LOCAL_ADDRESS_PROVENANCE.psgcRelease,
    generated_at: PH_LOCAL_ADDRESS_PROVENANCE.generatedAt
});

const coordinateFallback = ({ latitude, longitude }) => ({
    address_line: `Pinned location (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`,
    provider: PH_LOCAL_ADDRESS_PROVIDER,
    precision: 'coordinate_only',
    components: { ...EMPTY_COMPONENTS },
    landmarks: [],
    provenance: provenance()
});

export const localGeocodeProvider = {
    reverseGeocode: async ({ latitude, longitude }) => {
        const position = { latitude, longitude };

        const nearest = PH_LOCAL_ADDRESS_DATASET
            .map((place) => ({ ...place, distance_km: distanceKm(position, place) }))
            .filter((place) => place.distance_km <= place.maxDistanceKm)
            .sort((a, b) => {
                const precisionDelta = (PRECISION_RANK[a.precision] ?? 99) - (PRECISION_RANK[b.precision] ?? 99);
                if (precisionDelta !== 0) return precisionDelta;
                return a.distance_km - b.distance_km;
            })[0];

        if (!nearest) return coordinateFallback(position);

        return {
            address_line: nearest.label,
            provider: PH_LOCAL_ADDRESS_PROVIDER,
            precision: nearest.precision,
            distance_meters: Math.round(nearest.distance_km * 1000),
            psgc_code: nearest.psgcCode,
            parent_psgc_code: nearest.parentPsgcCode,
            components: { ...EMPTY_COMPONENTS },
            // The bundled dataset carries administrative centroids only, never POIs.
            landmarks: [],
            provenance: provenance()
        };
    },

    searchAddresses: async ({ query, limit = 8 }) => {
        const tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
        const cap = Math.max(1, Math.min(Number(limit) || 8, 20));

        const results = PH_LOCAL_ADDRESS_DATASET
            .filter((place) => {
                const label = String(place.label || '').toLowerCase();
                return tokens.every((token) => label.includes(token));
            })
            .slice(0, cap)
            .map((place) => ({
                address_line: place.label,
                latitude: place.latitude,
                longitude: place.longitude,
                precision: place.precision,
                provider: PH_LOCAL_ADDRESS_PROVIDER,
                psgc_code: place.psgcCode,
                parent_psgc_code: place.parentPsgcCode,
                components: { ...EMPTY_COMPONENTS }
            }));

        return { results };
    }
};
