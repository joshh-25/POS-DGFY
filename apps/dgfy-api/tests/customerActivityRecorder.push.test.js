import { afterEach, describe, expect, it, jest } from '@jest/globals';

const repository = {
    findTenantById: jest.fn().mockResolvedValue({ id: 'tenant-1', company_token: 'private-token', name: 'Store' }),
    upsertActivity: jest.fn()
};
const dispatchGuestOrderStatusPush = jest.fn().mockResolvedValue({ status: 'completed' });
const revokeGuestOrderPushTokens = jest.fn().mockResolvedValue(1);
jest.unstable_mockModule('../src/modules/dgfy/repositories/dgfyCustomerRepository.js', () => ({
    dgfyCustomerRepository: repository
}));
jest.unstable_mockModule('../src/modules/dgfy/services/dgfyCustomerEventBus.js', () => ({
    publishDgfyCustomerEvent: jest.fn()
}));
jest.unstable_mockModule('../src/modules/pushDelivery/index.js', () => ({
    dispatchAccountOrderStatusPush: jest.fn().mockResolvedValue({ status: 'completed' }),
    dispatchGuestOrderStatusPush,
    revokeGuestOrderPushTokens
}));
const { recordDgfyOrderActivity } = await import('../src/modules/dgfy/utils/customerActivityRecorder.js');

const activity = (overrides = {}) => ({
    activity_id: 10,
    tenant_id: 'tenant-1',
    reference: 'SK-ABC123',
    status: 'confirmed',
    dgfy_account_id: null,
    store_customer_id: null,
    display_snapshot: { order_id: 37 },
    _status_changed: true,
    ...overrides
});

afterEach(() => {
    jest.clearAllMocks();
    repository.findTenantById.mockResolvedValue({ id: 'tenant-1', company_token: 'private-token', name: 'Store' });
});

describe('customerActivityRecorder push integration', () => {
    it('dispatches guest pushes only for changed, unlinked order statuses', async () => {
        repository.upsertActivity.mockResolvedValueOnce(activity());
        await recordDgfyOrderActivity({ tenantId: 'tenant-1', order: { tracking_pin: 'SK-ABC123', pos_transaction_id: 37, fulfillment_status: 'confirmed' } });
        expect(dispatchGuestOrderStatusPush).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed' }));

        jest.clearAllMocks();
        repository.upsertActivity.mockResolvedValueOnce(activity({ _status_changed: false }));
        await recordDgfyOrderActivity({ tenantId: 'tenant-1', order: { tracking_pin: 'SK-ABC123', pos_transaction_id: 37, fulfillment_status: 'confirmed' } });
        expect(dispatchGuestOrderStatusPush).not.toHaveBeenCalled();
    });

    it('revokes guest bindings on claim and does not fan out to a Storefront-only customer', async () => {
        repository.upsertActivity.mockResolvedValueOnce(activity({ store_customer_id: 44 }));
        await recordDgfyOrderActivity({
            tenantId: 'tenant-1',
            order: { tracking_pin: 'SK-ABC123', pos_transaction_id: 37, store_customer_id: 44, fulfillment_status: 'confirmed' },
            storeCustomer: { customer_id: 44, email: 'buyer@example.com' }
        });
        expect(revokeGuestOrderPushTokens).toHaveBeenCalledWith({
            tenantId: 'tenant-1', reference: 'SK-ABC123', posTransactionId: 37, reason: 'order_claimed'
        });
        expect(dispatchGuestOrderStatusPush).not.toHaveBeenCalled();
    });
});
