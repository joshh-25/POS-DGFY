import { jest } from '@jest/globals';

const mockTenantFindOne = jest.fn();
const mockTenantFindAll = jest.fn();
const mockIndexDestroy = jest.fn();
const mockIndexCreate = jest.fn();
const mockIndexCount = jest.fn();
const mockGetConnection = jest.fn();
const mockGetTenantModels = jest.fn();
const mockBumpCacheVersion = jest.fn();
const mockInvalidateSharedSignature = jest.fn();

jest.unstable_mockModule('../src/models/index.js', () => ({
    Tenant: {
        findOne: mockTenantFindOne,
        findAll: mockTenantFindAll
    },
    StorefrontDiscoveryIndex: {
        destroy: mockIndexDestroy,
        create: mockIndexCreate,
        count: mockIndexCount,
        findOne: jest.fn()
    }
}));

jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({
    default: {
        getConnection: mockGetConnection
    }
}));

jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
    getTenantModels: mockGetTenantModels
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
    default: {
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn()
    }
}));

jest.unstable_mockModule('../src/services/storefrontDiscoveryCacheState.js', () => ({
    bumpStorefrontDiscoveryCacheVersion: mockBumpCacheVersion
}));

jest.unstable_mockModule('../src/services/storefrontDiscoveryFreshnessService.js', () => ({
    invalidateStorefrontDiscoverySharedSignatureCache: mockInvalidateSharedSignature
}));

const {
    reconcileStorefrontDiscoveryIndex,
    syncStorefrontDiscoveryIndexForTenant
} = await import('../src/services/storefrontDiscoveryIndexService.js');

