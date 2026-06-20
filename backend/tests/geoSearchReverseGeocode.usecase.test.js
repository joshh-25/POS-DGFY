import { buildReverseGeocodeUseCase } from '../src/modules/geoSearch/usecases/geoSearchUseCases.js';

describe('reverse geocode use case', () => {
    it('formats an Iloilo City local address label for map pin autofill', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase();

        const result = await reverseGeocode({ latitude: 10.7202, longitude: 122.5621 });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            address_line: 'Iloilo City, Iloilo, Philippines',
            provider: 'dgfy-local',
            latitude: 10.7202,
            longitude: 122.5621
        }));
    });

    it('returns a local nearest-city label outside known city bounds without using a provider', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase();

        const result = await reverseGeocode({ latitude: 11.5, longitude: 123.0 });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            address_line: 'Near Iloilo City, Iloilo, Philippines',
            provider: 'dgfy-local'
        }));
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
