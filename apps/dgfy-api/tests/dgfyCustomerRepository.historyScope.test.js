import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const findAndCountAll = jest.fn();
const activityModel = { findAndCountAll };

jest.unstable_mockModule('../src/models/index.js', () => ({
    DgfyAccount: {},
    DgfyCustomerActivity: activityModel,
    DgfyCustomerAddress: {},
    DgfyCustomerBackfillRun: {},
    DgfyCustomerNotification: {},
    DgfyCustomerReview: {},
    DgfyLoyaltyTransaction: {},
    DgfyReviewInvite: {},
    DgfyTrackingRecoveryCode: {},
    Tenant: {}
}));

let dgfyCustomerRepository;

beforeAll(async () => {
    ({ dgfyCustomerRepository } = await import('../src/modules/dgfy/repositories/dgfyCustomerRepository.js'));
});

describe('dgfy customer repository history scope', () => {
    beforeEach(() => {
        findAndCountAll.mockReset();
        findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    });

    it('intersects account, store, branch, and pagination predicates', async () => {
        await dgfyCustomerRepository.listActivitiesForAccount('account-1', {
            tenantId: 'tenant-1',
            storeSlug: 'cafe-main',
            locationId: 7,
            page: 2,
            limit: 5
        });

        const query = findAndCountAll.mock.calls[0][0];
        expect(query.where).toEqual(expect.objectContaining({
            dgfy_account_id: 'account-1',
            tenant_id: 'tenant-1',
            store_slug: 'cafe-main',
            location_id: 7
        }));
        expect(query.limit).toBe(5);
        expect(query.offset).toBe(5);
    });
});
