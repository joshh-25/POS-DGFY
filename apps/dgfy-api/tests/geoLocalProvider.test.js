import { localGeocodeProvider } from '../src/modules/geoSearch/providers/localGeocodeProvider.js';

describe('localGeocodeProvider.reverseGeocode', () => {
    it('returns the covered barangay label with PSGC provenance', async () => {
        const result = await localGeocodeProvider.reverseGeocode({ latitude: 10.7294, longitude: 122.5962 });

        expect(result).toEqual(expect.objectContaining({
            address_line: 'Bito-on, Iloilo City, Iloilo, Philippines',
            provider: 'dgfy-ph-local',
            precision: 'barangay',
            psgc_code: '0631000019',
            parent_psgc_code: '0631000000'
        }));
        expect(result.address_line).not.toMatch(/^Near /i);
    });

    it('always returns a landmarks array, empty, since the bundled dataset has no POI data', async () => {
        const result = await localGeocodeProvider.reverseGeocode({ latitude: 10.7294, longitude: 122.5962 });
        expect(result.landmarks).toEqual([]);
    });

    // Cebu City. NOT Manila (14.5995, 120.9842) -- the bundled dataset has an exact entry
    // at those coordinates with maxDistanceKm 20, so it resolves to `city`, not
    // `coordinate_only`. Cebu City is ~155 km from the Iloilo province centroid (55 km
    // radius) and ~140 km from Guimaras (40 km radius), so it is genuinely uncovered.
    it('falls back to a coordinate-only label well outside covered municipalities', async () => {
        const result = await localGeocodeProvider.reverseGeocode({ latitude: 10.3157, longitude: 123.8854 });

        expect(result.precision).toBe('coordinate_only');
        expect(result.address_line).toBe('Pinned location (10.315700, 123.885400)');
        expect(result.landmarks).toEqual([]);
    });
});

describe('localGeocodeProvider.searchAddresses', () => {
    it('matches on every whitespace-separated token, case-insensitively', async () => {
        const { results } = await localGeocodeProvider.searchAddresses({ query: 'bito-on iloilo', limit: 8 });

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].address_line).toContain('Bito-on');
        expect(results[0].provider).toBe('dgfy-ph-local');
    });

    it('returns an empty result set for an unmatched query', async () => {
        const { results } = await localGeocodeProvider.searchAddresses({ query: 'zzzz-not-a-place', limit: 8 });
        expect(results).toEqual([]);
    });

    it('honours the limit', async () => {
        const { results } = await localGeocodeProvider.searchAddresses({ query: 'iloilo', limit: 2 });
        expect(results.length).toBeLessThanOrEqual(2);
    });
});
