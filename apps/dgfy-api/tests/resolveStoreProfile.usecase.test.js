import { jest } from '@jest/globals';
import {
    resolveStoreProfile,
    clearStoreProfileResolutionCache
} from '../src/modules/settings/usecases/resolveStoreProfile.js';
import dbStore from '../src/utils/dbStore.js';
import {
    buildStoreProfile,
    applyTemplateProvenance,
    STORE_PROFILE_VERSION
} from '../src/modules/shared/constants/storeProfile.js';
import logger from '../src/config/logger.js';

const mockSettingsRows = (rows) => {
    jest.spyOn(dbStore, 'get').mockImplementation((name) => (
        name === 'SystemSetting' ? { findAll: jest.fn().mockResolvedValue(rows) } : null
    ));
};

describe('resolveStoreProfile (issue #178 Phase 12 scaffolding)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        clearStoreProfileResolutionCache();
    });

    it('rebuilds from mode + overlay when no profile is persisted', async () => {
        mockSettingsRows([
            { setting_key: 'ops_workflow_mode', setting_value: 'retail', data_type: 'string' }
        ]);
        jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId: 'tenant-a' });

        const resolution = await resolveStoreProfile();

        expect(resolution.source).toBe('rebuilt');
        expect(resolution.diverged).toBe(false);
        expect(resolution.read_flag_enabled).toBe(false);
        expect(resolution.profile).toEqual(buildStoreProfile({ workflowMode: 'retail' }));
    });

    it('serves the persisted profile only when the flag is on AND it matches a fresh rebuild', async () => {
        const currentProfile = buildStoreProfile({ workflowMode: 'services' });
        mockSettingsRows([
            { setting_key: 'ops_workflow_mode', setting_value: 'services', data_type: 'string' },
            { setting_key: 'ops_store_profile_read', setting_value: 'true', data_type: 'boolean' },
            { setting_key: 'ops_store_profile', setting_value: JSON.stringify(currentProfile), data_type: 'json' }
        ]);
        jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId: 'tenant-b' });

        const resolution = await resolveStoreProfile();

        expect(resolution.source).toBe('persisted');
        expect(resolution.diverged).toBe(false);
        expect(resolution.read_flag_enabled).toBe(true);
        expect(resolution.profile).toEqual(currentProfile);
    });

    it('falls back to a rebuild when the flag is off, even if a current persisted profile exists', async () => {
        const currentProfile = buildStoreProfile({ workflowMode: 'fnb' });
        mockSettingsRows([
            { setting_key: 'ops_workflow_mode', setting_value: 'fnb', data_type: 'string' },
            { setting_key: 'ops_store_profile', setting_value: JSON.stringify(currentProfile), data_type: 'json' }
        ]);
        jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId: 'tenant-c' });

        const resolution = await resolveStoreProfile();

        expect(resolution.source).toBe('rebuilt');
        expect(resolution.read_flag_enabled).toBe(false);
        // Byte-identical anyway (nothing can diverge it yet), but the point is
        // it was independently rebuilt, not served from the persisted value.
        expect(resolution.profile).toEqual(currentProfile);
    });

    it('falls back to a rebuild and logs a divergence when the persisted profile is version-stale', async () => {
        const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        const staleProfile = { ...buildStoreProfile({ workflowMode: 'retail' }), profile_version: STORE_PROFILE_VERSION - 1 };
        mockSettingsRows([
            { setting_key: 'ops_workflow_mode', setting_value: 'retail', data_type: 'string' },
            { setting_key: 'ops_store_profile_read', setting_value: 'true', data_type: 'boolean' },
            { setting_key: 'ops_store_profile', setting_value: JSON.stringify(staleProfile), data_type: 'json' }
        ]);
        jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId: 'tenant-d' });

        const resolution = await resolveStoreProfile();

        expect(resolution.source).toBe('rebuilt');
        expect(resolution.diverged).toBe(true);
        expect(resolution.profile.profile_version).toBe(STORE_PROFILE_VERSION);
        expect(warnSpy).toHaveBeenCalledWith(
            '[StoreProfile] persisted profile diverges from a fresh rebuild',
            expect.objectContaining({ reason: 'stale_profile_version' })
        );
    });

    it('falls back to a rebuild and logs a divergence when persisted content disagrees with a fresh rebuild', async () => {
        const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        const corruptedProfile = { ...buildStoreProfile({ workflowMode: 'retail' }), modules: ['not-a-real-module'] };
        mockSettingsRows([
            { setting_key: 'ops_workflow_mode', setting_value: 'retail', data_type: 'string' },
            { setting_key: 'ops_store_profile_read', setting_value: 'true', data_type: 'boolean' },
            { setting_key: 'ops_store_profile', setting_value: JSON.stringify(corruptedProfile), data_type: 'json' }
        ]);
        jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId: 'tenant-e' });

        const resolution = await resolveStoreProfile();

        expect(resolution.source).toBe('rebuilt');
        expect(resolution.diverged).toBe(true);
        expect(resolution.profile.modules).not.toEqual(['not-a-real-module']);
        expect(warnSpy).toHaveBeenCalledWith(
            '[StoreProfile] persisted profile diverges from a fresh rebuild',
            expect.objectContaining({ reason: 'content_mismatch' })
        );
    });

    it('does not flag a template-provenanced persisted profile as diverged (a rebuild can never reproduce provenance)', async () => {
        const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        const provenancedProfile = applyTemplateProvenance(
            buildStoreProfile({ workflowMode: 'fnb' }),
            { templateId: 7, templateVersion: 2 }
        );
        mockSettingsRows([
            { setting_key: 'ops_workflow_mode', setting_value: 'fnb', data_type: 'string' },
            { setting_key: 'ops_store_profile_read', setting_value: 'true', data_type: 'boolean' },
            { setting_key: 'ops_store_profile', setting_value: JSON.stringify(provenancedProfile), data_type: 'json' }
        ]);
        jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId: 'tenant-g' });

        const resolution = await resolveStoreProfile();

        expect(resolution.diverged).toBe(false);
        expect(resolution.source).toBe('persisted');
        expect(resolution.profile.provenance).toEqual({
            source_template_id: 7,
            source_template_version: 2,
            diverged_from_source: false
        });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not flag a template-curated (disabled-capabilities) persisted profile as diverged (issue #178 Phase 16)', async () => {
        const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        const curatedProfile = buildStoreProfile({
            workflowMode: 'fnb',
            disabledCapabilities: ['tableService', 'kitchenQueue', 'restaurantServiceCharge']
        });
        mockSettingsRows([
            { setting_key: 'ops_workflow_mode', setting_value: 'fnb', data_type: 'string' },
            { setting_key: 'ops_disabled_capabilities', setting_value: JSON.stringify(['tableService', 'kitchenQueue', 'restaurantServiceCharge']), data_type: 'json' },
            { setting_key: 'ops_store_profile_read', setting_value: 'true', data_type: 'boolean' },
            { setting_key: 'ops_store_profile', setting_value: JSON.stringify(curatedProfile), data_type: 'json' }
        ]);
        jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId: 'tenant-h' });

        const resolution = await resolveStoreProfile();

        expect(resolution.diverged).toBe(false);
        expect(resolution.source).toBe('persisted');
        expect(resolution.profile.modules).not.toContain('tableService');
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('flags a persisted profile as diverged when the disabled-capabilities setting has since drifted from what was persisted', async () => {
        const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        // Persisted while tableService/kitchenQueue were disabled...
        const staleCuratedProfile = buildStoreProfile({
            workflowMode: 'fnb',
            disabledCapabilities: ['tableService', 'kitchenQueue']
        });
        mockSettingsRows([
            { setting_key: 'ops_workflow_mode', setting_value: 'fnb', data_type: 'string' },
            // ...but the live setting now only disables tableService.
            { setting_key: 'ops_disabled_capabilities', setting_value: JSON.stringify(['tableService']), data_type: 'json' },
            { setting_key: 'ops_store_profile_read', setting_value: 'true', data_type: 'boolean' },
            { setting_key: 'ops_store_profile', setting_value: JSON.stringify(staleCuratedProfile), data_type: 'json' }
        ]);
        jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId: 'tenant-i' });

        const resolution = await resolveStoreProfile();

        expect(resolution.source).toBe('rebuilt');
        expect(resolution.diverged).toBe(true);
        expect(resolution.profile.modules).toContain('kitchenQueue');
        expect(warnSpy).toHaveBeenCalledWith(
            '[StoreProfile] persisted profile diverges from a fresh rebuild',
            expect.objectContaining({ reason: 'content_mismatch' })
        );
    });

    it('caches the resolution per tenant for the TTL window (one SystemSetting query per resolve call within it)', async () => {
        const findAllMock = jest.fn().mockResolvedValue([
            { setting_key: 'ops_workflow_mode', setting_value: 'msme', data_type: 'string' }
        ]);
        jest.spyOn(dbStore, 'get').mockImplementation((name) => (
            name === 'SystemSetting' ? { findAll: findAllMock } : null
        ));
        jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId: 'tenant-f' });

        await resolveStoreProfile();
        await resolveStoreProfile();

        expect(findAllMock).toHaveBeenCalledTimes(1);
    });
});
