import { jest } from '@jest/globals';

const mockFindAllSettings = jest.fn();
const mockFindOneLocation = jest.fn();
const mockGetConnection = jest.fn();

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        run: (_context, callback) => callback(),
        get: (modelName) => {
            if (modelName === 'SystemSetting') {
                return {
                    findAll: mockFindAllSettings
                };
            }
            if (modelName === 'TenantLocation') {
                return {
                    rawAttributes: {
                        location_id: {},
                        name: {},
                        latitude: {},
                        longitude: {}
                    },
                    findOne: mockFindOneLocation
                };
            }
            return null;
        }
    }
}));

jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
    getTenantModels: () => ({})
}));

const { readTenantCapabilities } = await import('../src/modules/tenants/usecases/tenantCapabilitySettings.js');

describe('tenant capability readiness schema compatibility', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetConnection.mockResolvedValue({});
        mockFindAllSettings.mockResolvedValue([]);
        mockFindOneLocation.mockResolvedValue({
            get: () => ({
                location_id: 7,
                name: 'Main branch',
                latitude: '14.599512',
                longitude: '120.984222'
            })
        });
    });

    it('does not require optional storefront_last_synced_at on tenant_locations', async () => {
        const result = await readTenantCapabilities({
            tenant: {
                id: 'tenant-1',
                db_name: 'sku_tenant_1',
                company_token: 'token-1',
                name: 'Tenant 1'
            },
            tenantConnector: {
                getConnection: mockGetConnection
            }
        });

        expect(mockFindOneLocation).toHaveBeenCalledWith(expect.objectContaining({
            attributes: ['location_id', 'name', 'latitude', 'longitude']
        }));
        expect(result).toEqual(expect.objectContaining({
            ims_enabled: true,
            pos_enabled: true,
            storefront_visible: false,
            customer_access_mode: 'catalog',
            storefront_readiness: expect.objectContaining({
                has_active_primary_location: true,
                has_coordinates: true,
                publishable: true,
                visible_and_publishable: false,
                storefront_last_synced_at: null
            })
        }));
    });
});
