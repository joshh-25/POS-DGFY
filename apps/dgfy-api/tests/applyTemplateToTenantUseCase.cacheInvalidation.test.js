import { jest } from '@jest/globals';

// Issue #178 Phase 22: applyTemplateToTenantUseCase committed its settings
// transaction and invalidated nothing, so the capability gate (15s TTL),
// the Store Profile resolver cache, and item-taxonomy validation's settings
// cache (5min TTL) all kept serving the pre-apply overlay - an admin
// applying a template would see it appear not to have taken effect. This
// file proves the wiring calls all three clears, separate from
// applyTemplateToTenantUseCase.test.js which exercises the real (unmocked)
// cache modules end-to-end and would not distinguish "never called" from
// "called but happened to be a no-op".
const settings = new Map();

const buildSystemSetting = () => ({
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
});

let SystemSetting = buildSystemSetting();

const WorkflowModeChangeLog = { create: jest.fn(async (row) => row) };

const tenantSequelize = {
    transaction: jest.fn(async (callback) => callback({ id: 'tx' }))
};

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        run: jest.fn(async (_context, callback) => callback()),
        get: jest.fn((key) => (key === 'SystemSetting' ? SystemSetting : WorkflowModeChangeLog))
    }
}));

jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
    getTenantModels: jest.fn(() => ({ SystemSetting, WorkflowModeChangeLog }))
}));

const clearWorkflowCapabilitySettingsCacheMock = jest.fn();
jest.unstable_mockModule('../src/modules/shared/utils/workflowCapabilitySettingsCache.js', () => ({
    clearWorkflowCapabilitySettingsCache: clearWorkflowCapabilitySettingsCacheMock
}));

const clearStoreProfileResolutionCacheMock = jest.fn();
jest.unstable_mockModule('../src/modules/settings/usecases/resolveStoreProfile.js', () => ({
    clearStoreProfileResolutionCache: clearStoreProfileResolutionCacheMock
}));

const clearItemRepositorySettingsCacheMock = jest.fn();
jest.unstable_mockModule('../src/modules/inventory/index.js', () => ({
    clearItemRepositorySettingsCache: clearItemRepositorySettingsCacheMock
}));

const { buildApplyTemplateToTenantUseCase } = await import(
    '../src/modules/tenants/usecases/applyTemplateToTenantUseCase.js'
);
const { storeConfigurationTemplateRepository } = await import('../src/modules/templates/index.js');
const { WORKFLOW_MODE_CAPABILITIES } = await import('../src/modules/shared/constants/workflowModes.js');

const buildTenant = (overrides = {}) => ({
    id: 'tenant-1',
    status: 'active',
    company_token: 'token-1',
    name: 'Tenant 1',
    db_name: 'tenant_1',
    ...overrides
});

const buildUseCase = () => {
    const tenantAdminRepository = {
        findTenantById: jest.fn().mockResolvedValue(buildTenant()),
        createTenantAdminAuditLog: jest.fn().mockResolvedValue({})
    };
    const tenantConnector = { getConnection: jest.fn().mockResolvedValue(tenantSequelize) };
    return buildApplyTemplateToTenantUseCase({
        tenantAdminRepository,
        tenantConnector,
        logger: { warn: jest.fn(), error: jest.fn() }
    });
};

describe('applyTemplateToTenantUseCase cache invalidation (issue #178 Phase 22)', () => {
    beforeEach(() => {
        settings.clear();
        SystemSetting = buildSystemSetting();
        clearWorkflowCapabilitySettingsCacheMock.mockClear();
        clearStoreProfileResolutionCacheMock.mockClear();
        clearItemRepositorySettingsCacheMock.mockClear();
        jest.restoreAllMocks();
    });

    it('clears the capability-gate, store-profile-resolver, and item-repository caches after a successful apply', async () => {
        jest.spyOn(storeConfigurationTemplateRepository, 'findByKey').mockResolvedValue({
            template_id: 42,
            template_key: 'retail_store',
            version: 2,
            status: 'published',
            base_mode: 'retail',
            modules: [...WORKFLOW_MODE_CAPABILITIES.retail]
        });

        const result = await buildUseCase()({
            id: 'tenant-1',
            body: { templateKey: 'retail_store', reason: 'Tenant switched to retail preset' },
            actor: { username: 'platform_admin' }
        });

        expect(result.success).toBe(true);
        expect(clearWorkflowCapabilitySettingsCacheMock).toHaveBeenCalledTimes(1);
        expect(clearStoreProfileResolutionCacheMock).toHaveBeenCalledTimes(1);
        expect(clearItemRepositorySettingsCacheMock).toHaveBeenCalledTimes(1);
    });

    it('does not clear any cache when the apply is rejected before a write (missing reason)', async () => {
        const result = await buildUseCase()({
            id: 'tenant-1',
            body: { templateKey: 'retail_store', reason: 'no' },
            actor: { username: 'platform_admin' }
        });

        expect(result.success).toBe(false);
        expect(clearWorkflowCapabilitySettingsCacheMock).not.toHaveBeenCalled();
        expect(clearStoreProfileResolutionCacheMock).not.toHaveBeenCalled();
        expect(clearItemRepositorySettingsCacheMock).not.toHaveBeenCalled();
    });

    it('rejects (and clears nothing) when the materialized selection is not buildable', async () => {
        // A template row that bypassed publish-time validation somehow (or a
        // catalog change since publish) and now resolves to an unbuildable
        // selection - pos requires catalog, and this template's modules
        // grant pos while omitting catalog entirely.
        jest.spyOn(storeConfigurationTemplateRepository, 'findByKey').mockResolvedValue({
            template_id: 5,
            template_key: 'broken_template',
            version: 1,
            status: 'published',
            base_mode: 'retail',
            modules: ['pos', 'storefront']
        });

        const result = await buildUseCase()({
            id: 'tenant-1',
            body: { templateKey: 'broken_template', reason: 'reason text' },
            actor: { username: 'platform_admin' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.details?.reason_code).toBe('CAPABILITY_SELECTION_UNBUILDABLE');
        expect(clearWorkflowCapabilitySettingsCacheMock).not.toHaveBeenCalled();
    });

    it('normalizes a corrupted/legacy template base_mode instead of persisting it verbatim', async () => {
        jest.spyOn(storeConfigurationTemplateRepository, 'findByKey').mockResolvedValue({
            template_id: 11,
            template_key: 'legacy_template',
            version: 1,
            status: 'published',
            base_mode: 'manufacturing', // legacy alias, not a current WORKFLOW_MODE_VALUES entry
            modules: [...WORKFLOW_MODE_CAPABILITIES.food_manufacturing]
        });

        const result = await buildUseCase()({
            id: 'tenant-1',
            body: { templateKey: 'legacy_template', reason: 'reason text' },
            actor: { username: 'platform_admin' }
        });

        expect(result.success).toBe(true);
        expect(settings.get('ops_workflow_mode')).toBe('food_manufacturing');
    });
});
