import { jest } from '@jest/globals';
import { buildReverseGeocodeUseCase } from '../src/modules/geoSearch/usecases/geoSearchUseCases.js';

describe('reverse geocode use case', () => {
    it('formats a provider address for map pin autofill', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
                address: {
                    road: 'Villa Road',
                    city: 'Iloilo City',
                    state: 'Western Visayas',
                    postcode: '5000'
                }
            })
        });
        const reverseGeocode = buildReverseGeocodeUseCase({ fetchImpl });

        const result = await reverseGeocode({ latitude: 10.7202, longitude: 122.5621 });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            address_line: 'Villa Road, Iloilo City, Western Visayas, 5000',
            provider: 'nominatim',
            latitude: 10.7202,
            longitude: 122.5621
        }));
        expect(fetchImpl).toHaveBeenCalledWith(
            expect.stringContaining('https://nominatim.openstreetmap.org/reverse?'),
            expect.objectContaining({
                headers: expect.objectContaining({
                    Accept: 'application/json',
                    'User-Agent': expect.stringContaining('DGFY-SKU-Inventory-Manager')
                })
            })
        );
    });

    it('returns a service failure when the provider cannot be used', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase({
            fetchImpl: jest.fn().mockResolvedValue({ ok: false })
        });

        const result = await reverseGeocode({ latitude: 10.7202, longitude: 122.5621 });

        expect(result.success).toBe(false);
        expect(result.error).toEqual(expect.objectContaining({
            code: 'SERVICE_UNAVAILABLE',
            statusCode: 502
        }));
    });
});
