import {
    buildCustomerAccessCapabilityMetadata,
    normalizeTenantCapabilities,
    normalizeTenantCapabilityPatch
} from '../src/modules/tenants/usecases/tenantCapabilitySettings.js';

describe('tenant capability settings helpers', () => {
    it('normalizes missing settings to safe defaults', () => {
        expect(normalizeTenantCapabilities({})).toEqual({
            ims_enabled: true,
            pos_enabled: true,
            storefront_visible: false,
            customer_access_mode: 'catalog',
            platform_max_customer_access_mode: 'transaction'
        });
    });

    it('normalizes wrapped setting rows from tenant capability reads', () => {
        expect(normalizeTenantCapabilities({
            tenant_ims_enabled: { value: 'false' },
            tenant_pos_enabled: { value: 'true' },
            store_is_visible: { value: 'true' },
            customer_access_mode: { value: 'transaction' },
            platform_max_customer_access_mode: { value: 'inquiry' }
        })).toEqual({
            ims_enabled: false,
            pos_enabled: true,
            storefront_visible: true,
            customer_access_mode: 'transaction',
            platform_max_customer_access_mode: 'inquiry'
        });
    });

    it('exposes effective customer access metadata for admin capability payloads', () => {
        const metadata = buildCustomerAccessCapabilityMetadata({
            customer_access_mode: { value: 'transaction' },
            tenant_onboarding_progress: {
                value: {
                    step_payloads: {
                        business_classification: {
                            legitimacy: { registration_status: 'informal' }
                        }
                    }
                }
            }
        });

        expect(metadata).toEqual(expect.objectContaining({
            requested_customer_access_mode: 'transaction',
            effective_customer_access_mode: 'catalog',
            max_customer_access_mode: 'catalog',
            platform_max_customer_access_mode: 'transaction',
            registration_stage_max_customer_access_mode: 'catalog',
            registration_stage: 'informal',
            customer_access_limitation_reason: 'Registration stage informal allows up to catalog mode.',
            customer_access_modes_enabled: true
        }));
        expect(metadata.access_capabilities).toEqual(expect.objectContaining({
            checkout: false,
            quote: false
        }));
    });

    it('exposes transaction metadata when registration readiness is registered', () => {
        const metadata = buildCustomerAccessCapabilityMetadata({
            customer_access_mode: { value: 'transaction' },
            platform_max_customer_access_mode: { value: 'transaction' },
            tenant_onboarding_progress: {
                value: {
                    step_payloads: {
                        business_classification: {
                            legitimacy: { registration_status: 'registered' }
                        }
                    }
                }
            }
        });

        expect(metadata).toEqual(expect.objectContaining({
            requested_customer_access_mode: 'transaction',
            effective_customer_access_mode: 'transaction',
            max_customer_access_mode: 'transaction',
            platform_max_customer_access_mode: 'transaction',
            registration_stage_max_customer_access_mode: 'transaction',
            registration_stage: 'registered',
            customer_access_limitation_reason: null
        }));
        expect(metadata.access_capabilities).toEqual(expect.objectContaining({
            checkout: true,
            quote: true
        }));
    });

    it('serializes admin registration readiness patches to the governed patch field', () => {
        expect(normalizeTenantCapabilityPatch({
            customer_access_registration_stage: 'registered'
        })).toEqual({
            customer_access_registration_stage: 'registered'
        });
    });

    it('serializes admin capability patches to tenant setting keys', () => {
        expect(normalizeTenantCapabilityPatch({
            ims_enabled: false,
            pos_enabled: true,
            storefront_visible: true,
            customer_access_mode: 'transaction',
            platform_max_customer_access_mode: 'catalog'
        })).toEqual({
            tenant_ims_enabled: 'false',
            tenant_pos_enabled: 'true',
            store_is_visible: 'true',
            customer_access_mode: 'transaction',
            platform_max_customer_access_mode: 'catalog'
        });
    });

    it('rejects unsupported storefront access modes', () => {
        expect(() => normalizeTenantCapabilityPatch({
            customer_access_mode: 'public-chaos'
        })).toThrow(/customer_access_mode must be one of/i);
        expect(() => normalizeTenantCapabilityPatch({
            platform_max_customer_access_mode: 'public-chaos'
        })).toThrow(/platform_max_customer_access_mode must be one of/i);
        expect(() => normalizeTenantCapabilityPatch({
            customer_access_registration_stage: 'verified'
        })).toThrow(/customer_access_registration_stage must be one of/i);
    });

    it('rejects string booleans instead of silently coercing capability state', () => {
        expect(() => normalizeTenantCapabilityPatch({
            ims_enabled: 'true'
        })).toThrow(/ims_enabled must be a boolean/i);
    });
});
