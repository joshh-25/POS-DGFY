import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/models/index.js', () => ({
    Tenant: { findAll: jest.fn() },
    StorefrontDiscoveryIndex: { findOne: jest.fn() }
}));

jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({
    default: { getConnection: jest.fn() }
}));

jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
    getTenantModels: jest.fn()
}));

const { auditStorefrontPublicVisibility } = await import('../src/services/storefrontPublicVisibilityAuditService.js');

const buildTenant = (id, name = id) => ({
    id,
    name,
    db_name: `db_${id}`,
    status: 'active'
});

const buildHarness = ({ tenants, indexRows = {}, settings = {}, locations = {} }) => {
    const tenantModel = {
        findAll: jest.fn().mockResolvedValue(tenants)
    };
    const indexModel = {
        findOne: jest.fn(async ({ where }) => indexRows[where.tenant_id] || null)
    };
    const tenantConnectorService = {
        getConnection: jest.fn(async (tenant) => ({ tenantId: tenant.id }))
    };
    const queryByTenant = {};
    const tenantModelFactory = jest.fn((connection) => ({
        __queryByTenant: queryByTenant,
        SystemSetting: {
            findAll: jest.fn(async () => {
                if (!Object.prototype.hasOwnProperty.call(settings, connection.tenantId)) {
                    return [];
                }
                const tenantSettings = settings[connection.tenantId];
                if (tenantSettings && typeof tenantSettings === 'object' && !Array.isArray(tenantSettings)) {
                    return Object.entries(tenantSettings).map(([setting_key, setting_value]) => ({
                        setting_key,
                        setting_value,
                        data_type: 'boolean'
                    }));
                }
                return [{
                    setting_key: 'store_is_visible',
                    setting_value: tenantSettings,
                    data_type: 'boolean'
                }];
            })
        },
        TenantLocation: {
            findAll: jest.fn(async () => locations[connection.tenantId] || [])
        }
    }));
    tenantConnectorService.getConnection = jest.fn(async (tenant) => ({
        tenantId: tenant.id,
        query: queryByTenant[tenant.id] || (queryByTenant[tenant.id] = jest.fn())
    }));

    return {
        tenantModel,
        indexModel,
        tenantConnectorService,
        tenantModelFactory,
        queryByTenant
    };
};

