import { buildReverseGeocodeUseCase } from '../src/modules/geoSearch/usecases/geoSearchUseCases.js';
import { PH_LOCAL_ADDRESS_PROVENANCE } from '../src/modules/geoSearch/data/phLocalAddressDataset.js';

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
            psgc_code: expect.any(String),
            provenance: expect.objectContaining({
                psgc_release: expect.stringContaining('Philippine Standard Geographic Code'),
                generated_at: expect.any(String)
            }),
            latitude: 10.7202,
            longitude: 122.5621
        }));
    });

    it('prefers a covered PSGC barangay label over a broader city label', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase();

        const result = await reverseGeocode({ latitude: 10.7294, longitude: 122.5962 });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            address_line: 'Bito-on, Iloilo City, Iloilo, Philippines',
            provider: 'dgfy-ph-local',
            precision: 'barangay',
            psgc_code: '0631000019',
            parent_psgc_code: '0631000000',
            distance_meters: expect.any(Number)
        }));
        expect(result.data.address_line).not.toMatch(/^Near /i);
    });

    it('falls back to province precision when no covered barangay or city exists', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase();

        const result = await reverseGeocode({ latitude: 10.92, longitude: 122.55 });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            address_line: 'Iloilo, Philippines',
            provider: 'dgfy-ph-local',
            precision: 'province',
            psgc_code: '0603000000'
        }));
        expect(result.data.address_line).not.toMatch(/^Near /i);
    });

    it('returns coordinate-only fallback outside known local coverage without vague nearest-city text', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase();

        const result = await reverseGeocode({ latitude: 11.5, longitude: 123.0 });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            address_line: 'Pinned location (11.500000, 123.000000)',
            provider: 'dgfy-ph-local',
            precision: 'coordinate_only',
            provenance: expect.objectContaining({
                psgc_release: expect.stringContaining('Philippine Standard Geographic Code')
            })
        }));
        expect(result.data.address_line).not.toMatch(/^Near /i);
    });

    it('loads provenance for the bundled PH-local data source', () => {
        expect(PH_LOCAL_ADDRESS_PROVENANCE).toEqual(expect.objectContaining({
            provider: 'dgfy-ph-local',
            psgcRelease: 'Philippine Standard Geographic Code as of 31 March 2026',
            psgcApiBaseUrl: 'https://classification.psa.gov.ph/psgc',
            sources: expect.arrayContaining([
                expect.objectContaining({
                    label: 'PSA PSGC City of Iloilo',
                    url: 'https://psa.gov.ph/classification/psgc/barangays/0631000000'
                })
            ])
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
