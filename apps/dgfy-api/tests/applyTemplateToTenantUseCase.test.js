import { jest } from '@jest/globals';

const settings = new Map();
const changeLogRows = [];
const runContexts = [];

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

const WorkflowModeChangeLog = {
    create: jest.fn(async (row) => {
        changeLogRows.push(row);
        return row;
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
            if (key === 'WorkflowModeChangeLog') return WorkflowModeChangeLog;
            return null;
        })
    }
}));

jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
    getTenantModels: jest.fn(() => ({ SystemSetting, WorkflowModeChangeLog }))
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

describe('applyTemplateToTenantUseCase (issue #178 Phase 17)', () => {
    beforeEach(() => {
        settings.clear();
        changeLogRows.length = 0;
        runContexts.length = 0;
        SystemSetting = buildSystemSetting();
        jest.restoreAllMocks();
    });

    const buildUseCase = ({ tenant = buildTenant(), logger = { warn: jest.fn(), error: jest.fn() } } = {}) => {
        const tenantAdminRepository = {
            findTenantById: jest.fn().mockResolvedValue(tenant),
            createTenantAdminAuditLog: jest.fn().mockResolvedValue({})
        };
        const tenantConnector = {
            getConnection: jest.fn().mockResolvedValue(tenantSequelize)
        };
        const useCase = buildApplyTemplateToTenantUseCase({ tenantAdminRepository, tenantConnector, logger });
        return { useCase, tenantAdminRepository, tenantConnector, logger };
    };

    it('applies a published canonical template: seeds empty overlays and stamps provenance', async () => {
        jest.spyOn(storeConfigurationTemplateRepository, 'findByKey').mockResolvedValue({
            template_id: 42,
            template_key: 'retail_store',
            version: 2,
            status: 'published',
            base_mode: 'retail',
            modules: [...WORKFLOW_MODE_CAPABILITIES.retail]
        });
        const { useCase, tenantAdminRepository } = buildUseCase();

        const result = await useCase({
            id: 'tenant-1',
            body: { templateKey: 'retail_store', reason: 'Tenant switched to retail preset' },
            actor: { username: 'platform_admin', user_id: 7 }
        });

        expect(result.success).toBe(true);
        expect(result.data.statusCode).toBe(200);
        expect(settings.get('ops_workflow_mode')).toBe('retail');
        // Canonical -> empty overlays, matching pre-Phase-17 default shape.
        expect(settings.get('ops_enabled_capabilities')).toBe('[]');
        expect(settings.get('ops_disabled_capabilities')).toBe('[]');
        const persistedProfile = JSON.parse(settings.get('ops_store_profile'));
        expect(persistedProfile.provenance).toEqual({
            source_template_id: 42,
            source_template_version: 2,
            diverged_from_source: false
        });

        expect(tenantAdminRepository.createTenantAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            tenant_id: 'tenant-1',
            action: 'apply_template',
            reason: 'Tenant switched to retail preset',
            metadata: expect.objectContaining({ template_key: 'retail_store', template_id: 42, template_version: 2 })
        }));
    });

    it('applies a non-canonical (subtractive) template and seeds the disabled overlay', async () => {
        jest.spyOn(storeConfigurationTemplateRepository, 'findByKey').mockResolvedValue({
            template_id: 9,
            template_key: 'fnb_counter_service',
            version: 1,
            status: 'published',
            base_mode: 'fnb',
            modules: WORKFLOW_MODE_CAPABILITIES.fnb.filter((key) => (
                !['tableService', 'kitchenQueue', 'restaurantServiceCharge'].includes(key)
            ))
        });
        const { useCase } = buildUseCase();

        const result = await useCase({
            id: 'tenant-1',
            body: { templateKey: 'fnb_counter_service', reason: 'Downgrading to counter service' },
            actor: { username: 'platform_admin' }
        });

        expect(result.success).toBe(true);
        expect(JSON.parse(settings.get('ops_disabled_capabilities')).sort()).toEqual(
            ['kitchenQueue', 'restaurantServiceCharge', 'tableService'].sort()
        );
        const persistedProfile = JSON.parse(settings.get('ops_store_profile'));
        expect(persistedProfile.modules).not.toContain('tableService');

        // Non-empty change -> audited in workflow_mode_change_log too.
        expect(changeLogRows).toHaveLength(1);
        expect(changeLogRows[0].to_disabled_capabilities.sort()).toEqual(
            ['kitchenQueue', 'restaurantServiceCharge', 'tableService'].sort()
        );
    });

    it('rejects an unknown tenant id', async () => {
        const { useCase } = buildUseCase({ tenant: null });
        const result = await useCase({
            id: 'missing',
            body: { templateKey: 'retail_store', reason: 'reason text' },
            actor: { username: 'platform_admin' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(404);
    });

    it('rejects a non-active tenant', async () => {
        const { useCase } = buildUseCase({ tenant: buildTenant({ status: 'pending' }) });
        const result = await useCase({
            id: 'tenant-1',
            body: { templateKey: 'retail_store', reason: 'reason text' },
            actor: { username: 'platform_admin' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    it('rejects a missing reason', async () => {
        const { useCase } = buildUseCase();
        const result = await useCase({
            id: 'tenant-1',
            body: { templateKey: 'retail_store', reason: 'no' },
            actor: { username: 'platform_admin' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    it('rejects a templateKey that does not resolve to any template', async () => {
        jest.spyOn(storeConfigurationTemplateRepository, 'findByKey').mockResolvedValue(null);
        const { useCase } = buildUseCase();

        const result = await useCase({
            id: 'tenant-1',
            body: { templateKey: 'not-a-real-key', reason: 'reason text' },
            actor: { username: 'platform_admin' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(404);
    });

    it('rejects a draft (unpublished) template', async () => {
        jest.spyOn(storeConfigurationTemplateRepository, 'findByKey').mockResolvedValue({
            template_id: 3,
            template_key: 'fnb_experimental',
            version: 1,
            status: 'draft',
            base_mode: 'fnb',
            modules: []
        });
        const { useCase } = buildUseCase();

        const result = await useCase({
            id: 'tenant-1',
            body: { templateKey: 'fnb_experimental', reason: 'reason text' },
            actor: { username: 'platform_admin' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.details?.reason_code).toBe('TEMPLATE_NOT_PUBLISHED');
    });
});
