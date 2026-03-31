import { jest } from '@jest/globals';

const findAllMock = jest.fn();
const findOneMock = jest.fn();
const reconcileMock = jest.fn();
const tenantFindAllMock = jest.fn();
const getConnectionMock = jest.fn();
const itemFindAllMock = jest.fn();
const buildVisibleWhereMock = jest.fn((where) => where);

jest.unstable_mockModule('../src/models/index.js', () => ({
  StorefrontDiscoveryIndex: {
    findAll: findAllMock,
    findOne: findOneMock
  },
  Tenant: {
    findAll: tenantFindAllMock
  }
}));

jest.unstable_mockModule('../src/services/storefrontDiscoveryIndexService.js', () => ({
  reconcileStorefrontDiscoveryIndex: reconcileMock
}));

jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({
  default: {
    getConnection: getConnectionMock
  }
}));

jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
  getTenantModels: () => ({
    Item: {
      findAll: itemFindAllMock
    },
    PosCatalogOverride: {}
  })
}));

jest.unstable_mockModule('../src/utils/softDeletePolicy.js', () => ({
  buildVisibleWhere: buildVisibleWhereMock
}));

let storefrontDiscoveryRepository;

const loadRepository = async () => {
  jest.resetModules();
  ({ storefrontDiscoveryRepository } = await import('../src/modules/storefrontDiscovery/repositories/storefrontDiscoveryRepository.js'));
  return storefrontDiscoveryRepository;
};

