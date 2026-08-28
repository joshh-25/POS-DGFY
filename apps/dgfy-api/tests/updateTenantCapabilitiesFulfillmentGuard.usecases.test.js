import { jest } from '@jest/globals';

// #1093 follow-up (PR #1096 review, RF-1): the platform-admin tenant-capability path
// (PATCH /admin/tenants/:id/capabilities) is the one write path that can move BOTH
// customer_access_mode and its ceilings (platform_max_customer_access_mode, registration stage)
// in a single request -- confirms it's covered by the same both-methods-disabled guard as the
// tenant-facing settings paths. Mirrors updateTenantCapabilitiesUseCase.rollback.test.js's own
// mocking shape (in-memory settings Map, mocked dbStore/tenantModelFactory), extended with a
// mock TenantLocation model.

const settings = new Map();
const locations = [];
const runContexts = [];

const SystemSetting = {
    findAll: jest.fn(async ({ where }) => {
        const keys = Array.isArray(where?.setting_key) ? where.setting_key : [where?.setting_key];
        return keys
            .filter((key) => settings.has(key))
            .map((key) => ({ setting_key: key, setting_value: settings.get(key) }));
    }),
    findOne: jest.fn(async ({ where }) => {
        const key = where?.setting_key;
        if (!settings.has(key)) return null;
        return {
            setting_key: key,
            setting_value: settings.get(key),
            update: jest.fn(async ({ setting_value }) => {
                settings.set(key, setting_value);
            })
        };
    }),
    create: jest.fn(async ({ setting_key, setting_value }) => {
        settings.set(setting_key, setting_value);
    })
};

const TenantLocation = {
    findAll: jest.fn(async () => locations.map((location) => ({
        get: () => location
    }))),
    // readTenantCapabilities() -> buildStorefrontReadiness() calls this on every successful
    // write (for the refreshed capabilities response) -- unrelated to the guard itself, but
    // required for the success-path assertions below to actually reach 'success: true'.
    findOne: jest.fn(async () => null)
};

// Real Sequelize managed transactions auto-rollback every write made with the transaction
// handle when the callback throws -- simulated here (snapshot/restore around `settings`) so this
// mock actually proves the rollback the guard depends on, rather than assuming it.
const tenantSequelize = {
    transaction: jest.fn(async (callback) => {
        const snapshot = new Map(settings);
        try {
            return await callback({ id: 'tx' });
        } catch (error) {
            settings.clear();
            snapshot.forEach((value, key) => settings.set(key, value));
            throw error;
        }
    })
};

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        run: jest.fn(async (context, callback) => {
            runContexts.push(context);
            return callback();
        }),
        get: jest.fn((key) => {
            if (key === 'SystemSetting') return SystemSetting;
            if (key === 'TenantLocation') return TenantLocation;
            return null;
        })
    }
}));

jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
    getTenantModels: jest.fn(() => ({
        SystemSetting,
        TenantLocation
    }))
}));

const { buildUpdateTenantCapabilitiesUseCase } = await import(
    '../src/modules/tenants/usecases/updateTenantCapabilitiesUseCase.js'
);

const buildUseCase = () => {
    const tenantAdminRepository = {
        findTenantById: jest.fn().mockResolvedValue({
            id: 'tenant-1',
            status: 'active',
            company_token: 'token-1',
            name: 'Tenant 1',
            db_name: 'tenant_1'
        }),
        createTenantAdminAuditLog: jest.fn()
    };
    const tenantConnector = { getConnection: jest.fn().mockResolvedValue(tenantSequelize) };
    const syncStorefrontDiscoveryIndexForTenant = jest.fn().mockResolvedValue(undefined);
    return buildUpdateTenantCapabilitiesUseCase({
        tenantAdminRepository,
        tenantConnector,
        syncStorefrontDiscoveryIndexForTenant,
        logger: { error: jest.fn() }
    });
};

describe('update tenant capabilities -- fulfillment-method availability guard', () => {
    beforeEach(() => {
        settings.clear();
        settings.set('store_is_visible', 'false');
        settings.set('customer_access_mode', 'catalog');
        settings.set('platform_max_customer_access_mode', 'transaction');
        settings.set('tenant_onboarding_progress', JSON.stringify({
            step_payloads: {
                business_classification: {
                    legitimacy: { registration_status: 'registered' }
                }
            }
        }));
        locations.length = 0;
        runContexts.length = 0;
        jest.clearAllMocks();
    });

    it('rejects switching to Transaction mode while a location has neither delivery nor pickup enabled', async () => {
        locations.push({ location_id: 9, name: 'Both-Off Branch', supports_delivery: false, supports_pickup: false });
        const useCase = buildUseCase();

        const result = await useCase({
            id: 'tenant-1',
            body: { reason: 'Enable online ordering', customer_access_mode: 'transaction' },
            actor: { username: 'platform_admin' }
        });

        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(/Both-Off Branch/);
        // Rolled back -- the setting write must not have stuck.
        expect(settings.get('customer_access_mode')).toBe('catalog');
    });

    it('allows switching to Transaction mode when every location has a fulfillment method', async () => {
        locations.push({ location_id: 10, name: 'Delivery Branch', supports_delivery: true, supports_pickup: false });
        const useCase = buildUseCase();

        const result = await useCase({
            id: 'tenant-1',
            body: { reason: 'Enable online ordering', customer_access_mode: 'transaction' },
            actor: { username: 'platform_admin' }
        });

        expect(result.success).toBe(true);
        expect(settings.get('customer_access_mode')).toBe('transaction');
    });

    it('allows a both-off location while staying in Catalog Only mode', async () => {
        locations.push({ location_id: 11, name: 'Both-Off Branch', supports_delivery: false, supports_pickup: false });
        const useCase = buildUseCase();

        const result = await useCase({
            id: 'tenant-1',
            body: { reason: 'Toggle storefront visibility', storefront_visible: true },
            actor: { username: 'platform_admin' }
        });

        expect(result.success).toBe(true);
        expect(TenantLocation.findAll).not.toHaveBeenCalled();
    });
});
