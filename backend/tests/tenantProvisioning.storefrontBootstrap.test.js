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

describe('tenantProvisioning storefront public visibility defaults', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        try { await sequelize.close(); } catch (_) {}
    });

    it('seeds public visibility off and syncs discovery without creating a default pin', async () => {
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
        expect(mockTenantLocationCreate).not.toHaveBeenCalled();
        expect(Sequelize.prototype.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO system_settings'),
            expect.objectContaining({
                replacements: expect.arrayContaining([
                    'store_is_visible',
                    false,
                    'boolean'
                ])
            })
        );
        const storeVisibilitySeedCall = Sequelize.prototype.query.mock.calls.find(([, options]) => (
            Array.isArray(options?.replacements)
            && options.replacements.includes('store_is_visible')
        ));
        expect(storeVisibilitySeedCall?.[0]).toContain('setting_value = VALUES(setting_value)');
        const onboardingProgressSeedCall = Sequelize.prototype.query.mock.calls.find(([, options]) => (
            Array.isArray(options?.replacements)
            && options.replacements.includes('tenant_onboarding_progress')
        ));
        const onboardingProgress = JSON.parse(onboardingProgressSeedCall?.[1]?.replacements?.[1] || '{}');
        expect(onboardingProgress.step_payloads.business_classification.legitimacy.registration_status).toBe('registered');
        expect(onboardingProgress.classification_snapshot.payload.legitimacy.registration_status).toBe('registered');
        expect(mockSyncStorefrontDiscoveryWithReliability).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-bootstrap-test-id',
            source: 'tenant_provisioning_bootstrap'
        }));
    });
});