describe('storefrontPublicVisibilityAuditService', () => {
    it('flags hidden tenants that still have discovery index rows', async () => {
        const tenant = buildTenant('tenant-hidden');
        const harness = buildHarness({
            tenants: [tenant],
            settings: { 'tenant-hidden': 'false' },
            indexRows: {
                'tenant-hidden': { tenant_id: 'tenant-hidden', is_visible: true, location_id: 1, slug: 'hidden' }
            },
            locations: {
                'tenant-hidden': [{ location_id: 1, is_active: true, is_primary_storefront: true, latitude: 10, longitude: 122 }]
            }
        });

        const result = await auditStorefrontPublicVisibility(harness);

        expect(result.status).toBe('critical');
        expect(result.summary.issue_counts.hidden_tenant_indexed).toBe(1);
        expect(result.tenants[0].issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'hidden_tenant_indexed', severity: 'critical' })
        ]));
    });

    it('flags indexed tenants with missing explicit visibility settings', async () => {
        const tenant = buildTenant('tenant-missing');
        const harness = buildHarness({
            tenants: [tenant],
            indexRows: {
                'tenant-missing': { tenant_id: 'tenant-missing', is_visible: true, location_id: 1, slug: 'missing' }
            },
            locations: {
                'tenant-missing': [{ location_id: 1, is_active: true, is_primary_storefront: true, latitude: 10, longitude: 122 }]
            }
        });

        const result = await auditStorefrontPublicVisibility(harness);

        expect(result.status).toBe('critical');
        expect(result.summary.issue_counts.missing_store_is_visible_setting).toBe(1);
    });

    it('warns when visible tenants have no active primary storefront pin', async () => {
        const tenant = buildTenant('tenant-no-primary');
        const harness = buildHarness({
            tenants: [tenant],
            settings: { 'tenant-no-primary': 'true' },
            locations: {
                'tenant-no-primary': [{ location_id: 7, is_active: true, is_primary_storefront: false, latitude: 10, longitude: 122 }]
            }
        });

        const result = await auditStorefrontPublicVisibility(harness);

        expect(result.status).toBe('warning');
        expect(result.summary.issue_counts.visible_without_active_primary_pin).toBe(1);
    });

    it('warns when discovery publishes an active non-primary fallback location', async () => {
        const tenant = buildTenant('tenant-fallback');
        const harness = buildHarness({
            tenants: [tenant],
            settings: { 'tenant-fallback': 'true' },
            indexRows: {
                'tenant-fallback': { tenant_id: 'tenant-fallback', is_visible: true, location_id: 2, slug: 'fallback' }
            },
            locations: {
                'tenant-fallback': [
                    { location_id: 1, is_active: true, is_primary_storefront: true, latitude: 10, longitude: 122 },
                    { location_id: 2, is_active: true, is_primary_storefront: false, latitude: 10.1, longitude: 122.1 }
                ]
            }
        });

        const result = await auditStorefrontPublicVisibility(harness);

        expect(result.status).toBe('warning');
        expect(result.summary.issue_counts.fallback_location_publication).toBe(1);
    });

    it('treats explicitly hidden unindexed tenants and visible indexed primary tenants as healthy', async () => {
        const hidden = buildTenant('tenant-hidden-ok');
        const visible = buildTenant('tenant-visible-ok');
        const harness = buildHarness({
            tenants: [hidden, visible],
            settings: {
                'tenant-hidden-ok': 'false',
                'tenant-visible-ok': 'true'
            },
            indexRows: {
                'tenant-visible-ok': { tenant_id: 'tenant-visible-ok', is_visible: true, location_id: 4, slug: 'visible' }
            },
            locations: {
                'tenant-hidden-ok': [],
                'tenant-visible-ok': [{ location_id: 4, is_active: true, is_primary_storefront: true, latitude: 10, longitude: 122 }]
            }
        });

        const result = await auditStorefrontPublicVisibility(harness);

        expect(result.status).toBe('healthy');
        expect(result.summary.healthy).toBe(2);
        expect(result.summary.critical).toBe(0);
        expect(result.summary.warning).toBe(0);
    });

    it('treats visible no-location tenants with nullable discovery coordinates as healthy', async () => {
        const tenant = buildTenant('tenant-no-location-ok');
        const harness = buildHarness({
            tenants: [tenant],
            settings: {
                'tenant-no-location-ok': {
                    store_is_visible: 'true',
                    store_has_no_location: 'true'
                }
            },
            indexRows: {
                'tenant-no-location-ok': {
                    tenant_id: 'tenant-no-location-ok',
                    is_visible: true,
                    location_id: null,
                    latitude: null,
                    longitude: null,
                    slug: 'no-location'
                }
            },
            locations: {
                'tenant-no-location-ok': [{ location_id: 4, is_active: true, is_primary_storefront: true, latitude: 10, longitude: 122 }]
            }
        });

        const result = await auditStorefrontPublicVisibility(harness);

        expect(result.status).toBe('healthy');
        expect(result.summary.healthy).toBe(1);
        expect(result.tenants[0]).toEqual(expect.objectContaining({
            store_has_no_location: true,
            discovery_location_id: null
        }));
    });

    it('flags no-location tenants that still publish map coordinates', async () => {
        const tenant = buildTenant('tenant-no-location-map');
        const harness = buildHarness({
            tenants: [tenant],
            settings: {
                'tenant-no-location-map': {
                    store_is_visible: 'true',
                    store_has_no_location: 'true'
                }
            },
            indexRows: {
                'tenant-no-location-map': {
                    tenant_id: 'tenant-no-location-map',
                    is_visible: true,
                    location_id: 9,
                    latitude: 10,
                    longitude: 122,
                    slug: 'no-location-map'
                }
            },
            locations: {
                'tenant-no-location-map': [{ location_id: 9, is_active: true, is_primary_storefront: true, latitude: 10, longitude: 122 }]
            }
        });

        const result = await auditStorefrontPublicVisibility(harness);

        expect(result.status).toBe('critical');
        expect(result.summary.issue_counts.no_location_store_indexed_with_coordinates).toBe(1);
    });

    it('can repair missing visibility settings by preserving current index visibility', async () => {
        const tenant = buildTenant('tenant-repair');
        const harness = buildHarness({
            tenants: [tenant],
            indexRows: {
                'tenant-repair': { tenant_id: 'tenant-repair', is_visible: true, location_id: 1, slug: 'repair' }
            },
            locations: {
                'tenant-repair': [{ location_id: 1, is_active: true, is_primary_storefront: true, latitude: 10, longitude: 122 }]
            }
        });

        const result = await auditStorefrontPublicVisibility({
            ...harness,
            repairMissingSettings: true
        });

        expect(result.status).toBe('warning');
        expect(result.summary.issue_counts.repaired_missing_store_is_visible_setting).toBe(1);
        expect(result.tenants[0].store_is_visible).toBe(true);
        expect(result.tenants[0].store_is_visible_repaired).toBe(true);
        expect(harness.queryByTenant['tenant-repair']).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO system_settings'),
            expect.objectContaining({
                replacements: expect.arrayContaining(['store_is_visible', 'true'])
            })
        );
    });
});