describe('storefrontDiscoveryRepository (index-backed)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findOneMock.mockResolvedValue({
      row_count: 1,
      last_updated_at: '2026-03-31T00:00:00.000Z'
    });
    tenantFindAllMock.mockResolvedValue([]);
    getConnectionMock.mockResolvedValue({});
    itemFindAllMock.mockResolvedValue([]);
    delete process.env.STOREFRONT_DISCOVERY_INDEX_AUTO_REPAIR_ON_EMPTY;
  });

  it('returns discovery rows from landlord index and never exposes company token', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      {
        tenant_id: 'tenant-1',
        tenant_name: 'Acme',
        slug: 'acme-store',
        storefront_open: true,
        location_id: 11,
        location_name: 'Main',
        address_line: 'Iloilo City',
        latitude: 10.72,
        longitude: 122.56,
        delivery_radius_km: 6,
        estimated_wait_minutes: 15,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true,
        store_delivery_fee: 25,
        catalog_count: 42
      }
    ]);

    const result = await repository.listDiscovery({ limit: 10 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(expect.objectContaining({
      tenant_id: 'tenant-1',
      slug: 'acme-store',
      catalog_count: 42
    }));
    expect(result.rows[0]).not.toHaveProperty('company_token');
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it('triggers auto-repair reconciliation when index is empty', async () => {
    const repository = await loadRepository();
    findAllMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          tenant_id: 'tenant-1',
          tenant_name: 'Acme',
          slug: 'acme-store',
          storefront_open: true,
          location_id: 1,
          location_name: 'Main',
          address_line: 'Iloilo',
          latitude: 10.7,
          longitude: 122.5,
          delivery_radius_km: 5,
          estimated_wait_minutes: 15,
          supports_delivery: true,
          supports_pickup: true,
          supports_dine_in: true,
          store_delivery_fee: 0,
          catalog_count: 10
        }
      ]);
    reconcileMock.mockResolvedValue({ status: 'healthy' });

    const result = await repository.listDiscovery({});
    expect(reconcileMock).toHaveBeenCalledTimes(1);
    expect(result.rows).toHaveLength(1);
  });

  it('gets storefront profile by slug from index', async () => {
    const repository = await loadRepository();
    findOneMock.mockResolvedValue({
      tenant_id: 'tenant-2',
      tenant_name: 'Bravo',
      slug: 'bravo-store',
      storefront_open: false,
      location_id: 2,
      location_name: 'Branch 2',
      address_line: 'Lapaz',
      latitude: 10.71,
      longitude: 122.57,
      delivery_radius_km: 3,
      estimated_wait_minutes: 20,
      supports_delivery: true,
      supports_pickup: false,
      supports_dine_in: true,
      store_delivery_fee: 20,
      catalog_count: 8
    });

    const result = await repository.getStorefrontBySlug('bravo-store');
    expect(result).toEqual(expect.objectContaining({
      tenant_id: 'tenant-2',
      slug: 'bravo-store'
    }));
  });

  it('includes tenants when search matches visible catalog item name (including out-of-stock)', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      {
        tenant_id: 'tenant-1',
        tenant_name: 'Alpha Foods',
        slug: 'alpha',
        storefront_open: true,
        location_id: 11,
        location_name: 'Main',
        address_line: 'Iloilo City',
        latitude: 10.72,
        longitude: 122.56,
        delivery_radius_km: 6,
        estimated_wait_minutes: 15,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true,
        store_delivery_fee: 25,
        catalog_count: 42
      },
      {
        tenant_id: 'tenant-2',
        tenant_name: 'Bravo Foods',
        slug: 'bravo',
        storefront_open: true,
        location_id: 12,
        location_name: 'Main',
        address_line: 'Iloilo City',
        latitude: 10.73,
        longitude: 122.57,
        delivery_radius_km: 6,
        estimated_wait_minutes: 15,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true,
        store_delivery_fee: 25,
        catalog_count: 42
      }
    ]);
    tenantFindAllMock.mockResolvedValue([
      { id: 'tenant-1', name: 'Alpha Foods', db_name: 'db_1', company_token: 'ct_1', status: 'active' },
      { id: 'tenant-2', name: 'Bravo Foods', db_name: 'db_2', company_token: 'ct_2', status: 'active' }
    ]);
    itemFindAllMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        item_id: 55,
        name: 'Calamansi Juice',
        posCatalogOverride: { pos_visible: true }
      }]);

    const result = await repository.listDiscovery({ search: 'calamansi' });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].tenant_id).toBe('tenant-2');
    for (const [whereClause] of buildVisibleWhereMock.mock.calls) {
      expect(whereClause.current_stock).toBeUndefined();
    }
  });

  it('includes tenants when matching item has no catalog override row', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      {
        tenant_id: 'tenant-1',
        tenant_name: 'Alpha Foods',
        slug: 'alpha',
        storefront_open: true,
        location_id: 11,
        location_name: 'Main',
        address_line: 'Iloilo City',
        latitude: 10.72,
        longitude: 122.56,
        delivery_radius_km: 6,
        estimated_wait_minutes: 15,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true,
        store_delivery_fee: 25,
        catalog_count: 42
      }
    ]);
    tenantFindAllMock.mockResolvedValue([
      { id: 'tenant-1', name: 'Alpha Foods', db_name: 'db_1', company_token: 'ct_1', status: 'active' }
    ]);
    itemFindAllMock.mockResolvedValue([{
      item_id: 55,
      name: 'Calamansi Juice',
      category: 'product',
      product_type: 'finished_goods',
      posCatalogOverride: null
    }]);

    const result = await repository.listDiscovery({ search: 'calamansi' });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].tenant_id).toBe('tenant-1');
  });

  it('excludes tenants when matching item has no override and is not finished goods', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      {
        tenant_id: 'tenant-1',
        tenant_name: 'Alpha Foods',
        slug: 'alpha',
        storefront_open: true,
        location_id: 11,
        location_name: 'Main',
        address_line: 'Iloilo City',
        latitude: 10.72,
        longitude: 122.56,
        delivery_radius_km: 6,
        estimated_wait_minutes: 15,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true,
        store_delivery_fee: 25,
        catalog_count: 42
      }
    ]);
    tenantFindAllMock.mockResolvedValue([
      { id: 'tenant-1', name: 'Alpha Foods', db_name: 'db_1', company_token: 'ct_1', status: 'active' }
    ]);
    itemFindAllMock.mockResolvedValue([{
      item_id: 56,
      name: 'Raw Calamansi',
      category: 'ingredient',
      product_type: null,
      posCatalogOverride: null
    }]);

    const result = await repository.listDiscovery({ search: 'calamansi' });
    expect(result.rows).toHaveLength(0);
  });

  it('keeps tenant match when matching item is out of stock', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      {
        tenant_id: 'tenant-3',
        tenant_name: 'Charlie Foods',
        slug: 'charlie',
        storefront_open: true,
        location_id: 13,
        location_name: 'Main',
        address_line: 'Iloilo City',
        latitude: 10.74,
        longitude: 122.58,
        delivery_radius_km: 6,
        estimated_wait_minutes: 15,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true,
        store_delivery_fee: 25,
        catalog_count: 42
      }
    ]);
    tenantFindAllMock.mockResolvedValue([
      { id: 'tenant-3', name: 'Charlie Foods', db_name: 'db_3', company_token: 'ct_3', status: 'active' }
    ]);
    itemFindAllMock.mockResolvedValue([{
      item_id: 88,
      name: 'Calamansi Concentrate',
      current_stock: 0,
      posCatalogOverride: { pos_visible: true }
    }]);

    const result = await repository.listDiscovery({ search: 'calamansi' });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].tenant_id).toBe('tenant-3');
  });

  it('prioritizes item-search matches over tenant-field matches when item hits exist', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      {
        tenant_id: 'tenant-1',
        tenant_name: 'Demo Supermart',
        slug: 'demo-supermart',
        storefront_open: true,
        location_id: 11,
        location_name: 'Main',
        address_line: 'Iloilo City',
        latitude: 10.72,
        longitude: 122.56,
        delivery_radius_km: 6,
        estimated_wait_minutes: 15,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true,
        store_delivery_fee: 25,
        catalog_count: 42
      },
      {
        tenant_id: 'tenant-2',
        tenant_name: 'Alpha Foods',
        slug: 'alpha',
        storefront_open: true,
        location_id: 12,
        location_name: 'Main',
        address_line: 'Iloilo City',
        latitude: 10.73,
        longitude: 122.57,
        delivery_radius_km: 6,
        estimated_wait_minutes: 15,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true,
        store_delivery_fee: 25,
        catalog_count: 42
      }
    ]);
    tenantFindAllMock.mockResolvedValue([
      { id: 'tenant-1', name: 'Demo Supermart', db_name: 'db_1', company_token: 'ct_1', status: 'active' },
      { id: 'tenant-2', name: 'Alpha Foods', db_name: 'db_2', company_token: 'ct_2', status: 'active' }
    ]);
    itemFindAllMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        item_id: 90,
        name: 'Demo Chicken',
        posCatalogOverride: { pos_visible: true }
      }]);

    const result = await repository.listDiscovery({ search: 'demo' });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].tenant_id).toBe('tenant-2');
  });

  it('includes tenant when first matching item is hidden but later matching item is visible', async () => {
    const repository = await loadRepository();
    findAllMock.mockResolvedValue([
      {
        tenant_id: 'tenant-1',
        tenant_name: 'Original Legacy Data',
        slug: 'original-legacy-data-07e932',
        storefront_open: true,
        location_id: 2,
        location_name: 'Bernwood Tower',
        address_line: 'Iloilo City',
        latitude: 10.7,
        longitude: 122.55,
        delivery_radius_km: 5,
        estimated_wait_minutes: 15,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true,
        store_delivery_fee: 0,
        catalog_count: 10
      }
    ]);
    tenantFindAllMock.mockResolvedValue([
      { id: 'tenant-1', name: 'Original Legacy Data', db_name: 'db_1', company_token: 'ct_1', status: 'active' }
    ]);
    itemFindAllMock.mockResolvedValue([
      {
        item_id: 318,
        name: 'Demo raw',
        category: 'raw_material',
        product_type: null,
        posCatalogOverride: null
      },
      {
        item_id: 319,
        name: 'Demo Product',
        category: 'product',
        product_type: 'finished_goods',
        posCatalogOverride: null
      }
    ]);

    const result = await repository.listDiscovery({ search: 'demo' });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].tenant_id).toBe('tenant-1');
  });
});
