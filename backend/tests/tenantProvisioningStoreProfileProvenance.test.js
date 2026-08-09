import { jest } from '@jest/globals';
import { buildProvisioningStoreProfile } from '../src/services/tenantProvisioningService.js';
import { storeConfigurationTemplateRepository } from '../src/modules/templates/index.js';
import { buildStoreProfile } from '../src/modules/shared/constants/storeProfile.js';
import { WORKFLOW_MODE_CAPABILITIES } from '../src/modules/shared/constants/workflowModes.js';
import logger from '../src/config/logger.js';

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

    it('proves editing a template after provisioning changes zero already-provisioned profiles', async () => {
        jest.spyOn(storeConfigurationTemplateRepository, 'findPublishedCanonicalForMode').mockResolvedValueOnce({
            template_id: 5,
            version: 1,
            status: 'published',
            base_mode: 'retail',
            modules: [...WORKFLOW_MODE_CAPABILITIES.retail]
        });

        // Simulates one tenant provisioning against template v1 - this is
        // the snapshot a real tenant's ops_store_profile would be written
        // with, once, and never re-derived from the template afterward.
        const provisionedProfile = await buildProvisioningStoreProfile('retail');
        expect(provisionedProfile.provenance.source_template_version).toBe(1);

        // The template is later "edited" (a new version published) - but
        // nothing re-reads the template for the already-provisioned tenant;
        // its own captured profile object is untouched by this mock change.
        jest.spyOn(storeConfigurationTemplateRepository, 'findPublishedCanonicalForMode').mockResolvedValueOnce({
            template_id: 5,
            version: 2,
            status: 'published',
            base_mode: 'retail',
            modules: ['catalog']
        });

        expect(provisionedProfile.provenance.source_template_version).toBe(1);
        expect(provisionedProfile.modules).toEqual(buildStoreProfile({ workflowMode: 'retail' }).modules);
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
    });
});
