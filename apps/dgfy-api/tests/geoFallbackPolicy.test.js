import { jest } from '@jest/globals';
import {
    buildAddressSearchUseCase,
    buildReverseGeocodeUseCase
} from '../src/modules/geoSearch/usecases/geoSearchUseCases.js';
import { createCircuitBreaker } from '../src/modules/geoSearch/providers/geocodeCircuitBreaker.js';

const remoteHit = {
    address_line: 'Bakhaw, Jaro, Iloilo City, Western Visayas, Philippines',
    provider: 'dgfy-quadruper',
    precision: 'house',
    distance_meters: 12,
    components: { street: 'Jalandoni Street', locality: 'Bakhaw', district: 'Jaro', city: 'Iloilo City', state: 'Western Visayas', postcode: '5000' },
    landmarks: [{ name: 'SM Hypermarket', category: 'shop', osm_key: 'shop', osm_value: 'supermarket', distance_meters: 180, latitude: 10.7211, longitude: 122.5634 }]
};

const localHit = {
    address_line: 'Bito-on, Iloilo City, Iloilo, Philippines',
    provider: 'dgfy-ph-local',
    precision: 'barangay',
    psgc_code: '0631000019',
    components: { street: null, locality: null, district: null, city: null, state: null, postcode: null },
    landmarks: []
};

const fakeLocal = { reverseGeocode: async () => localHit, searchAddresses: async () => ({ results: [localHit] }) };

describe('reverse geocode fallback policy', () => {
    it('uses the remote provider when it answers', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase({
            remoteProvider: { reverseGeocode: async () => remoteHit },
            localProvider: fakeLocal,
            circuitBreaker: createCircuitBreaker()
        });

        const result = await reverseGeocode({ latitude: 10.7202, longitude: 122.5621 });

        expect(result.success).toBe(true);
        expect(result.data.provider).toBe('dgfy-quadruper');
        expect(result.data.landmarks).toHaveLength(1);
        expect(result.data.latitude).toBe(10.7202);
        expect(result.data.longitude).toBe(122.5621);
    });

    it('falls back to local on a genuine miss', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase({
            remoteProvider: { reverseGeocode: async () => null },
            localProvider: fakeLocal,
            circuitBreaker: createCircuitBreaker()
        });

        const result = await reverseGeocode({ latitude: 10.7294, longitude: 122.5962 });

        expect(result.success).toBe(true);
        expect(result.data.provider).toBe('dgfy-ph-local');
        expect(result.data.landmarks).toEqual([]);
    });

    it('falls back to local when the remote provider throws', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase({
            remoteProvider: { reverseGeocode: async () => { throw new Error('socket hang up'); } },
            localProvider: fakeLocal,
            circuitBreaker: createCircuitBreaker()
        });

        const result = await reverseGeocode({ latitude: 10.7294, longitude: 122.5962 });

        expect(result.success).toBe(true);
        expect(result.data.provider).toBe('dgfy-ph-local');
    });

    it('stops calling the remote provider once transport failures open the breaker', async () => {
        const reverseGeocode = jest.fn(async () => undefined);
        const breaker = createCircuitBreaker({ failureThreshold: 2, openMs: 60000 });
        const useCase = buildReverseGeocodeUseCase({
            remoteProvider: { reverseGeocode },
            localProvider: fakeLocal,
            circuitBreaker: breaker
        });

        await useCase({ latitude: 10.7294, longitude: 122.5962 });
        await useCase({ latitude: 10.7294, longitude: 122.5962 });
        expect(breaker.isOpen()).toBe(true);

        reverseGeocode.mockClear();
        await useCase({ latitude: 10.7294, longitude: 122.5962 });
        expect(reverseGeocode).not.toHaveBeenCalled();
    });

    it('does NOT open the breaker on repeated genuine misses', async () => {
        const reverseGeocode = jest.fn(async () => null);
        const breaker = createCircuitBreaker({ failureThreshold: 2, openMs: 60000 });
        const useCase = buildReverseGeocodeUseCase({
            remoteProvider: { reverseGeocode },
            localProvider: fakeLocal,
            circuitBreaker: breaker
        });

        await useCase({ latitude: 10.7294, longitude: 122.5962 });
        await useCase({ latitude: 10.7294, longitude: 122.5962 });
        await useCase({ latitude: 10.7294, longitude: 122.5962 });

        expect(breaker.isOpen()).toBe(false);
        expect(reverseGeocode).toHaveBeenCalledTimes(3);
    });

    it('rejects non-finite coordinates with a validation failure', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase({
            remoteProvider: { reverseGeocode: async () => remoteHit },
            localProvider: fakeLocal,
            circuitBreaker: createCircuitBreaker()
        });

        const result = await reverseGeocode({ latitude: 'abc', longitude: null });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });
});

describe('address search fallback policy', () => {
    it('passes bias coordinates through to the remote provider', async () => {
        const searchAddresses = jest.fn(async () => ({ results: [remoteHit] }));
        const useCase = buildAddressSearchUseCase({
            remoteProvider: { searchAddresses },
            localProvider: fakeLocal,
            circuitBreaker: createCircuitBreaker()
        });

        await useCase({ query: 'Poblacion', limit: 8, biasLatitude: 10.72, biasLongitude: 122.56 });

        expect(searchAddresses).toHaveBeenCalledWith(expect.objectContaining({
            query: 'Poblacion', limit: 8, biasLatitude: 10.72, biasLongitude: 122.56
        }));
    });

    it('falls back to the local dataset when the remote provider returns null', async () => {
        const useCase = buildAddressSearchUseCase({
            remoteProvider: { searchAddresses: async () => null },
            localProvider: fakeLocal,
            circuitBreaker: createCircuitBreaker()
        });

        const result = await useCase({ query: 'bito-on', limit: 8 });

        expect(result.success).toBe(true);
        expect(result.data.results[0].provider).toBe('dgfy-ph-local');
    });

    it('rejects a query shorter than two characters', async () => {
        const useCase = buildAddressSearchUseCase({
            remoteProvider: { searchAddresses: async () => ({ results: [] }) },
            localProvider: fakeLocal,
            circuitBreaker: createCircuitBreaker()
        });

        const result = await useCase({ query: 'a', limit: 8 });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });
});
