import { jest } from '@jest/globals';

const mockSyncStorefrontDiscoveryIndexForTenant = jest.fn();
const mockReconcileStorefrontDiscoveryIndex = jest.fn();
const mockClearStorefrontTenantResolverCache = jest.fn();
const mockClearStorefrontDiscoveryRepositoryCache = jest.fn();

jest.unstable_mockModule('../src/services/storefrontDiscoveryIndexService.js', () => ({
    syncStorefrontDiscoveryIndexForTenant: mockSyncStorefrontDiscoveryIndexForTenant,
    reconcileStorefrontDiscoveryIndex: mockReconcileStorefrontDiscoveryIndex
}));

jest.unstable_mockModule('../src/services/storefrontTenantResolver.js', () => ({
    clearStorefrontTenantResolverCache: mockClearStorefrontTenantResolverCache
}));

jest.unstable_mockModule('../src/modules/storefrontDiscovery/repositories/storefrontDiscoveryRepository.js', () => ({
    clearStorefrontDiscoveryRepositoryCache: mockClearStorefrontDiscoveryRepositoryCache
}));

describe('storefrontDiscoverySyncReliabilityService', () => {
    let syncStorefrontDiscoveryWithReliability;

    beforeAll(async () => {
        ({ syncStorefrontDiscoveryWithReliability } = await import('../src/services/storefrontDiscoverySyncReliabilityService.js'));
    });

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.STOREFRONT_DISCOVERY_SYNC_RETRY_DELAYS_MS = '0,0';
    });

    afterAll(() => {
        delete process.env.STOREFRONT_DISCOVERY_SYNC_RETRY_DELAYS_MS;
    });

    it('returns success on first sync and clears caches', async () => {
        mockSyncStorefrontDiscoveryIndexForTenant.mockResolvedValue({
            status: 'upserted',
            slug: 'tenant-1'
        });

        const result = await syncStorefrontDiscoveryWithReliability({
            tenantId: 'tenant-1',
            source: 'unit_test'
        });

        expect(result.ok).toBe(true);
        expect(result.reconciled).toBe(false);
        expect(result.attempts).toBe(1);
        expect(mockSyncStorefrontDiscoveryIndexForTenant).toHaveBeenCalledTimes(1);
        expect(mockReconcileStorefrontDiscoveryIndex).not.toHaveBeenCalled();
        expect(mockClearStorefrontTenantResolverCache).toHaveBeenCalledTimes(1);
        expect(mockClearStorefrontDiscoveryRepositoryCache).toHaveBeenCalledTimes(1);
    });

    it('recovers by reconcile after retries fail', async () => {
        mockSyncStorefrontDiscoveryIndexForTenant
            .mockRejectedValueOnce(new Error('first'))
            .mockRejectedValueOnce(new Error('second'));

        mockReconcileStorefrontDiscoveryIndex.mockResolvedValue({
            status: 'healthy',
            failed: 0,
            upserted: 1
        });

        const result = await syncStorefrontDiscoveryWithReliability({
            tenantId: 'tenant-2',
            source: 'unit_test'
        });

        expect(result.ok).toBe(true);
        expect(result.reconciled).toBe(true);
        expect(mockSyncStorefrontDiscoveryIndexForTenant).toHaveBeenCalledTimes(2);
        expect(mockReconcileStorefrontDiscoveryIndex).toHaveBeenCalledWith({
            tenantIds: ['tenant-2'],
            pruneStale: false,
            concurrency: 1
        });
        expect(mockClearStorefrontTenantResolverCache).toHaveBeenCalledTimes(1);
        expect(mockClearStorefrontDiscoveryRepositoryCache).toHaveBeenCalledTimes(1);
    });

    it('returns failure when retries and reconcile both fail', async () => {
        mockSyncStorefrontDiscoveryIndexForTenant
            .mockRejectedValueOnce(new Error('first'))
            .mockRejectedValueOnce(new Error('second'));
        mockReconcileStorefrontDiscoveryIndex.mockRejectedValue(new Error('reconcile failed'));

        const result = await syncStorefrontDiscoveryWithReliability({
            tenantId: 'tenant-3',
            source: 'unit_test'
        });

        expect(result.ok).toBe(false);
        expect(result.reconciled).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([
            expect.stringContaining('attempt_1:first'),
            expect.stringContaining('attempt_2:second'),
            expect.stringContaining('reconcile:reconcile failed')
        ]));
        expect(mockClearStorefrontTenantResolverCache).not.toHaveBeenCalled();
        expect(mockClearStorefrontDiscoveryRepositoryCache).not.toHaveBeenCalled();
    });
});
