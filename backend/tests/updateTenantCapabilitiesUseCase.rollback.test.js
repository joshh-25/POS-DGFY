import { jest } from '@jest/globals';

const settings = new Map();
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

const tenantSequelize = {
    transaction: jest.fn(async (callback) => callback({ id: 'tx' }))
};

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        run: jest.fn(async (context, callback) => {
            runContexts.push(context);
            return callback();
        }),
        get: jest.fn((key) => {
            if (key === 'SystemSetting') return SystemSetting;
            return null;
        })
    }
}));

jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
    getTenantModels: jest.fn(() => ({
        SystemSetting
    }))
}));

const { buildUpdateTenantCapabilitiesUseCase } = await import(
    '../src/modules/tenants/usecases/updateTenantCapabilitiesUseCase.js'
);

describe('update tenant capabilities rollback behavior', () => {
    beforeEach(() => {
        settings.clear();
        settings.set('store_is_visible', 'false');
        settings.set('customer_access_mode', 'catalog');
        settings.set('platform_max_customer_access_mode', 'catalog');
        runContexts.length = 0;
        jest.clearAllMocks();
    });

    it('rolls Storefront settings back and skips audit logging when discovery sync fails', async () => {
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
        const tenantConnector = {
            getConnection: jest.fn().mockResolvedValue(tenantSequelize)
        };
        const syncStorefrontDiscoveryIndexForTenant = jest.fn()
            .mockRejectedValueOnce(new Error('index service unavailable'))
            .mockResolvedValueOnce(undefined);
        const useCase = buildUpdateTenantCapabilitiesUseCase({
            tenantAdminRepository,
            tenantConnector,
            syncStorefrontDiscoveryIndexForTenant,
            logger: { error: jest.fn() }
        });

        const result = await useCase({
            id: 'tenant-1',
            body: {
                reason: 'Tenant requested temporary storefront pause',
                storefront_visible: true,
                customer_access_mode: 'transaction',
                platform_max_customer_access_mode: 'transaction'
            },
            actor: { username: 'platform_admin' }
        });

        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(/capability changes were rolled back/i);
        expect(settings.get('store_is_visible')).toBe('false');
        expect(settings.get('customer_access_mode')).toBe('catalog');
        expect(settings.get('platform_max_customer_access_mode')).toBe('catalog');
        expect(syncStorefrontDiscoveryIndexForTenant).toHaveBeenCalledTimes(2);
        expect(tenantAdminRepository.createTenantAdminAuditLog).not.toHaveBeenCalled();
        expect(runContexts).toHaveLength(2);
    });
});