describe('storefrontDiscoveryIndexService catalog visibility', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockTenantFindOne.mockResolvedValue({
            id: 'tenant-1',
            name: 'Visibility Tenant',
            company_token: 'visibility-token',
            db_name: 'tenant_visibility',
            status: 'active'
        });
        mockGetConnection.mockResolvedValue({ name: 'tenant-connection' });
        mockIndexDestroy.mockResolvedValue(0);
        mockIndexCount.mockResolvedValue(0);
    });

    it('uses StorefrontCatalogOverride instead of POS override when building item_search_snapshot', async () => {
        const SystemSetting = {
            findAll: jest.fn().mockResolvedValue([
                { setting_key: 'store_is_visible', setting_value: 'true' },
                { setting_key: 'store_tenant_slug', setting_value: 'visibility-tenant' },
                { setting_key: 'ops_workflow_mode', setting_value: 'simple' }
            ])
        };
        const TenantLocation = {
            findAll: jest.fn().mockResolvedValue([
                {
                    location_id: 10,
                    name: 'Main',
                    address_line: 'Main Road',
                    latitude: 10.72,
                    longitude: 122.56,
                    is_active: true,
                    is_primary_storefront: true,
                    is_open: true
                }
            ])
        };
        const Item = {
            findAll: jest.fn().mockResolvedValue([
                {
                    item_id: 1,
                    name: 'Hidden Storefront Item',
                    sku_code: 'HIDE-1',
                    description: 'POS visible but storefront hidden',
                    category: 'product',
                    product_type: 'finished_goods',
                    current_stock: 5,
                    storefrontCatalogOverride: { storefront_visible: false },
                    posCatalogOverride: { pos_visible: true }
                },
                {
                    item_id: 2,
                    name: 'Public Storefront Item',
                    sku_code: 'SHOW-1',
                    description: 'Storefront visible even when POS hidden',
                    category: 'product',
                    product_type: 'finished_goods',
                    current_stock: 3,
                    storefrontCatalogOverride: { storefront_visible: true },
                    posCatalogOverride: { pos_visible: false }
                },
                {
                    item_id: 3,
                    name: 'Aircon Cleaning',
                    sku_code: 'SVC-AIRCON',
                    description: 'Indoor unit service',
                    category: 'service',
                    product_type: 'service',
                    current_stock: 0,
                    storefrontCatalogOverride: { storefront_visible: true },
                    posCatalogOverride: { pos_visible: false },
                    serviceDetail: {
                        bookable: true,
                        visible_in_storefront: true,
                        service_category: 'Cooling and Air Conditioning',
                        service_area_type: 'customer_location'
                    }
                }
            ])
        };
        const ItemLocationStock = {
            findAll: jest.fn().mockResolvedValue([
                { item_id: 2, location_id: 10, quantity_on_hand: 3 }
            ])
        };
        mockGetTenantModels.mockReturnValue({
            SystemSetting,
            TenantLocation,
            Item,
            PosCatalogOverride: { name: 'PosCatalogOverride' },
            StorefrontCatalogOverride: { name: 'StorefrontCatalogOverride' },
            ServiceItemDetail: { name: 'ServiceItemDetail' },
            ItemLocationStock
        });

        const result = await syncStorefrontDiscoveryIndexForTenant({ tenantId: 'tenant-1' });

        expect(result.status).toBe('upserted');
        expect(Item.findAll.mock.calls[0]?.[0]?.include).toEqual(expect.arrayContaining([
            expect.objectContaining({ as: 'storefrontCatalogOverride' }),
            expect.objectContaining({
                as: 'serviceDetail',
                attributes: expect.arrayContaining(['service_category', 'service_area_type'])
            })
        ]));
        expect(mockIndexCreate).toHaveBeenCalledTimes(1);
        const snapshot = mockIndexCreate.mock.calls[0][0];
        expect(snapshot.catalog_count).toBe(2);
        expect(snapshot.item_search_snapshot).toEqual(expect.arrayContaining([
            expect.objectContaining({
                item_id: 2,
                item_name: 'Public Storefront Item',
                matching_location_ids: [10],
                in_stock_location_ids: [10]
            }),
            expect.objectContaining({
                item_id: 3,
                item_name: 'Aircon Cleaning',
                matching_location_ids: [10],
                in_stock_location_ids: [10]
            })
        ]));
        const publicProductSnapshot = snapshot.item_search_snapshot.find((entry) => entry.item_id === 2);
        const serviceSnapshot = snapshot.item_search_snapshot.find((entry) => entry.item_id === 3);
        expect(publicProductSnapshot.text).toContain('show 1');
        expect(publicProductSnapshot.text).toContain('finished goods');
        expect(serviceSnapshot.text).toContain('cooling and air conditioning');
        expect(serviceSnapshot.text).toContain('customer location');
        expect(serviceSnapshot.text).toContain('aircon');
    });

    it('supports dry-run reconciliation without writing index rows', async () => {
        mockTenantFindAll.mockResolvedValue([
            {
                id: 'tenant-1',
                name: 'Dry Run Tenant',
                company_token: 'dry-run-token',
                db_name: 'tenant_dry_run',
                status: 'active'
            }
        ]);
        const SystemSetting = {
            findAll: jest.fn().mockResolvedValue([
                { setting_key: 'store_is_visible', setting_value: 'true' },
                { setting_key: 'store_tenant_slug', setting_value: 'dry-run-tenant' },
                { setting_key: 'ops_workflow_mode', setting_value: 'simple' }
            ])
        };
        const TenantLocation = {
            findAll: jest.fn().mockResolvedValue([
                {
                    location_id: 10,
                    name: 'Main',
                    address_line: 'Main Road',
                    latitude: 10.72,
                    longitude: 122.56,
                    is_active: true,
                    is_primary_storefront: true,
                    is_open: true
                }
            ])
        };
        const Item = {
            findAll: jest.fn().mockResolvedValue([
                {
                    item_id: 2,
                    name: 'Public Storefront Item',
                    sku_code: 'SHOW-1',
                    description: 'Storefront visible',
                    category: 'product',
                    product_type: 'finished_goods',
                    current_stock: 3,
                    storefrontCatalogOverride: { storefront_visible: true }
                }
            ])
        };
        const ItemLocationStock = {
            findAll: jest.fn().mockResolvedValue([
                { item_id: 2, location_id: 10, quantity_on_hand: 3 }
            ])
        };
        mockGetTenantModels.mockReturnValue({
            SystemSetting,
            TenantLocation,
            Item,
            PosCatalogOverride: null,
            StorefrontCatalogOverride: { name: 'StorefrontCatalogOverride' },
            ServiceItemDetail: null,
            ItemLocationStock
        });

        const result = await reconcileStorefrontDiscoveryIndex({
            tenantIds: ['tenant-1'],
            pruneStale: false,
            dryRun: true
        });

        expect(result.status).toBe('healthy');
        expect(result.dryRun).toBe(true);
        expect(result.upserted).toBe(1);
        expect(mockIndexDestroy).not.toHaveBeenCalled();
        expect(mockIndexCreate).not.toHaveBeenCalled();
        expect(mockBumpCacheVersion).not.toHaveBeenCalled();
        expect(mockInvalidateSharedSignature).not.toHaveBeenCalled();
    });
});
