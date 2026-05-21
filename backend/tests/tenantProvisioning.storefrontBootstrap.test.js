import { jest } from '@jest/globals';
import sequelize from '../src/config/database.js';
import dbStore from '../src/utils/dbStore.js';
import { Sequelize } from 'sequelize';

const mockTenantLocationCount = jest.fn();
const mockTenantLocationFindOne = jest.fn();
const mockTenantLocationCreate = jest.fn();
const mockSyncStorefrontDiscoveryWithReliability = jest.fn();
const mockAddEmailTenantMapping = jest.fn();

jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
    getTenantModels: jest.fn().mockImplementation(() => ({
        TenantLocation: {
            count: mockTenantLocationCount,
            findOne: mockTenantLocationFindOne,
            create: mockTenantLocationCreate
        }
    }))
}));

jest.unstable_mockModule('../src/services/storefrontDiscoverySyncReliabilityService.js', () => ({
    syncStorefrontDiscoveryWithReliability: mockSyncStorefrontDiscoveryWithReliability
}));

jest.unstable_mockModule('../src/services/landlordService.js', () => ({
    addEmailTenantMapping: mockAddEmailTenantMapping
}));

describe('tenantProvisioning storefront bootstrap defaults', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.STOREFRONT_DEFAULT_LOCATION_NAME = '  ';
        process.env.STOREFRONT_DEFAULT_LOCATION_ADDRESS = '';
        process.env.STOREFRONT_DEFAULT_LATITUDE = '999';
        process.env.STOREFRONT_DEFAULT_LONGITUDE = '-999';
        process.env.STOREFRONT_DEFAULT_DELIVERY_RADIUS_KM = '0';
        process.env.STOREFRONT_DEFAULT_WAIT_MINUTES = '9999';
        mockTenantLocationCount.mockResolvedValue(0);
        mockTenantLocationCreate.mockResolvedValue({ location_id: 77 });
        mockSyncStorefrontDiscoveryWithReliability.mockResolvedValue({
            ok: true,
            attempts: 1,
            reconciled: false
        });
        mockAddEmailTenantMapping.mockResolvedValue(true);
    });

    afterEach(() => {
        delete process.env.STOREFRONT_DEFAULT_LOCATION_NAME;
        delete process.env.STOREFRONT_DEFAULT_LOCATION_ADDRESS;
        delete process.env.STOREFRONT_DEFAULT_LATITUDE;
        delete process.env.STOREFRONT_DEFAULT_LONGITUDE;
        delete process.env.STOREFRONT_DEFAULT_DELIVERY_RADIUS_KM;
        delete process.env.STOREFRONT_DEFAULT_WAIT_MINUTES;
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        try { await sequelize.close(); } catch (_) {}
    });

    it('falls back to safe defaults and syncs discovery after provisioning', async () => {
        jest.spyOn(sequelize, 'query').mockResolvedValue([]);
        jest.spyOn(dbStore, 'get').mockReturnValue({
            update: jest.fn().mockResolvedValue([1])
        });

        jest.spyOn(Sequelize.prototype, 'sync').mockResolvedValue(undefined);
        jest.spyOn(Sequelize.prototype, 'query').mockResolvedValue([]);
        jest.spyOn(Sequelize.prototype, 'close').mockResolvedValue(undefined);

        const { provisionTenant } = await import('../src/services/tenantProvisioningService.js');

        const result = await provisionTenant({
            tenantId: 'tenant-bootstrap-test-id',
            name: 'Bootstrap Test Tenant',
            dbName: 'sku_tenant_bootstrap_abc123',
            companyToken: 'token-bootstrap-test',
            adminEmail: 'bootstrap@test.example.com',
            adminPasswordHash: '$2b$10$fakehashfakehashfakeh'
        });

        expect(result.status).toBe('active');
        expect(mockTenantLocationCreate).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Main Branch',
            address_line: 'Iloilo City',
            latitude: 10.699817,
            longitude: 122.559893,
            delivery_radius_km: 5,
            current_wait_time_minutes: 15,
            is_primary_storefront: true
        }));
        expect(mockSyncStorefrontDiscoveryWithReliability).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-bootstrap-test-id',
            source: 'tenant_provisioning_bootstrap'
        }));
    });
});
