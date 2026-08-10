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
    expect(result.data.pins[0]).not.toHaveProperty('available_items');
    expect(result.data.pins[0]).not.toHaveProperty('available_item_names');
    expect(result.data.pins[0]).not.toHaveProperty('available_item_count');
  });

  it('prefers an active canonical custom-domain URL', async () => {
    const listDiscovery = jest.fn(async () => ({
      rows: [{ tenant_id: 'tenant-1', tenant_name: 'Grand Matador', slug: 'grand-matador', latitude: 10.7, longitude: 122.5 }],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 }
    }));
    const listActiveCanonicalOriginsByTenantIds = jest.fn(async () => new Map([
      ['tenant-1', 'https://grandmatador.com']
    ]));
    const useCase = buildListStorefrontMapPinsUseCase({
      storefrontDiscoveryRepository: { listDiscovery },
      storefrontDomainRepository: { listActiveCanonicalOriginsByTenantIds }
    });
    const result = await useCase({ query: {} });
    expect(result.data.pins[0].storefront_url).toBe('https://grandmatador.com');
  });

  it('excludes no-location storefront rows from public map pins', async () => {
    const listDiscovery = jest.fn(async () => ({
      rows: [
        {
          tenant_id: 'tenant-1',
          tenant_name: 'No Location Kitchen',
          slug: 'no-location-kitchen',
          location_id: null,
          location_name: null,
          address_line: null,
          latitude: null,
          longitude: null,
          storefront_open: true
        },
        {
          tenant_id: 'tenant-2',
          tenant_name: 'Pinned Store',
          slug: 'pinned-store',
          location_id: 20,
          location_name: 'Main',
          address_line: 'Iloilo City',
          latitude: 10.7202,
          longitude: 122.5621,
          storefront_open: true
        }
      ],
      pagination: {
        page: 1,
        limit: 100,
        total: 2,
        totalPages: 1
      }
    }));

    const useCase = buildListStorefrontMapPinsUseCase({
      storefrontDiscoveryRepository: { listDiscovery }
    });

    const result = await useCase({ query: {} });

    expect(result.success).toBe(true);
    expect(result.data.pins).toHaveLength(1);
    expect(result.data.pins[0]).toEqual(expect.objectContaining({
      tenant_id: 'tenant-2',
      title: 'Pinned Store'
    }));
  });


  it('optionally returns public available item names and capped structured items for the pin location', async () => {
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
          workflow_mode: 'services',
          storefront_open: true,
          supports_delivery: true,
          supports_pickup: true,
          supports_dine_in: false,
          catalog_count: 5,
          item_search_snapshot: [
            {
              item_id: 1,
              item_name: 'A/C Cleaning',
              category: 'service',
              in_stock_location_ids: [10]
            },
            {
              item_id: 2,
              item_name: 'A/C Repair',
              category: 'service',
              in_stock_location_ids: [10]
            },
            {
              item_id: 3,
              item_name: 'Other Branch Filter',
              category: 'service',
              in_stock_location_ids: [11]
            },
            {
              item_id: 4,
              item_name: 'Out of Stock Filter',
              category: 'product',
              in_stock_location_ids: []
            }
          ]
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

    const result = await useCase({ query: { include_items: true, item_limit: 1 } });

    expect(result.success).toBe(true);
    expect(listDiscovery).toHaveBeenCalledWith(expect.not.objectContaining({
      include_items: expect.anything(),
      item_limit: expect.anything()
    }));
    expect(result.data.pins[0]).toEqual(expect.objectContaining({
      available_item_count: 2,
      available_item_names: 'A/C Cleaning',
      available_items: [
        {
          name: 'A/C Cleaning',
          category: 'service',
          availability_status: 'available'
        }
      ]
    }));
    expect(result.data.pins[0]).not.toHaveProperty('current_stock');
    expect(result.data.pins[0]).not.toHaveProperty('cost_per_unit');
    expect(result.data.pins[0]).not.toHaveProperty('company_token');
  });
});
