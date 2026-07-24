import { jest } from '@jest/globals';

const resolveItemIdMock = jest.fn();
const upsertStoreItemMock = jest.fn();
const geoItemAliasFindOneMock = jest.fn();
const geoItemAliasCreateMock = jest.fn();
const loggerWarnMock = jest.fn();

jest.unstable_mockModule('../src/workers/geoInventoryWorker.js', () => ({
  resolveItemId: resolveItemIdMock,
  upsertStoreItem: upsertStoreItemMock
}));

jest.unstable_mockModule('../src/models/index.js', () => ({
  GeoItemAlias: {
    findOne: geoItemAliasFindOneMock,
    create: geoItemAliasCreateMock
  }
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: { warn: loggerWarnMock }
}));

let syncTenantGeoCatalog;

beforeEach(async () => {
  jest.clearAllMocks();
  jest.resetModules();
  ({ syncTenantGeoCatalog } = await import('../src/modules/geoSearch/services/geoCatalogSyncService.js'));
});

describe('syncTenantGeoCatalog', () => {
  it('does nothing when tenantId or snapshot is missing/empty', async () => {
    await syncTenantGeoCatalog({ tenantId: null, itemSearchSnapshot: [{ item_name: 'x' }] });
    await syncTenantGeoCatalog({ tenantId: 'tenant-1', itemSearchSnapshot: [] });
    expect(resolveItemIdMock).not.toHaveBeenCalled();
  });

  it('resolves each snapshot item and upserts it into geo_store_items', async () => {
    resolveItemIdMock.mockResolvedValue(42);
    geoItemAliasFindOneMock.mockResolvedValue(null);

    await syncTenantGeoCatalog({
      tenantId: 'tenant-1',
      itemSearchSnapshot: [{
        item_name: 'Grilled Shrimp',
        category: 'menu_item',
        in_stock_location_ids: [11]
      }]
    });

    expect(resolveItemIdMock).toHaveBeenCalledWith('Grilled Shrimp', 'tenant-1');
    expect(upsertStoreItemMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      itemId: 42,
      inStock: true,
      storefrontVisible: true
    }));
  });

  it('marks an out-of-stock item (empty in_stock_location_ids) as not in stock', async () => {
    resolveItemIdMock.mockResolvedValue(7);
    geoItemAliasFindOneMock.mockResolvedValue(null);

    await syncTenantGeoCatalog({
      tenantId: 'tenant-1',
      itemSearchSnapshot: [{ item_name: 'Sold Out Item', in_stock_location_ids: [] }]
    });

    expect(upsertStoreItemMock).toHaveBeenCalledWith(expect.objectContaining({ inStock: false }));
  });

  it('creates an approved global alias for the matched cuisine category head', async () => {
    resolveItemIdMock.mockResolvedValue(42);
    geoItemAliasFindOneMock.mockResolvedValue(null);

    await syncTenantGeoCatalog({
      tenantId: 'tenant-1',
      itemSearchSnapshot: [{ item_name: 'Grilled Shrimp', in_stock_location_ids: [11] }]
    });

    expect(geoItemAliasCreateMock).toHaveBeenCalledWith({
      item_id: 42,
      alias_name: 'seafood',
      tenant_id: null,
      moderation_status: 'approved'
    });
  });

  it('promotes an existing non-approved alias instead of creating a duplicate', async () => {
    resolveItemIdMock.mockResolvedValue(42);
    const updateMock = jest.fn();
    geoItemAliasFindOneMock.mockResolvedValue({ moderation_status: 'pending', update: updateMock });

    await syncTenantGeoCatalog({
      tenantId: 'tenant-1',
      itemSearchSnapshot: [{ item_name: 'Grilled Shrimp', in_stock_location_ids: [11] }]
    });

    expect(updateMock).toHaveBeenCalledWith({ moderation_status: 'approved' });
    expect(geoItemAliasCreateMock).not.toHaveBeenCalled();
  });

  it('leaves an already-approved alias untouched', async () => {
    resolveItemIdMock.mockResolvedValue(42);
    const updateMock = jest.fn();
    geoItemAliasFindOneMock.mockResolvedValue({ moderation_status: 'approved', update: updateMock });

    await syncTenantGeoCatalog({
      tenantId: 'tenant-1',
      itemSearchSnapshot: [{ item_name: 'Grilled Shrimp', in_stock_location_ids: [11] }]
    });

    expect(updateMock).not.toHaveBeenCalled();
    expect(geoItemAliasCreateMock).not.toHaveBeenCalled();
  });

  it('does not add a category alias for an unrelated item', async () => {
    resolveItemIdMock.mockResolvedValue(9);
    geoItemAliasFindOneMock.mockResolvedValue(null);

    await syncTenantGeoCatalog({
      tenantId: 'tenant-1',
      itemSearchSnapshot: [{ item_name: 'Beef Steak', in_stock_location_ids: [11] }]
    });

    expect(geoItemAliasCreateMock).not.toHaveBeenCalled();
  });

  it('logs and continues when one item fails to resolve, without throwing', async () => {
    resolveItemIdMock
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(5);
    geoItemAliasFindOneMock.mockResolvedValue(null);

    await expect(syncTenantGeoCatalog({
      tenantId: 'tenant-1',
      itemSearchSnapshot: [
        { item_name: 'Broken Item', in_stock_location_ids: [] },
        { item_name: 'Second Item', in_stock_location_ids: [11] }
      ]
    })).resolves.toBeUndefined();

    expect(loggerWarnMock).toHaveBeenCalled();
    expect(upsertStoreItemMock).toHaveBeenCalledTimes(1);
  });
});
