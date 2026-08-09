import { jest } from '@jest/globals';
import { buildProvisioningStoreProfile } from '../src/services/tenantProvisioningService.js';
import { storeConfigurationTemplateRepository } from '../src/modules/templates/index.js';
import { buildStoreProfile } from '../src/modules/shared/constants/storeProfile.js';
import { WORKFLOW_MODE_CAPABILITIES } from '../src/modules/shared/constants/workflowModes.js';
import { REGISTRATION_INDUSTRIES } from '../src/modules/shared/constants/registrationIndustries.js';
import logger from '../src/config/logger.js';
import {
    resolveStoreProfile,
    clearStoreProfileResolutionCache
} from '../src/modules/settings/usecases/resolveStoreProfile.js';
import dbStore from '../src/utils/dbStore.js';

describe('tenant provisioning Store Profile provenance (issue #178 Phase 13)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('stamps provenance when a published canonical template exists for the mode', async () => {
        jest.spyOn(storeConfigurationTemplateRepository, 'findPublishedCanonicalForMode').mockResolvedValue({
            template_id: 42,
            template_key: 'fnb_full_service',
            version: 3,
            status: 'published',
            base_mode: 'fnb',
            // A real canonical preset's modules always equals its base
            // mode's full capability list (capabilityModules.contract.test.js
            // pins this) - anything else would materialize a non-empty
            // overlay, which is what the non-canonical-preset tests below
            // exist to cover.
            modules: [...WORKFLOW_MODE_CAPABILITIES.fnb]
        });

        const profile = await buildProvisioningStoreProfile('fnb');

        expect(profile.provenance).toEqual({
            source_template_id: 42,
            source_template_version: 3,
            diverged_from_source: false
        });
        // Everything else is untouched - provenance stamping never mutates
        // the mode-derived content.
        const plainProfile = buildStoreProfile({ workflowMode: 'fnb' });
        expect({ ...profile, provenance: undefined }).toEqual({ ...plainProfile, provenance: undefined });
    });

    it('provisions with no provenance when no published template exists for the mode', async () => {
        jest.spyOn(storeConfigurationTemplateRepository, 'findPublishedCanonicalForMode').mockResolvedValue(null);

        const profile = await buildProvisioningStoreProfile('retail');

        expect(profile.provenance).toEqual({
            source_template_id: null,
            source_template_version: null,
            diverged_from_source: false
        });
    });

    it('falls back to a provenance-free profile without blocking provisioning when template lookup fails', async () => {
        const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        jest.spyOn(storeConfigurationTemplateRepository, 'findPublishedCanonicalForMode').mockRejectedValue(new Error('landlord DB unavailable'));

        const profile = await buildProvisioningStoreProfile('services');

        expect(profile.provenance.source_template_id).toBeNull();
        expect(profile.modules).toEqual(buildStoreProfile({ workflowMode: 'services' }).modules);
        expect(warnSpy).toHaveBeenCalledWith(
            '[TenantProvisioning] template provenance lookup failed; provisioning without it',
            expect.objectContaining({ workflow_mode: 'services' })
        );
    });

    // ADR 0056 clause 2 ("provenance never dereferenced at runtime") -
    // proven end-to-end, not just at the JS-object level. A prior version of
    // this test only proved that a captured JS variable did not mutate
    // itself when a later mock changed: it never exercised
    // resolveStoreProfile.js (the real runtime read path an opted-in
    // tenant's requests actually go through), never persisted anything to
    // simulate a real tenant's settings, and so could not have caught a
    // regression where something started re-reading the template row on
    // every request. This version does all three.
    describe('editing a published template changes zero already-provisioned tenants (ADR 0056 clause 2)', () => {
        afterEach(() => {
            clearStoreProfileResolutionCache();
        });

        it('resolveStoreProfile never calls the template repository, and serves the profile captured at provisioning unchanged after the template is edited', async () => {
            const findCanonicalSpy = jest.spyOn(storeConfigurationTemplateRepository, 'findPublishedCanonicalForMode')
                .mockResolvedValueOnce({
                    template_id: 5,
                    version: 1,
                    status: 'published',
                    base_mode: 'retail',
                    modules: [...WORKFLOW_MODE_CAPABILITIES.retail]
                });
            const findByKeySpy = jest.spyOn(storeConfigurationTemplateRepository, 'findByKey');

            // One tenant provisions against template v1 - this is the
            // snapshot a real tenant's ops_store_profile setting would be
            // written with, once, at creation.
            const provisionedProfile = await buildProvisioningStoreProfile('retail');
            expect(provisionedProfile.provenance).toEqual({
                source_template_id: 5,
                source_template_version: 1,
                diverged_from_source: false
            });
            findCanonicalSpy.mockClear();

            // Simulate that tenant's real settings, as they would exist in
            // its own tenant DB after provisioning wrote them.
            jest.spyOn(dbStore, 'get').mockImplementation((name) => (
                name === 'SystemSetting' ? {
                    findAll: jest.fn().mockResolvedValue([
                        { setting_key: 'ops_workflow_mode', setting_value: 'retail', data_type: 'string' },
                        { setting_key: 'ops_enabled_capabilities', setting_value: '[]', data_type: 'json' },
                        { setting_key: 'ops_disabled_capabilities', setting_value: '[]', data_type: 'json' },
                        { setting_key: 'ops_store_profile_read', setting_value: 'true', data_type: 'boolean' },
                        { setting_key: 'ops_store_profile', setting_value: JSON.stringify(provisionedProfile), data_type: 'json' }
                    ])
                } : null
            ));
            jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId: 'tenant-under-test' });

            // The template is later "edited" - published to a new version
            // with a completely different module list, simulating a
            // platform admin republishing it.
            findCanonicalSpy.mockResolvedValue({
                template_id: 5,
                version: 2,
                status: 'published',
                base_mode: 'retail',
                modules: ['catalog']
            });

            const resolution = await resolveStoreProfile();

            // The already-provisioned tenant's resolution is byte-identical
            // to what was captured at provisioning - and NOT diverged,
            // which is what "changes zero already-provisioned profiles"
            // actually means at runtime: an opted-in tenant keeps serving
            // exactly what it always did, unaffected by the edit.
            expect(resolution.diverged).toBe(false);
            expect(resolution.source).toBe('persisted');
            expect(resolution.profile).toEqual(provisionedProfile);

            // The binding clause itself: the template row is never
            // dereferenced again to determine this tenant's effective
            // configuration - not at provisioning-replay time, not on this
            // read, regardless of what the template now looks like.
            expect(findCanonicalSpy).not.toHaveBeenCalled();
            expect(findByKeySpy).not.toHaveBeenCalled();
        });
    });

    describe('explicit templateKey selection (issue #178 Phase 17)', () => {
        it('applies a published, mode-matching non-canonical template selected by key', async () => {
            const findByKeySpy = jest.spyOn(storeConfigurationTemplateRepository, 'findByKey').mockResolvedValue({
                template_id: 9,
                template_key: 'fnb_counter_service',
                version: 1,
                status: 'published',
                base_mode: 'fnb',
                modules: [...WORKFLOW_MODE_CAPABILITIES.fnb.filter((key) => (
                    !['tableService', 'kitchenQueue', 'restaurantServiceCharge'].includes(key)
                ))]
            });
            const canonicalSpy = jest.spyOn(storeConfigurationTemplateRepository, 'findPublishedCanonicalForMode');

            const profile = await buildProvisioningStoreProfile('fnb', { templateKey: 'fnb_counter_service' });

            expect(findByKeySpy).toHaveBeenCalledWith('fnb_counter_service');
            // The explicit key wins outright - the canonical fallback is never consulted.
            expect(canonicalSpy).not.toHaveBeenCalled();
            expect(profile.provenance).toEqual({
                source_template_id: 9,
                source_template_version: 1,
                diverged_from_source: false
            });
            expect(profile.modules).not.toContain('tableService');
            expect(profile.source.disabled_capabilities).toEqual(
                ['kitchenQueue', 'restaurantServiceCharge', 'tableService'].sort()
            );
        });

        it('ignores a templateKey whose base_mode does not match the requested workflow mode and falls back to canonical', async () => {
            const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
            jest.spyOn(storeConfigurationTemplateRepository, 'findByKey').mockResolvedValue({
                template_id: 9,
                template_key: 'fnb_counter_service',
                version: 1,
                status: 'published',
                base_mode: 'fnb',
                modules: []
            });
            jest.spyOn(storeConfigurationTemplateRepository, 'findPublishedCanonicalForMode').mockResolvedValue(null);

            // Caller asked for retail but supplied an fnb-scoped template key.
            const profile = await buildProvisioningStoreProfile('retail', { templateKey: 'fnb_counter_service' });

            expect(profile.provenance.source_template_id).toBeNull();
            expect(profile.modules).toEqual(buildStoreProfile({ workflowMode: 'retail' }).modules);
            expect(warnSpy).toHaveBeenCalledWith(
                '[TenantProvisioning] requested template ignored - not published or mode mismatch',
                expect.objectContaining({ template_key: 'fnb_counter_service', requested_mode: 'retail' })
            );
        });

        it('ignores a draft (unpublished) templateKey and falls back to canonical', async () => {
            const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
            jest.spyOn(storeConfigurationTemplateRepository, 'findByKey').mockResolvedValue({
                template_id: 9,
                template_key: 'fnb_experimental',
                version: 1,
                status: 'draft',
                base_mode: 'fnb',
                modules: []
            });
            jest.spyOn(storeConfigurationTemplateRepository, 'findPublishedCanonicalForMode').mockResolvedValue(null);

            const profile = await buildProvisioningStoreProfile('fnb', { templateKey: 'fnb_experimental' });

            expect(profile.provenance.source_template_id).toBeNull();
            expect(warnSpy).toHaveBeenCalledWith(
                '[TenantProvisioning] requested template ignored - not published or mode mismatch',
                expect.objectContaining({ template_status: 'draft' })
            );
        });

        it('falls back to canonical-for-mode when the templateKey does not resolve to any template', async () => {
            jest.spyOn(storeConfigurationTemplateRepository, 'findByKey').mockResolvedValue(null);
            const canonicalSpy = jest.spyOn(storeConfigurationTemplateRepository, 'findPublishedCanonicalForMode').mockResolvedValue({
                template_id: 42,
                version: 3,
                status: 'published',
                base_mode: 'retail',
                modules: [...WORKFLOW_MODE_CAPABILITIES.retail]
            });

            const profile = await buildProvisioningStoreProfile('retail', { templateKey: 'not-a-real-key' });

            expect(canonicalSpy).toHaveBeenCalledWith('retail');
            expect(profile.provenance.source_template_id).toBe(42);
        });

        // issue #178 "templates become the Operating Mode" follow-up: the
        // concrete gap the registration Industry catalog closes. Before
        // approveTenantUseCase forwarded a templateKey, EVERY organic
        // signup fell into the "no explicit key" branch above regardless
        // of which industry the merchant picked, so a carinderia
        // registration always provisioned the full-service fnb bundle
        // (floor plan, kitchen queue, service charge). This proves the
        // catalog's own micro_fnb -> fnb_counter_service pairing
        // provisions with the subtractive overlay end to end, through the
        // exact code path approveTenantUseCase now drives.
        it('provisions a Micro Food & Beverage registration with the counter-service subtractive overlay, not the full-service bundle', async () => {
            const microFnb = REGISTRATION_INDUSTRIES.micro_fnb;
            expect(microFnb.template_key).toBe('fnb_counter_service');

            jest.spyOn(storeConfigurationTemplateRepository, 'findByKey').mockResolvedValue({
                template_id: 9,
                template_key: microFnb.template_key,
                version: 1,
                status: 'published',
                base_mode: microFnb.workflow_mode,
                modules: WORKFLOW_MODE_CAPABILITIES.fnb.filter((key) => (
                    !['tableService', 'kitchenQueue', 'restaurantServiceCharge'].includes(key)
                ))
            });

            const profile = await buildProvisioningStoreProfile(microFnb.workflow_mode, { templateKey: microFnb.template_key });

            expect(profile.modules).not.toContain('tableService');
            expect(profile.modules).not.toContain('kitchenQueue');
            expect(profile.modules).not.toContain('restaurantServiceCharge');
            expect(profile.pos_workflow.mode).toBe('counter');
            expect(profile.provenance.source_template_id).toBe(9);
        });
    });
});
