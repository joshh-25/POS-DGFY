import { jest } from '@jest/globals';

const mockTenantFindOne = jest.fn();
const mockTenantFindAll = jest.fn();
const mockIndexDestroy = jest.fn();
const mockIndexCreate = jest.fn();
const mockIndexCount = jest.fn();
const mockGetConnection = jest.fn();
const mockOpenEphemeralConnection = jest.fn();
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
        findOne: jest.fn(),
        // The index row rewrite runs destroy+create inside a transaction so a
        // mid-flight failure can't drop a live store from the index. Run the
        // callback straight through with a stub transaction handle.
        sequelize: { transaction: jest.fn(async (fn) => fn('test-transaction')) }
    },
    StorefrontHandleReservation: {
        findOne: jest.fn(),
        create: jest.fn()
    }
}));

jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({
    default: {
        getConnection: mockGetConnection,
        // reconcileStorefrontDiscoveryIndex's bulk sweep uses this instead of
        // getConnection (#524/#527) -- see storefrontDiscoveryIndexService.js's
        // buildTenantSnapshot doc comment.
        openEphemeralConnection: mockOpenEphemeralConnection
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

jest.unstable_mockModule('../src/modules/geoSearch/services/geoCatalogSyncService.js', () => ({
    syncTenantGeoCatalog: jest.fn().mockResolvedValue(undefined)
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
        mockOpenEphemeralConnection.mockResolvedValue({
            name: 'ephemeral-tenant-connection',
            close: jest.fn().mockResolvedValue(undefined)
        });
        mockIndexDestroy.mockResolvedValue(0);
        mockIndexCount.mockResolvedValue(0);
    });

    it('keeps no-location map fields null while projecting active-primary fulfillment support', async () => {
        const SystemSetting = {
            findAll: jest.fn().mockResolvedValue([
                { setting_key: 'store_is_visible', setting_value: 'true' },
                { setting_key: 'store_has_no_location', setting_value: 'true' },
                { setting_key: 'store_tenant_slug', setting_value: 'no-location-capability' },
                { setting_key: 'ops_workflow_mode', setting_value: 'simple' }
            ])
        };
        mockGetTenantModels.mockReturnValue({
            SystemSetting,
            TenantLocation: { findAll: jest.fn().mockResolvedValue([{
                location_id: 10,
                name: 'Hidden map branch',
                address_line: 'Main Road',
                latitude: 10.72,
                longitude: 122.56,
                is_active: true,
                is_primary_storefront: true,
                supports_delivery: true,
                supports_pickup: false,
                supports_dine_in: false
            }]) },
            Item: { findAll: jest.fn().mockResolvedValue([]) },
            PosCatalogOverride: null,
            StorefrontCatalogOverride: { name: 'StorefrontCatalogOverride' },
            ServiceItemDetail: null,
            ItemLocationStock: { findAll: jest.fn().mockResolvedValue([]) }
        });

        const result = await syncStorefrontDiscoveryIndexForTenant({ tenantId: 'tenant-1' });

        expect(result.status).toBe('upserted');
        expect(mockIndexCreate.mock.calls[0][0]).toEqual(expect.objectContaining({
            location_id: null,
            latitude: null,
            longitude: null,
            supports_delivery: true,
            supports_pickup: false,
            supports_dine_in: false,
            active_location_snapshot: [expect.objectContaining({ location_id: 10, supports_pickup: false })]
        }));
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
                },
                {
                    location_id: 11,
                    name: 'Branch',
                    address_line: 'Branch Road',
                    latitude: 10.73,
                    longitude: 122.57,
                    is_active: true,
                    is_primary_storefront: false,
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
                { item_id: 2, location_id: 10, quantity_on_hand: 3 },
                { item_id: 2, location_id: 11, quantity_on_hand: 3 }
            ])
        };
        const StorefrontLocationItemOverride = {
            findAll: jest.fn().mockResolvedValue([
                { item_id: 2, location_id: 11, storefront_available: false }
            ])
        };
        mockGetTenantModels.mockReturnValue({
            SystemSetting,
            TenantLocation,
            Item,
            PosCatalogOverride: { name: 'PosCatalogOverride' },
            StorefrontCatalogOverride: { name: 'StorefrontCatalogOverride' },
            StorefrontLocationItemOverride,
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
                matching_location_ids: [10, 11],
                in_stock_location_ids: [10, 11]
            })
        ]));
        expect(StorefrontLocationItemOverride.findAll).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                item_id: expect.any(Object),
                location_id: expect.any(Object)
            })
        }));
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

    it('falls back to global stock when item_location_stocks is missing during index sync', async () => {
        const SystemSetting = {
            findAll: jest.fn().mockResolvedValue([
                { setting_key: 'store_is_visible', setting_value: 'true' },
                { setting_key: 'store_tenant_slug', setting_value: 'location-stock-fallback' },
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
            findAll: jest.fn().mockRejectedValue({
                original: {
                    code: 'ER_NO_SUCH_TABLE',
                    sqlMessage: "Table 'tenant_db.item_location_stocks' doesn't exist"
                }
            })
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

        const result = await syncStorefrontDiscoveryIndexForTenant({ tenantId: 'tenant-1' });

        expect(result.status).toBe('upserted');
        const snapshot = mockIndexCreate.mock.calls[0][0];
        expect(snapshot.item_search_snapshot).toEqual([
            expect.objectContaining({
                item_id: 2,
                matching_location_ids: [10],
                in_stock_location_ids: [10]
            })
        ]);
    });

    it('marks discovery rows closed when storefront business hours are closed', async () => {
        const closedWeeklySchedule = {
            mode: 'weekly',
            timezone: 'Asia/Manila',
            weekly: {
                sun: { enabled: false, open: '09:00', close: '18:00' },
                mon: { enabled: false, open: '09:00', close: '18:00' },
                tue: { enabled: false, open: '09:00', close: '18:00' },
                wed: { enabled: false, open: '09:00', close: '18:00' },
                thu: { enabled: false, open: '09:00', close: '18:00' },
                fri: { enabled: false, open: '09:00', close: '18:00' },
                sat: { enabled: false, open: '09:00', close: '18:00' }
            }
        };
        const SystemSetting = {
            findAll: jest.fn().mockResolvedValue([
                { setting_key: 'store_is_visible', setting_value: 'true' },
                { setting_key: 'store_tenant_slug', setting_value: 'closed-by-hours' },
                { setting_key: 'ops_workflow_mode', setting_value: 'simple' },
                { setting_key: 'pos_open_status', setting_value: 'true' },
                { setting_key: 'storefront_hours', setting_value: JSON.stringify(closedWeeklySchedule) }
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

        const result = await syncStorefrontDiscoveryIndexForTenant({ tenantId: 'tenant-1' });

        expect(result.status).toBe('upserted');
        const snapshot = mockIndexCreate.mock.calls[0][0];
        expect(snapshot.storefront_open).toBe(false);
        expect(snapshot.storefront_hours).toBe('Closed');
    });

    // #713: a voucher must be BOTH is_publicly_listed AND storefront-channel-eligible to appear in
    // storefront_vouchers -- neither condition alone is sufficient. Channel is enforced by
    // evaluateVoucherEligibility (mirrors the code-in/price-out display path's own convention), not
    // re-implemented here.
    it('lists only active, publicly-listed, storefront-eligible vouchers', async () => {
        const SystemSetting = {
            findAll: jest.fn().mockResolvedValue([
                { setting_key: 'store_is_visible', setting_value: 'true' },
                { setting_key: 'store_has_no_location', setting_value: 'true' },
                { setting_key: 'store_tenant_slug', setting_value: 'voucher-listing-tenant' },
                { setting_key: 'ops_workflow_mode', setting_value: 'simple' }
            ])
        };
        const Item = { findAll: jest.fn().mockResolvedValue([]) };
        const ItemLocationStock = { findAll: jest.fn().mockResolvedValue([]) };
        const Voucher = {
            findAll: jest.fn().mockResolvedValue([
                {
                    voucher_id: 1,
                    code: 'GRACEOFFER',
                    title: 'Grace Offer',
                    subtitle: '10% off',
                    badge: 'Popular',
                    validity_text: 'While supplies last',
                    benefit_class: 'percent_off',
                    percent_off_bps: 1000,
                    status: 'active',
                    channels_mask: 3,
                    weekday_mask: 127,
                    valid_from: null,
                    valid_until: null,
                    valid_time_start: null,
                    valid_time_end: null,
                    is_publicly_listed: true
                },
                // Publicly listed but POS-only -- must NOT appear on the storefront listing.
                {
                    voucher_id: 2,
                    code: 'INSTOREONLY',
                    title: 'In-store only',
                    subtitle: '',
                    badge: '',
                    validity_text: '',
                    benefit_class: 'amount_off',
                    percent_off_bps: null,
                    status: 'active',
                    channels_mask: 2,
                    weekday_mask: 127,
                    valid_from: null,
                    valid_until: null,
                    valid_time_start: null,
                    valid_time_end: null,
                    is_publicly_listed: true
                }
                // A third, non-listed voucher is deliberately absent from this fixture entirely --
                // the WHERE clause itself (is_publicly_listed: true) is what excludes it, not this
                // function's own filtering, so there's nothing to assert about it here.
            ])
        };
        mockGetTenantModels.mockReturnValue({
            SystemSetting,
            TenantLocation: { findAll: jest.fn().mockResolvedValue([]) },
            Item,
            PosCatalogOverride: null,
            StorefrontCatalogOverride: { name: 'StorefrontCatalogOverride' },
            ServiceItemDetail: null,
            ItemLocationStock,
            Voucher
        });

        const result = await syncStorefrontDiscoveryIndexForTenant({ tenantId: 'tenant-1' });

        expect(result.status).toBe('upserted');
        expect(Voucher.findAll).toHaveBeenCalledWith(expect.objectContaining({
            where: { status: 'active', is_publicly_listed: true }
        }));
        const snapshot = mockIndexCreate.mock.calls[0][0];
        expect(snapshot.storefront_vouchers).toEqual([
            expect.objectContaining({ id: 1, code: 'GRACEOFFER', title: 'Grace Offer', percent_off_bps: 1000 })
        ]);
    });

    it('omits storefront_vouchers without failing the whole snapshot when the Voucher model is unavailable', async () => {
        const SystemSetting = {
            findAll: jest.fn().mockResolvedValue([
                { setting_key: 'store_is_visible', setting_value: 'true' },
                { setting_key: 'store_has_no_location', setting_value: 'true' },
                { setting_key: 'store_tenant_slug', setting_value: 'no-voucher-model-tenant' },
                { setting_key: 'ops_workflow_mode', setting_value: 'simple' }
            ])
        };
        mockGetTenantModels.mockReturnValue({
            SystemSetting,
            TenantLocation: { findAll: jest.fn().mockResolvedValue([]) },
            Item: { findAll: jest.fn().mockResolvedValue([]) },
            PosCatalogOverride: null,
            StorefrontCatalogOverride: { name: 'StorefrontCatalogOverride' },
            ServiceItemDetail: null,
            ItemLocationStock: { findAll: jest.fn().mockResolvedValue([]) }
            // Voucher deliberately omitted -- same shape a tenant DB predating this feature would have.
        });

        const result = await syncStorefrontDiscoveryIndexForTenant({ tenantId: 'tenant-1' });

        expect(result.status).toBe('upserted');
        const snapshot = mockIndexCreate.mock.calls[0][0];
        expect(snapshot.storefront_vouchers).toEqual([]);
    });
});
