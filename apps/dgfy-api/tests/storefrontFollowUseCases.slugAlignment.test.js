import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const getStorefrontDiscoveryIndexSnapshotForTenantMock = jest.fn();

let buildGetStorefrontFollowStatusUseCase;

beforeAll(async () => {
    const mod = await import('../src/modules/store/usecases/storeUseCases.js');
    buildGetStorefrontFollowStatusUseCase = mod.buildGetStorefrontFollowStatusUseCase;
});

describe('store storefront follow use cases slug alignment', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('accepts the discovery snapshot slug even when store_tenant_slug differs', async () => {
        getStorefrontDiscoveryIndexSnapshotForTenantMock.mockResolvedValue({
            slug: 'space-bar-2193ed'
        });
        const findStorefrontFollow = jest.fn().mockResolvedValue({ storefront_follow_id: 9 });
        const countStorefrontFollowsBySlug = jest.fn().mockResolvedValue(7);
        const useCase = buildGetStorefrontFollowStatusUseCase({
            storeRepository: {
                getSettingsByKeys: jest.fn().mockResolvedValue({
                    store_tenant_slug: { value: 'space-bar' }
                }),
                findStorefrontFollow,
                countStorefrontFollowsBySlug
            },
            resolveDiscoverySlug: getStorefrontDiscoveryIndexSnapshotForTenantMock
        });

        const result = await useCase({
            tenantId: '2193ed41-14b2-4f62-aece-16027130e9e2',
            payload: {
                storefront_slug: 'space-bar-2193ed',
                visitor_id: 'guestvisitorid-1234567890'
            }
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            storefront_slug: 'space-bar-2193ed',
            is_following: true,
            followers_count: 7
        }));
        expect(findStorefrontFollow).toHaveBeenCalled();
        expect(countStorefrontFollowsBySlug).toHaveBeenCalled();
    });
});
