import { jest } from '@jest/globals';

const mockFindOne = jest.fn();

jest.unstable_mockModule('../src/models/index.js', () => ({
    StorefrontDiscoveryIndex: {
        findOne: mockFindOne
    }
}));

describe('storefrontDiscoveryFreshnessService', () => {
    let getStorefrontDiscoverySharedSignature;
    let invalidateStorefrontDiscoverySharedSignatureCache;

    beforeAll(async () => {
        process.env.STOREFRONT_DISCOVERY_SIGNATURE_TTL_MS = '999999';
        ({
            getStorefrontDiscoverySharedSignature,
            invalidateStorefrontDiscoverySharedSignatureCache
        } = await import('../src/services/storefrontDiscoveryFreshnessService.js'));
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        delete process.env.STOREFRONT_DISCOVERY_SIGNATURE_TTL_MS;
    });

    it('returns cached signature until invalidated', async () => {
        mockFindOne.mockResolvedValueOnce({
            row_count: 2,
            last_updated_at: '2026-03-31T00:00:00.000Z'
        });

        const first = await getStorefrontDiscoverySharedSignature();
        expect(first).toMatch(/^2:\d+$/);
        expect(mockFindOne).toHaveBeenCalledTimes(1);

        mockFindOne.mockResolvedValueOnce({
            row_count: 3,
            last_updated_at: '2026-03-31T01:00:00.000Z'
        });

        const second = await getStorefrontDiscoverySharedSignature();
        expect(second).toBe(first);
        expect(mockFindOne).toHaveBeenCalledTimes(1);

        invalidateStorefrontDiscoverySharedSignatureCache();
        const third = await getStorefrontDiscoverySharedSignature();
        expect(third).not.toBe(first);
        expect(third).toMatch(/^3:\d+$/);
        expect(mockFindOne).toHaveBeenCalledTimes(2);
    });
});
