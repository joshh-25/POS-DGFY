import { jest } from '@jest/globals';

const mockFindOne = jest.fn();
const mockExternalSiteFindAll = jest.fn();

jest.unstable_mockModule('../src/models/index.js', () => ({
    StorefrontDiscoveryIndex: {
        findOne: mockFindOne
    },
    ExternalRedirectSite: {
        findAll: mockExternalSiteFindAll
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
        mockExternalSiteFindAll.mockResolvedValue([]);
        invalidateStorefrontDiscoverySharedSignatureCache();
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
        expect(first).toMatch(/^2:\d+:[a-f0-9]{64}$/);
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
        expect(third).toMatch(/^3:\d+:[a-f0-9]{64}$/);
        expect(mockFindOne).toHaveBeenCalledTimes(2);
    });

    it('changes on a peer instance when external partner visibility changes', async () => {
        mockFindOne.mockResolvedValue({
            row_count: 2,
            last_updated_at: '2026-03-31T00:00:00.000Z'
        });
        mockExternalSiteFindAll.mockResolvedValueOnce([
            { site_key: 'job', show_on_map: true }
        ]);

        const firstInstanceSignature = await getStorefrontDiscoverySharedSignature();

        mockExternalSiteFindAll.mockResolvedValueOnce([
            { site_key: 'job', show_on_map: false }
        ]);
        jest.resetModules();
        const peerInstance = await import('../src/services/storefrontDiscoveryFreshnessService.js');
        const peerInstanceSignature = await peerInstance.getStorefrontDiscoverySharedSignature();

        expect(peerInstanceSignature).not.toBe(firstInstanceSignature);
        expect(mockExternalSiteFindAll).toHaveBeenCalledTimes(2);
    });
});
