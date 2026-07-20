import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const findAllMock = jest.fn();
const reconcileStorefrontDiscoveryIndexMock = jest.fn();
const getStorefrontDiscoveryCacheVersionMock = jest.fn(() => 1);
const getStorefrontDiscoverySharedSignatureMock = jest.fn(async () => '1:1');

jest.unstable_mockModule('../src/models/index.js', () => ({
    StorefrontDiscoveryIndex: {
        findAll: findAllMock
    }
}));

jest.unstable_mockModule('../src/services/storefrontDiscoveryIndexService.js', () => ({
    reconcileStorefrontDiscoveryIndex: reconcileStorefrontDiscoveryIndexMock
}));

jest.unstable_mockModule('../src/services/storefrontDiscoveryCacheState.js', () => ({
    getStorefrontDiscoveryCacheVersion: getStorefrontDiscoveryCacheVersionMock
}));

jest.unstable_mockModule('../src/services/storefrontDiscoveryFreshnessService.js', () => ({
    getStorefrontDiscoverySharedSignature: getStorefrontDiscoverySharedSignatureMock
}));

let resolveTenantByStoreSlug;
let clearStorefrontTenantResolverCache;

beforeAll(async () => {
    const mod = await import('../src/services/storefrontTenantResolver.js');
    resolveTenantByStoreSlug = mod.resolveTenantByStoreSlug;
    clearStorefrontTenantResolverCache = mod.clearStorefrontTenantResolverCache;
});

describe('storefrontTenantResolver', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getStorefrontDiscoveryCacheVersionMock.mockReturnValue(1);
        getStorefrontDiscoverySharedSignatureMock.mockResolvedValue('1:1');
        clearStorefrontTenantResolverCache();
    });

    it('resolves tenant from slug using index rows', async () => {
        findAllMock.mockResolvedValue([
            {
                tenant_id: 'tenant-1',
                tenant_name: 'Acme',
                tenant_company_token: 'secret-token',
                slug: 'acme-store'
            }
        ]);

        const result = await resolveTenantByStoreSlug('acme-store');
        expect(result).toEqual({
            id: 'tenant-1',
            name: 'Acme',
            company_token: 'secret-token'
        });
        expect(reconcileStorefrontDiscoveryIndexMock).not.toHaveBeenCalled();
    });

    it('runs one-time repair reconcile when index is empty', async () => {
        findAllMock
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                {
                    tenant_id: 'tenant-2',
                    tenant_name: 'Bravo',
                    tenant_company_token: 'token-2',
                    slug: 'bravo'
                }
            ]);
        reconcileStorefrontDiscoveryIndexMock.mockResolvedValue({ status: 'healthy' });

        const result = await resolveTenantByStoreSlug('bravo');
        expect(reconcileStorefrontDiscoveryIndexMock).toHaveBeenCalledTimes(1);
        expect(reconcileStorefrontDiscoveryIndexMock).toHaveBeenCalledWith();
        expect(result).toEqual({
            id: 'tenant-2',
            name: 'Bravo',
            company_token: 'token-2'
        });
    });

    it('reconciles and retries once when the requested slug is missing from the warm cache', async () => {
        findAllMock
            .mockResolvedValueOnce([
                {
                    slug: 'other-store',
                    tenant_id: 'tenant-1',
                    tenant_name: 'Other Store',
                    tenant_company_token: 'token-1'
                }
            ])
            .mockResolvedValueOnce([
                {
                    slug: 'space-bar',
                    tenant_id: 'tenant-2',
                    tenant_name: 'Space Bar',
                    tenant_company_token: 'token-2'
                }
            ]);
        reconcileStorefrontDiscoveryIndexMock.mockResolvedValue({
            status: 'healthy',
            upserted: 1,
            removed: 0
        });

        const result = await resolveTenantByStoreSlug('space-bar');

        expect(reconcileStorefrontDiscoveryIndexMock).toHaveBeenCalledWith({ pruneStale: false });
        expect(findAllMock).toHaveBeenCalledTimes(2);
        expect(result).toEqual({
            id: 'tenant-2',
            name: 'Space Bar',
            company_token: 'token-2'
        });
    });
});
