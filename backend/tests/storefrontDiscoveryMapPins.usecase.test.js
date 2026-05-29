import { jest } from '@jest/globals';
import { buildListStorefrontMapPinsUseCase } from '../src/modules/storefrontDiscovery/usecases/storefrontDiscoveryUseCases.js';

describe('listStorefrontMapPinsUseCase', () => {
  it('returns a flat auto-parser-friendly public pin feed', async () => {
    const listDiscovery = jest.fn(async () => ({
      rows: [
        {
          tenant_id: 'tenant-1',
          tenant_name: 'DGFY Demo Store',
          slug: 'dgfy-demo-store',
          location_id: 10,
          location_name: 'Main Branch',
          address_line: 'Iloilo City',
          latitude: 10.7202,
          longitude: 122.5621,
          workflow_mode: 'retail',
          storefront_open: true,
          supports_delivery: true,
          supports_pickup: true,
          supports_dine_in: false,
          storefront_tagline: 'Fresh daily',
          catalog_count: 12
        }
      ],
      pagination: {
        page: 1,
        limit: 100,
        total: 1,
        totalPages: 1
      }
    }));

    const useCase = buildListStorefrontMapPinsUseCase({
      storefrontDiscoveryRepository: { listDiscovery }
    });

    const result = await useCase({ query: {} });

    expect(result.success).toBe(true);
    expect(listDiscovery).toHaveBeenCalledWith(expect.objectContaining({
      limit: 100,
      include_match_meta: false
    }));
    expect(result.data.pins).toEqual([
      expect.objectContaining({
        title: 'DGFY Demo Store',
        latitude: 10.7202,
        longitude: 122.5621,
        subtitle: 'Main Branch',
        category: 'retail',
        address: 'Iloilo City',
        storefront_url: 'https://dgfy.ph/store/dgfy-demo-store'
      })
    ]);
  });
});
