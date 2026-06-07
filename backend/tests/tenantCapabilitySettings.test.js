import {
    normalizeTenantCapabilities,
    normalizeTenantCapabilityPatch
} from '../src/modules/tenants/usecases/tenantCapabilitySettings.js';

describe('tenant capability settings helpers', () => {
    it('normalizes missing settings to safe defaults', () => {
        expect(normalizeTenantCapabilities({})).toEqual({
            ims_enabled: true,
            pos_enabled: true,
            storefront_visible: false,
            customer_access_mode: 'catalog'
        });
    });

    it('serializes admin capability patches to tenant setting keys', () => {
        expect(normalizeTenantCapabilityPatch({
            ims_enabled: false,
            pos_enabled: true,
            storefront_visible: true,
            customer_access_mode: 'transaction'
        })).toEqual({
            tenant_ims_enabled: 'false',
            tenant_pos_enabled: 'true',
            store_is_visible: 'true',
            customer_access_mode: 'transaction'
        });
    });

    it('rejects unsupported storefront access modes', () => {
        expect(() => normalizeTenantCapabilityPatch({
            customer_access_mode: 'public-chaos'
        })).toThrow(/customer_access_mode must be one of/i);
    });

    it('rejects string booleans instead of silently coercing capability state', () => {
        expect(() => normalizeTenantCapabilityPatch({
            ims_enabled: 'true'
        })).toThrow(/ims_enabled must be a boolean/i);
    });
});
