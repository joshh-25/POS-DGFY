import { buildAddressSearchUseCase } from '../src/modules/geoSearch/usecases/geoSearchUseCases.js';

describe('address search use case', () => {
    it('returns matching first-party Philippine locations', async () => {
        const searchAddresses = buildAddressSearchUseCase();
        const result = await searchAddresses({ query: 'Iloilo City', limit: 5 });

        expect(result.success).toBe(true);
        expect(result.data.results.length).toBeGreaterThan(0);
        expect(result.data.results.length).toBeLessThanOrEqual(5);
        expect(result.data.results[0]).toEqual(expect.objectContaining({
            address_line: expect.stringContaining('Iloilo'),
            latitude: expect.any(Number),
            longitude: expect.any(Number),
            provider: 'dgfy-ph-local'
        }));
    });

    it('rejects incomplete address queries', async () => {
        const searchAddresses = buildAddressSearchUseCase();
        const result = await searchAddresses({ query: 'I' });

        expect(result.success).toBe(false);
        expect(result.error.message).toContain('at least 2 characters');
    });
});
