import {
    QUADRUPER_PROVIDER,
    composeAddressLine,
    mapComponents,
    mapForwardSearchResponse,
    mapLandmarks,
    mapPrecision,
    mapReverseGeocodeResponse
} from '../src/modules/geoSearch/mappers/photonFeatureMapper.js';

// Recorded live from https://quadruper.com/geocode on 2026-09-17.
const OTON_STREET_PROPERTIES = {
    osm_type: 'W', osm_id: 170405621, osm_key: 'highway', osm_value: 'residential',
    type: 'street', name: 'Rizal Avenue', district: 'Abilay Norte', city: 'Oton',
    state: 'Iloilo', country: 'Philippines', postcode: '5020', countrycode: 'PH'
};

const ILOILO_RESTAURANT_PROPERTIES = {
    osm_type: 'N', osm_id: 3141074610, osm_key: 'amenity', osm_value: 'restaurant',
    type: 'house', name: "Peri Todd's Burger", street: 'Jalandoni Street',
    locality: 'Bakhaw', district: 'Jaro', city: 'Iloilo City',
    state: 'Western Visayas', country: 'Philippines', postcode: '5000', countrycode: 'PH'
};

const feature = (properties, longitude, latitude) => ({
    type: 'Feature', properties, geometry: { type: 'Point', coordinates: [longitude, latitude] }
});

describe('composeAddressLine', () => {
    it('places the barangay first when it arrives in `district` (Oton shape)', () => {
        expect(composeAddressLine(OTON_STREET_PROPERTIES))
            .toBe('Abilay Norte, Oton, Iloilo, Philippines');
    });

    it('keeps both barangay and district when both exist (Iloilo City shape)', () => {
        expect(composeAddressLine(ILOILO_RESTAURANT_PROPERTIES))
            .toBe('Bakhaw, Jaro, Iloilo City, Western Visayas, Philippines');
    });

    it('deduplicates case-insensitively repeated segments', () => {
        expect(composeAddressLine({ locality: 'Pavia', district: 'pavia', city: 'Pavia', state: 'Iloilo' }))
            .toBe('Pavia, Iloilo, Philippines');
    });

    it('survives an entirely empty property bag', () => {
        expect(composeAddressLine({})).toBe('Philippines');
        expect(composeAddressLine(null)).toBe('Philippines');
    });

    it('caps at five segments', () => {
        const label = composeAddressLine({
            locality: 'A', district: 'B', city: 'C', state: 'D'
        });
        expect(label.split(', ')).toHaveLength(5);
    });
});

describe('mapPrecision', () => {
    it('maps Photon granularity onto the DGFY vocabulary', () => {
        expect(mapPrecision({ type: 'house' })).toBe('house');
        expect(mapPrecision({ type: 'street' })).toBe('street');
        expect(mapPrecision({ type: 'locality' })).toBe('barangay');
        expect(mapPrecision({ type: 'district' })).toBe('barangay');
        expect(mapPrecision({ type: 'city' })).toBe('city');
        expect(mapPrecision({ type: 'county' })).toBe('city');
        expect(mapPrecision({ type: 'state' })).toBe('province');
        expect(mapPrecision({ type: 'country' })).toBe('province');
    });

    it('falls back to the most specific component present when type is absent or `other`', () => {
        expect(mapPrecision({ type: 'other', district: 'Jaro' })).toBe('barangay');
        expect(mapPrecision({ city: 'Oton' })).toBe('city');
        expect(mapPrecision({ state: 'Iloilo' })).toBe('province');
        expect(mapPrecision({})).toBe('coordinate_only');
    });
});

describe('mapComponents', () => {
    it('returns every address field, nulling the absent ones', () => {
        expect(mapComponents(ILOILO_RESTAURANT_PROPERTIES)).toEqual({
            street: 'Jalandoni Street', locality: 'Bakhaw', district: 'Jaro',
            city: 'Iloilo City', state: 'Western Visayas', postcode: '5000'
        });
        expect(mapComponents({})).toEqual({
            street: null, locality: null, district: null, city: null, state: null, postcode: null
        });
    });
});

