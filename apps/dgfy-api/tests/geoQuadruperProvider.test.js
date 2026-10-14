import { describe, expect, it, jest } from '@jest/globals';
import {
    FORWARD_PARAM_ALLOWLIST,
    REVERSE_PARAM_ALLOWLIST,
    __testing,
    quadruperGeocodeProvider
} from '../src/modules/geoSearch/providers/quadruperGeocodeProvider.js';

const jsonResponse = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
});

const ILOILO_FEATURE = {
    type: 'Feature',
    properties: {
        osm_key: 'amenity', osm_value: 'restaurant', type: 'house', name: "Peri Todd's Burger",
        street: 'Jalandoni Street', locality: 'Bakhaw', district: 'Jaro', city: 'Iloilo City',
        state: 'Western Visayas', country: 'Philippines', countrycode: 'PH'
    },
    geometry: { type: 'Point', coordinates: [122.5620412, 10.7200869] }
};

describe('quadruperGeocodeProvider', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('returns a mapped address on a successful reverse response', async () => {
        global.fetch = jest.fn(async () => jsonResponse({ features: [ILOILO_FEATURE] }));

        const result = await quadruperGeocodeProvider.reverseGeocode({ latitude: 10.7202, longitude: 122.5621 });

        expect(result.address_line).toBe('Bakhaw, Jaro, Iloilo City, Western Visayas, Philippines');
        expect(result.provider).toBe('dgfy-quadruper');
    });

    it('treats HTTP 200 with an empty feature list as a miss, not an error', async () => {
        global.fetch = jest.fn(async () => jsonResponse({ type: 'FeatureCollection', features: [] }));

        await expect(quadruperGeocodeProvider.reverseGeocode({ latitude: 1, longitude: 1 })).resolves.toBeNull();
    });

    it('returns the transport-failure sentinel on the flat HTTP 400 error shape', async () => {
        global.fetch = jest.fn(async () => jsonResponse(
            { message: 'q parameter is required when no include categories are specified' }, 400
        ));

        await expect(quadruperGeocodeProvider.searchAddresses({ query: 'x', limit: 5 })).resolves.toBeUndefined();
    });

    it('returns the transport-failure sentinel on the per-field HTTP 400 error shape', async () => {
        global.fetch = jest.fn(async () => jsonResponse(
            { lat: [{ message: 'TYPE_CONVERSION_FAILED', args: {}, value: 'abc' }] }, 400
        ));

        await expect(quadruperGeocodeProvider.reverseGeocode({ latitude: 10.7, longitude: 122.5 })).resolves.toBeUndefined();
    });

    it('returns the transport-failure sentinel rather than throwing when the body is not JSON', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => { throw new SyntaxError('Unexpected token < in JSON'); }
        }));

        await expect(quadruperGeocodeProvider.reverseGeocode({ latitude: 10.7, longitude: 122.5 })).resolves.toBeUndefined();
    });

    it('returns the transport-failure sentinel rather than throwing when the request aborts', async () => {
        global.fetch = jest.fn(async () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            throw error;
        });

        await expect(quadruperGeocodeProvider.reverseGeocode({ latitude: 10.7, longitude: 122.5 })).resolves.toBeUndefined();
    });

    it('always sends the PH bbox and clamps limit to 20 on forward search', async () => {
        global.fetch = jest.fn(async () => jsonResponse({ features: [ILOILO_FEATURE] }));

        await quadruperGeocodeProvider.searchAddresses({ query: 'Bakhaw', limit: 999 });

        const url = new URL(global.fetch.mock.calls[0][0]);
        expect(url.searchParams.get('bbox')).toBe('114.20624,4.55472,126.60253,21.11770');
        expect(url.searchParams.get('limit')).toBe('20');
        expect(url.searchParams.get('lang')).toBe('en');
    });

    it('sends bias coordinates only when both are supplied', async () => {
        global.fetch = jest.fn(async () => jsonResponse({ features: [ILOILO_FEATURE] }));

        await quadruperGeocodeProvider.searchAddresses({ query: 'Poblacion', limit: 5, biasLatitude: 10.72, biasLongitude: 122.56 });
        const withBias = new URL(global.fetch.mock.calls[0][0]);
        expect(withBias.searchParams.get('lat')).toBe('10.72');
        expect(withBias.searchParams.get('lon')).toBe('122.56');

        global.fetch.mockClear();
        await quadruperGeocodeProvider.searchAddresses({ query: 'Poblacion', limit: 5 });
        const withoutBias = new URL(global.fetch.mock.calls[0][0]);
        expect(withoutBias.searchParams.has('lat')).toBe(false);
        expect(withoutBias.searchParams.has('lon')).toBe(false);
    });

    it('never emits a parameter name outside the allowlist', () => {
        const query = __testing.buildQuery(FORWARD_PARAM_ALLOWLIST, {
            q: 'test', limit: 5, bogus: 'should-not-appear', __proto__unsafe: 'no'
        });
        const params = new URLSearchParams(query);

        Array.from(params.keys()).forEach((key) => {
            expect(FORWARD_PARAM_ALLOWLIST).toContain(key);
        });
        expect(query).not.toContain('bogus');
    });

    it('URL-encodes values containing spaces and commas', () => {
        const query = __testing.buildQuery(REVERSE_PARAM_ALLOWLIST, { lat: 10.7, lon: 122.5 });
        expect(query).toContain('lat=10.7');

        const forward = __testing.buildQuery(FORWARD_PARAM_ALLOWLIST, { q: 'Ayala Avenue, Makati' });
        expect(forward).toContain('q=Ayala+Avenue%2C+Makati');
    });

    it('requests landmark-bearing reverse parameters', async () => {
        global.fetch = jest.fn(async () => jsonResponse({ features: [ILOILO_FEATURE] }));

        await quadruperGeocodeProvider.reverseGeocode({ latitude: 10.7202, longitude: 122.5621 });

        const url = new URL(global.fetch.mock.calls[0][0]);
        expect(url.searchParams.get('radius')).toBe('0.4');
        expect(url.searchParams.get('limit')).toBe('15');
        expect(url.searchParams.get('distance_sort')).toBe('true');
    });

    describe('house-number queries (#2484)', () => {
        const RIZAL_STREET = {
            type: 'Feature',
            properties: {
                osm_key: 'highway', osm_value: 'secondary', type: 'street', name: 'Rizal Street',
                locality: 'Iloilo Central Business District', district: 'City Proper', city: 'Iloilo City', state: 'Western Visayas'
            },
            geometry: { type: 'Point', coordinates: [122.57, 10.69] }
        };
        const CAINTA_HOUSE = {
            type: 'Feature',
            properties: {
                osm_key: 'building', osm_value: 'yes', type: 'house', housenumber: '52',
                street: 'Saint Anthony Street', locality: 'Rodfer Ⅱ', city: 'Cainta', state: 'Rizal'
            },
            geometry: { type: 'Point', coordinates: [121.1, 14.6] }
        };

        const routeByQuery = (byQuery) => jest.fn(async (url) => {
            const q = new URL(url).searchParams.get('q');
            return byQuery[q] === undefined ? jsonResponse({}, 500) : jsonResponse(byQuery[q]);
        });

        it('searches the street part alone and returns street-level results with the typed number', async () => {
            global.fetch = routeByQuery({
                '52 Rizal Street': { features: [CAINTA_HOUSE] },
                'Rizal Street': { features: [RIZAL_STREET] }
            });

            const result = await quadruperGeocodeProvider.searchAddresses({ query: '52 Rizal Street', limit: 5 });

            expect(global.fetch).toHaveBeenCalledTimes(2);
            const streetCall = global.fetch.mock.calls
                .map(([url]) => new URL(url))
                .find((url) => url.searchParams.get('q') === 'Rizal Street');
            expect(streetCall.searchParams.get('limit')).toBe('20');
            expect(result.results).toHaveLength(1);
            expect(result.results[0].address_line.startsWith('52 Rizal Street, ')).toBe(true);
            expect(result.results[0].precision).toBe('street');
        });

        it('falls back to the plain results when no street matches', async () => {
            global.fetch = routeByQuery({
                '5 Star Bakery': { features: [ILOILO_FEATURE] },
                'Star Bakery': { features: [] }
            });

            const result = await quadruperGeocodeProvider.searchAddresses({ query: '5 Star Bakery', limit: 5 });

            expect(result.results).toHaveLength(1);
            expect(result.results[0].address_line.startsWith("Peri Todd's Burger")).toBe(true);
        });

        it('still answers from the street search when the full query fails', async () => {
            global.fetch = routeByQuery({ 'Rizal Street': { features: [RIZAL_STREET] } });

            const result = await quadruperGeocodeProvider.searchAddresses({ query: '52 Rizal Street', limit: 5 });

            expect(result.results[0].precision).toBe('street');
        });

        it('returns the transport-failure sentinel when both searches fail', async () => {
            global.fetch = routeByQuery({});

            await expect(quadruperGeocodeProvider.searchAddresses({ query: '52 Rizal Street', limit: 5 })).resolves.toBeUndefined();
        });

        it('makes a single request when the query has no house number', async () => {
            global.fetch = routeByQuery({ 'Rizal Street': { features: [RIZAL_STREET] } });

            await quadruperGeocodeProvider.searchAddresses({ query: 'Rizal Street', limit: 5 });

            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
    });
});
