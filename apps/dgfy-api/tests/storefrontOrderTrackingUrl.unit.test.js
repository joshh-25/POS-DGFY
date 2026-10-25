import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const listActiveCanonicalOriginsByTenantIds = jest.fn();
const getStorefrontSlug = jest.fn();

jest.unstable_mockModule('../src/modules/storefrontDomains/index.js', () => ({
    storefrontDomainRepository: { listActiveCanonicalOriginsByTenantIds }
}));
jest.unstable_mockModule('../src/modules/dgfy/repositories/dgfyAffiliateRepository.js', () => ({
    dgfyAffiliateRepository: { getStorefrontSlug }
}));

const { buildStorefrontTrackingUrl } = await import('../src/modules/dgfy/services/storefrontOrderTrackingUrl.js');
const originalEnv = { ...process.env };

describe('buildStorefrontTrackingUrl', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://shop.example.test/';
        listActiveCanonicalOriginsByTenantIds.mockResolvedValue(new Map());
        getStorefrontSlug.mockResolvedValue('green-market');
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('uses the active canonical custom-domain origin', async () => {
        listActiveCanonicalOriginsByTenantIds.mockResolvedValue(new Map([['tenant-1', 'https://custom.example.test/']]));
        await expect(buildStorefrontTrackingUrl({ tenantId: 'tenant-1', trackingPin: 'SK-ABC 123' }))
            .resolves.toBe('https://custom.example.test/track?pin=SK-ABC%20123');
        expect(getStorefrontSlug).not.toHaveBeenCalled();
    });

    it('uses the storefront slug and public origin as a fallback', async () => {
        await expect(buildStorefrontTrackingUrl({ tenantId: 'tenant-1', trackingPin: 'SK-ABC123' }))
            .resolves.toBe('https://shop.example.test/tenant-store/green-market/track?pin=SK-ABC123');
        expect(getStorefrontSlug).toHaveBeenCalledWith('tenant-1');
    });

    it('encodes slug and PIN and degrades to the slug URL when domain lookup fails', async () => {
        listActiveCanonicalOriginsByTenantIds.mockRejectedValue(new Error('domain database unavailable'));
        getStorefrontSlug.mockResolvedValue('green market');
        await expect(buildStorefrontTrackingUrl({ tenantId: 'tenant-1', trackingPin: 'SK / 123' }))
            .resolves.toBe('https://shop.example.test/tenant-store/green%20market/track?pin=SK%20%2F%20123');
    });

    it('returns null when a slug or valid public origin is unavailable', async () => {
        getStorefrontSlug.mockResolvedValue(null);
        await expect(buildStorefrontTrackingUrl({ tenantId: 'tenant-1', trackingPin: 'SK-ABC123' })).resolves.toBeNull();

        getStorefrontSlug.mockResolvedValue('green-market');
        process.env.STOREFRONT_PUBLIC_ORIGIN = 'javascript:alert(1)';
        await expect(buildStorefrontTrackingUrl({ tenantId: 'tenant-1', trackingPin: 'SK-ABC123' })).resolves.toBeNull();
    });
});
