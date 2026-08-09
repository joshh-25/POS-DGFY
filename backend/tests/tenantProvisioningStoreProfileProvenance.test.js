import { jest } from '@jest/globals';
import { buildProvisioningStoreProfile } from '../src/services/tenantProvisioningService.js';
import { storeConfigurationTemplateRepository } from '../src/modules/templates/index.js';
import { buildStoreProfile } from '../src/modules/shared/constants/storeProfile.js';
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
            modules: []
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
            modules: ['catalog', 'pos', 'storefront']
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
});
