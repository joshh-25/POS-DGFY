import { buildReverseGeocodeUseCase } from '../src/modules/geoSearch/usecases/geoSearchUseCases.js';

describe('reverse geocode use case', () => {
    it('formats an Iloilo City local address label for map pin autofill', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase();

        const result = await reverseGeocode({ latitude: 10.7202, longitude: 122.5621 });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            address_line: expect.stringContaining('Iloilo'),
            provider: 'dgfy-ph-local',
            precision: expect.stringMatching(/barangay|city/),
            distance_meters: expect.any(Number),
            latitude: 10.7202,
            longitude: 122.5621
        }));
    });

    it('returns coordinate-only fallback outside known local coverage without vague nearest-city text', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase();

        const result = await reverseGeocode({ latitude: 11.5, longitude: 123.0 });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            address_line: 'Pinned location (11.500000, 123.000000)',
            provider: 'dgfy-ph-local',
            precision: 'coordinate_only'
        }));
        expect(result.data.address_line).not.toMatch(/^Near /i);
    });

    it('rejects invalid coordinates before address autofill', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase();

        const result = await reverseGeocode({ latitude: 'bad', longitude: 122.5621 });

        expect(result.success).toBe(false);
        expect(result.error).toEqual(expect.objectContaining({
            code: 'VALIDATION_FAILED',
            statusCode: 422
        }));
    });
});
