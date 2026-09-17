import { jest } from '@jest/globals';

// Issue #1923: prove the capability-write contract end to end at the use-case
// level with the REAL read path (`readTenantCapabilities`) instead of only
// asserting the write side. A per-tenant in-memory settings backend stands in
// for the tenant database; the transaction, normalization, discovery-sync, and
// audit collaborators keep the same seams as the rollback suite.

let currentContext = null;

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        run: jest.fn(async (context, callback) => {
            const previous = currentContext;
            currentContext = context;
            try {
                return await callback();
            } finally {
                currentContext = previous;
            }
        }),
        get: jest.fn((modelName) => currentContext?.[modelName] ?? null)
    }
}));

jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
    getTenantModels: jest.fn((sequelize) => sequelize?.models ?? {})
}));

const { buildUpdateTenantCapabilitiesUseCase } = await import(
    '../src/modules/tenants/usecases/updateTenantCapabilitiesUseCase.js'
);
const { buildListTenantsUseCase } = await import(
    '../src/modules/tenants/usecases/listTenantsUseCase.js'
);
const { readTenantCapabilities } = await import(
    '../src/modules/tenants/usecases/tenantCapabilitySettings.js'
);

const makeTenantBackend = (initialSettings = {}) => {
    const store = new Map(Object.entries(initialSettings));
    const rowsFor = (keys) => keys
        .filter((key) => store.has(key))
        .map((key) => ({ setting_key: key, setting_value: store.get(key) }));
    const SystemSetting = {
        findAll: jest.fn(async ({ where } = {}) => {
            const keys = Array.isArray(where?.setting_key) ? where.setting_key : [where?.setting_key];
            return rowsFor(keys.filter(Boolean));
        }),
        findOne: jest.fn(async ({ where } = {}) => {
            const key = where?.setting_key;
            if (!store.has(key)) return null;
            return {
                setting_key: key,
                setting_value: store.get(key),
                update: jest.fn(async ({ setting_value }) => {
                    store.set(key, setting_value);
                })
            };
        }),
        create: jest.fn(async ({ setting_key, setting_value }) => {
            store.set(setting_key, setting_value);
        })
    };
    return {
        store,
        sequelize: {
            models: { SystemSetting, TenantLocation: null },
            transaction: jest.fn(async (callback) => callback({ id: 'tx' }))
        }
    };
};

const informalProgress = () => JSON.stringify({
    step_payloads: {
        business_classification: {
            legitimacy: { registration_status: 'informal' }
        }
    },
    classification_snapshot: {
        payload: {
            legitimacy: { registration_status: 'informal' }
        }
    }
});

const freshTenantRow = (id, name) => ({
    id,
    name,
    status: 'active',
    company_token: `token-${id}`,
    db_name: `db_${id}`
});

describe('tenant capability write durability and read-back (#1923)', () => {
    let backends;
    let tenantRows;
    let tenantAdminRepository;
    let tenantConnector;
    let syncStorefrontDiscoveryIndexForTenant;

    beforeEach(() => {
        backends = {
            'tenant-a': makeTenantBackend({
                tenant_ims_enabled: 'true',
                tenant_pos_enabled: 'true',
                store_is_visible: 'false',
                customer_access_mode: 'catalog',
                platform_max_customer_access_mode: 'transaction',
                tenant_onboarding_progress: informalProgress()
            }),
            'tenant-b': makeTenantBackend({
                tenant_ims_enabled: 'true',
                tenant_pos_enabled: 'true',
                store_is_visible: 'false',
                customer_access_mode: 'catalog',
                platform_max_customer_access_mode: 'transaction',
                tenant_onboarding_progress: informalProgress()
            })
        };
        tenantRows = {
            'tenant-a': freshTenantRow('tenant-a', 'Tenant A'),
            'tenant-b': freshTenantRow('tenant-b', 'Tenant B')
        };
        tenantAdminRepository = {
            findTenantById: jest.fn(async (id) => tenantRows[id] ?? null),
            listTenants: jest.fn(async () => [tenantRows['tenant-a'], tenantRows['tenant-b']]),
            createTenantAdminAuditLog: jest.fn()
        };
        tenantConnector = {
            getConnection: jest.fn(async (tenant) => backends[tenant.id].sequelize)
        };
        syncStorefrontDiscoveryIndexForTenant = jest.fn().mockResolvedValue(undefined);
        jest.clearAllMocks();
    });

    const buildUpdateUseCase = () => buildUpdateTenantCapabilitiesUseCase({
        tenantAdminRepository,
        tenantConnector,
        syncStorefrontDiscoveryIndexForTenant,
        logger: { error: jest.fn() }
    });

    it('returns the persisted storefront visibility and registration stage in the write response', async () => {
        const result = await buildUpdateUseCase()({
            id: 'tenant-a',
            body: {
                reason: 'Merchant requested public storefront launch with registered readiness',
                storefront_visible: true,
                customer_access_registration_stage: 'registered'
            },
            actor: { username: 'platform_admin' }
        });

        expect(result.success).toBe(true);
        const capabilities = result.data.payload.data.capabilities;
        expect(capabilities.storefront_visible).toBe(true);
        expect(capabilities.registration_stage).toBe('registered');
        expect(tenantAdminRepository.createTenantAdminAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'capability_update',
                after_snapshot: expect.objectContaining({
                    storefront_visible: true,
                    registration_stage: 'registered'
                })
            })
        );
    });

    it('surfaces the same persisted values through a fresh list-tenants read', async () => {
        const writeResult = await buildUpdateUseCase()({
            id: 'tenant-a',
            body: {
                reason: 'Merchant requested public storefront launch with registered readiness',
                storefront_visible: true,
                customer_access_registration_stage: 'registered'
            },
            actor: { username: 'platform_admin' }
        });
        expect(writeResult.success).toBe(true);

        const listUseCase = buildListTenantsUseCase({
            tenantAdminRepository,
            tenantConnector,
            readTenantCapabilities,
            logger: { warn: jest.fn(), error: jest.fn() }
        });
        const listResult = await listUseCase({ status: 'active' });

        expect(listResult.success).toBe(true);
        const enriched = listResult.data.payload.data.find((entry) => entry.id === 'tenant-a');
        expect(enriched.capabilities.storefront_visible).toBe(true);
        expect(enriched.capabilities.registration_stage).toBe('registered');
        expect(enriched.capabilities.unavailable).toBeUndefined();
    });

    it('does not leak one tenant write into another tenant read', async () => {
        const writeResult = await buildUpdateUseCase()({
            id: 'tenant-a',
            body: {
                reason: 'Merchant requested public storefront launch with registered readiness',
                storefront_visible: true,
                customer_access_registration_stage: 'registered'
            },
            actor: { username: 'platform_admin' }
        });
        expect(writeResult.success).toBe(true);
        expect(tenantConnector.getConnection).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'tenant-a' })
        );

        const neighbor = await readTenantCapabilities({
            tenant: tenantRows['tenant-b'],
            tenantConnector
        });
        expect(neighbor.storefront_visible).toBe(false);
        expect(neighbor.registration_stage).toBe('informal');

        const own = await readTenantCapabilities({
            tenant: tenantRows['tenant-a'],
            tenantConnector
        });
        expect(own.storefront_visible).toBe(true);
        expect(own.registration_stage).toBe('registered');
    });
});