describe('mapLandmarks', () => {
    const origin = { latitude: 10.7202, longitude: 122.5621 };

    it('collapses a duplicate name that arrives under two different osm_values', () => {
        const landmarks = mapLandmarks([
            feature({ name: 'SM Hypermarket', osm_key: 'shop', osm_value: 'supermarket', type: 'house' }, 122.5634, 10.7211),
            feature({ name: 'SM Hypermarket', osm_key: 'shop', osm_value: 'mall', type: 'house' }, 122.5700, 10.7300)
        ], origin);

        expect(landmarks).toHaveLength(1);
        expect(landmarks[0].osm_value).toBe('supermarket');
    });

    it('excludes street features and sorts the rest by ascending distance', () => {
        const landmarks = mapLandmarks([
            feature({ name: 'Far Pharmacy', osm_key: 'amenity', osm_value: 'pharmacy', type: 'house' }, 122.5700, 10.7280),
            feature({ name: 'Jalandoni Street', osm_key: 'highway', osm_value: 'secondary', type: 'street' }, 122.5622, 10.7203),
            feature({ name: 'Near Store', osm_key: 'shop', osm_value: 'convenience', type: 'house' }, 122.5622, 10.7203)
        ], origin);

        expect(landmarks.map((entry) => entry.name)).toEqual(['Near Store', 'Far Pharmacy']);
        expect(landmarks[0].distance_meters).toBeLessThan(landmarks[1].distance_meters);
    });

    it('caps the list at five entries', () => {
        const many = Array.from({ length: 9 }, (_, index) => feature(
            { name: `Shop ${index}`, osm_key: 'shop', osm_value: 'convenience', type: 'house' },
            122.5621 + (index + 1) * 0.001,
            10.7202
        ));
        expect(mapLandmarks(many, origin)).toHaveLength(5);
    });

    it('returns an empty array for a non-array input', () => {
        expect(mapLandmarks(null, origin)).toEqual([]);
        expect(mapLandmarks(undefined, origin)).toEqual([]);
    });

    it('skips features whose geometry is missing or malformed', () => {
        expect(mapLandmarks([
            { properties: { name: 'No Geometry', osm_key: 'shop', osm_value: 'mall', type: 'house' } }
        ], origin)).toEqual([]);
    });
});

describe('mapReverseGeocodeResponse', () => {
    const origin = { latitude: 10.7202, longitude: 122.5621 };

    it('never uses the nearest feature name as the address line', () => {
        const result = mapReverseGeocodeResponse({
            type: 'FeatureCollection',
            features: [feature(ILOILO_RESTAURANT_PROPERTIES, 122.5620412, 10.7200869)]
        }, origin);

        expect(result.address_line).toBe('Bakhaw, Jaro, Iloilo City, Western Visayas, Philippines');
        expect(result.address_line).not.toContain('Peri Todd');
        expect(result.provider).toBe(QUADRUPER_PROVIDER);
        expect(result.precision).toBe('house');
        expect(result.components.street).toBe('Jalandoni Street');
        expect(Array.isArray(result.landmarks)).toBe(true);
    });

    it('reads coordinates as [lon, lat], not [lat, lon]', () => {
        const result = mapReverseGeocodeResponse({
            features: [feature(ILOILO_RESTAURANT_PROPERTIES, 122.5620412, 10.7200869)]
        }, origin);

        // Treating the pair as [lat, lon] would place the point thousands of km away.
        expect(result.distance_meters).toBeLessThan(100);
    });

    it('returns null for an empty feature collection', () => {
        expect(mapReverseGeocodeResponse({ type: 'FeatureCollection', features: [] }, origin)).toBeNull();
        expect(mapReverseGeocodeResponse({}, origin)).toBeNull();
        expect(mapReverseGeocodeResponse(null, origin)).toBeNull();
    });
});

describe('mapForwardSearchResponse', () => {
    it('prepends the matched place name so the searched term survives', () => {
        const results = mapForwardSearchResponse({
            features: [feature(
                { name: 'Poblacion', osm_key: 'place', osm_value: 'village', type: 'district',
                  city: 'Pavia', state: 'Iloilo', country: 'Philippines', countrycode: 'PH' },
                122.5480, 10.7760
            )]
        });

        expect(results).toHaveLength(1);
        expect(results[0].address_line).toBe('Poblacion, Pavia, Iloilo, Philippines');
        expect(results[0].latitude).toBeCloseTo(10.7760, 4);
        expect(results[0].longitude).toBeCloseTo(122.5480, 4);
        expect(results[0].provider).toBe(QUADRUPER_PROVIDER);
    });

    it('does not duplicate a name that is already a segment', () => {
        const results = mapForwardSearchResponse({
            features: [feature(
                { name: 'Oton', osm_key: 'place', osm_value: 'town', type: 'city',
                  city: 'Oton', state: 'Iloilo' },
                122.4931, 10.7392
            )]
        });

        expect(results[0].address_line).toBe('Oton, Iloilo, Philippines');
    });

    it('drops features with unusable geometry and returns [] for an empty collection', () => {
        expect(mapForwardSearchResponse({ features: [{ properties: { name: 'X' } }] })).toEqual([]);
        expect(mapForwardSearchResponse({ features: [] })).toEqual([]);
        expect(mapForwardSearchResponse(null)).toEqual([]);
    });
});
