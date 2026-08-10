import { jest } from '@jest/globals';

let currentRows = [];
let findAllMock;
let tenantId = 'tenant-a';

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: () => ({ findAll: findAllMock }),
        getStore: () => ({ tenantId })
    }
}));

const {
    resolveWorkflowCapabilitySettings,
    clearWorkflowCapabilitySettingsCache
} = await import('../src/modules/shared/utils/workflowCapabilitySettingsCache.js');

const setRows = (rows) => {
    currentRows = rows;
    findAllMock = jest.fn().mockResolvedValue(currentRows);
};

describe('workflowCapabilitySettingsCache', () => {
    beforeEach(() => {
        clearWorkflowCapabilitySettingsCache();
        tenantId = 'tenant-a';
        setRows([]);
    });

    it('defaults to the platform default mode and an empty overlay when no settings exist', async () => {
        const result = await resolveWorkflowCapabilitySettings();
        expect(result.mode).toBe('food_manufacturing');
        expect(result.enabledCapabilities).toEqual([]);
        expect(result.disabledCapabilities).toEqual([]);
        expect(result.readFlagEnabled).toBe(false);
    });

    it('parses the disabled-capabilities overlay and the store-profile-read flag (issue #178 Phase 16/19)', async () => {
        setRows([
            { setting_key: 'ops_workflow_mode', setting_value: 'fnb', data_type: 'string' },
            { setting_key: 'ops_disabled_capabilities', setting_value: JSON.stringify(['tableService']), data_type: 'json' },
            { setting_key: 'ops_store_profile_read', setting_value: 'true', data_type: 'boolean' }
        ]);

        const result = await resolveWorkflowCapabilitySettings();
        expect(result.disabledCapabilities).toEqual(['tableService']);
        expect(result.readFlagEnabled).toBe(true);
        expect(findAllMock).toHaveBeenCalledTimes(1);
    });

    it('parses both settings from a single query', async () => {
        setRows([
            { setting_key: 'ops_workflow_mode', setting_value: 'retail', data_type: 'string' },
            { setting_key: 'ops_enabled_capabilities', setting_value: JSON.stringify(['services', 'fnbDining']), data_type: 'json' }
        ]);

        const result = await resolveWorkflowCapabilitySettings();
        expect(result.mode).toBe('retail');
        expect(result.enabledCapabilities).toEqual(['services', 'fnbDining']);
        expect(findAllMock).toHaveBeenCalledTimes(1);
    });

    it('drops unknown capability strings from a stored overlay', async () => {
        setRows([
            { setting_key: 'ops_enabled_capabilities', setting_value: JSON.stringify(['services', 'stale-decommissioned-capability']), data_type: 'json' }
        ]);

        const result = await resolveWorkflowCapabilitySettings();
        expect(result.enabledCapabilities).toEqual(['services']);
    });

    it('caches within the TTL window: a second call does not re-query', async () => {
        setRows([{ setting_key: 'ops_workflow_mode', setting_value: 'retail', data_type: 'string' }]);

        await resolveWorkflowCapabilitySettings();
        await resolveWorkflowCapabilitySettings();

        expect(findAllMock).toHaveBeenCalledTimes(1);
    });

    it('isolates the cache per tenant', async () => {
        setRows([{ setting_key: 'ops_workflow_mode', setting_value: 'retail', data_type: 'string' }]);
        const first = await resolveWorkflowCapabilitySettings();
        expect(first.mode).toBe('retail');

        tenantId = 'tenant-b';
        setRows([{ setting_key: 'ops_workflow_mode', setting_value: 'services', data_type: 'string' }]);
        const second = await resolveWorkflowCapabilitySettings();
        expect(second.mode).toBe('services');
        expect(findAllMock).toHaveBeenCalledTimes(1);
    });

    it('re-queries after the cache is explicitly cleared', async () => {
        setRows([{ setting_key: 'ops_workflow_mode', setting_value: 'retail', data_type: 'string' }]);
        await resolveWorkflowCapabilitySettings();

        clearWorkflowCapabilitySettingsCache();
        setRows([{ setting_key: 'ops_workflow_mode', setting_value: 'services', data_type: 'string' }]);
        const result = await resolveWorkflowCapabilitySettings();

        expect(result.mode).toBe('services');
        expect(findAllMock).toHaveBeenCalledTimes(1);
    });
});
