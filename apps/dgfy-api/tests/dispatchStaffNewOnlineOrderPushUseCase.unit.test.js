import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { buildDispatchStaffNewOnlineOrderPushUseCase } from '../src/modules/pushDelivery/usecases/dispatchStaffNewOnlineOrderPushUseCase.js';

const tenantId = '7d54bdb5-7b8a-4a10-a788-6b8897770001';
const tokenFor = (userId) => `ExponentPushToken[deviceuser${userId}]`;
const tokenRows = (userIds = [1, 2, 3, 4]) => userIds.map((userId) => ({
    id: `token-${userId}`,
    token: tokenFor(userId),
    staff_tenant_id: tenantId,
    staff_user_id: userId
}));
const audience = [
    { user_id: 1, is_active: true, deleted_at: null, permissions: ['pos:view'] },
    { user_id: 2, is_active: true, deleted_at: null, permissions: ['sales:view'] },
    { user_id: 3, is_active: false, deleted_at: null, permissions: ['pos:view'] },
    { user_id: 4, is_active: true, deleted_at: null, is_master_admin: true, permissions: [] }
];
const order = (overrides = {}) => ({
    pos_transaction_id: 901,
    order_source: 'online_store',
    tracking_pin: 'SK-SECRET-PIN',
    customer_phone: '09170000000',
    delivery_address: 'private address',
    location_id: null,
    ...overrides
});

const createDispatcher = ({
    tokens = tokenRows(),
    users = audience,
    resolveLocation = jest.fn().mockResolvedValue({ location_id: 7 }),
    reservePending = jest.fn(async (payload) => ({ status: 'created', log: { id: `log-${payload.token_id}` } })),
    send = jest.fn(async (messages) => messages.map(() => ({ status: 'accepted', ticketId: 'ticket-1' })))
} = {}) => {
    const deviceRepository = {
        listActiveForStaffTenant: jest.fn().mockResolvedValue(tokens),
        revokeTokenById: jest.fn().mockResolvedValue(1)
    };
    const logRepository = {
        reservePending,
        updateById: jest.fn().mockResolvedValue({})
    };
    const adapter = { send };
    const dispatch = buildDispatchStaffNewOnlineOrderPushUseCase({
        deviceRepository,
        logRepository,
        audienceRepository: { listActiveStaffUsers: jest.fn().mockResolvedValue(users) },
        adapterResolver: jest.fn(() => ({ mode: 'expo', adapter })),
        resolveLocation,
        hashToken: jest.fn(() => 'a'.repeat(64)),
        now: () => new Date('2026-10-18T00:00:00.000Z')
    });
    return { dispatch, deviceRepository, logRepository, resolveLocation, reservePending, send };
};

const originalLogFlag = process.env.PUSH_DELIVERY_LOG_ENABLED;

beforeEach(() => {
    process.env.PUSH_DELIVERY_LOG_ENABLED = 'true';
});

afterEach(() => {
    if (originalLogFlag === undefined) delete process.env.PUSH_DELIVERY_LOG_ENABLED;
    else process.env.PUSH_DELIVERY_LOG_ENABLED = originalLogFlag;
    jest.clearAllMocks();
});

describe('dispatchStaffNewOnlineOrderPushUseCase', () => {
    it('targets active staff with pos:view and location access using a minimal payload', async () => {
        const resolveLocation = jest.fn(async ({ userId }) => {
            if (userId === 2) throw new Error('location grant was removed');
            return { location_id: 7 };
        });
        const { dispatch, reservePending, send } = createDispatcher({ resolveLocation });

        const result = await dispatch({ tenantId, order: order() });

        expect(result).toEqual({ status: 'completed', attempted: 2 });
        expect(resolveLocation).toHaveBeenCalledTimes(3);
        expect(reservePending).toHaveBeenCalledTimes(2);
        expect(reservePending).toHaveBeenCalledWith(expect.objectContaining({
            purpose: 'staff_new_online_order',
            tenant_id: tenantId,
            reference: '901',
            dedupe_key: `staff:order:${tenantId}:901:new_online_order:token-1`
        }), expect.objectContaining({
            orderLimit: 50,
            owner: { staff_tenant_id: tenantId, staff_user_id: 1 }
        }));
        expect(send).toHaveBeenCalledTimes(1);
        const sent = send.mock.calls[0][0];
        expect(sent).toEqual([
            expect.objectContaining({
                to: tokenFor(1),
                title: 'New online order',
                body: 'A new online order is waiting in POS.',
                data: { event: 'pos_new_online_order', order_id: 901, location_id: 7 }
            }),
            expect.objectContaining({
                to: tokenFor(4),
                data: { event: 'pos_new_online_order', order_id: 901, location_id: 7 }
            })
        ]);
        expect(Object.keys(sent[0].data).sort()).toEqual(['event', 'location_id', 'order_id']);
        expect(JSON.stringify(sent)).not.toContain('SK-SECRET-PIN');
        expect(JSON.stringify(sent)).not.toContain('09170000000');
        expect(JSON.stringify(sent)).not.toContain('private address');
        expect(JSON.stringify(sent)).not.toContain('company_token');
    });

    it('skips non-online orders and disabled delivery logging before reading tokens', async () => {
        const { dispatch, deviceRepository } = createDispatcher();
        await expect(dispatch({ tenantId, order: order({ order_source: 'in_store' }) }))
            .resolves.toMatchObject({ status: 'skipped' });
        expect(deviceRepository.listActiveForStaffTenant).not.toHaveBeenCalled();

        process.env.PUSH_DELIVERY_LOG_ENABLED = 'false';
        await expect(dispatch({ tenantId, order: order() }))
            .resolves.toMatchObject({ status: 'skipped', reason: 'delivery_logging_disabled' });
        expect(deviceRepository.listActiveForStaffTenant).not.toHaveBeenCalled();
    });

    it('does not send a duplicate event and revokes tokens Expo reports as unregistered', async () => {
        const oneUser = [audience[0]];
        const duplicate = createDispatcher({
            tokens: tokenRows([1]),
            users: oneUser,
            reservePending: jest.fn().mockResolvedValue({ status: 'duplicate', log: null })
        });
        await duplicate.dispatch({ tenantId, order: order({ location_id: 7 }) });
        expect(duplicate.send).not.toHaveBeenCalled();

        const unregistered = createDispatcher({
            tokens: tokenRows([1]),
            users: oneUser,
            send: jest.fn().mockResolvedValue([{ status: 'rejected', errorCode: 'DeviceNotRegistered' }])
        });
        await unregistered.dispatch({ tenantId, order: order({ location_id: 7 }) });
        expect(unregistered.deviceRepository.revokeTokenById).toHaveBeenCalledWith('token-1', 'device_not_registered');
    });

    it('contains provider failures and treats an invalid order location as ineligible', async () => {
        const providerFailure = createDispatcher({
            tokens: tokenRows([1]),
            users: [audience[0]],
            send: jest.fn().mockRejectedValue(new Error('provider unavailable'))
        });
        await expect(providerFailure.dispatch({ tenantId, order: order({ location_id: 7 }) }))
            .resolves.toEqual({ status: 'completed', attempted: 1 });
        expect(providerFailure.logRepository.updateById).toHaveBeenCalledWith('log-token-1', expect.objectContaining({
            status: 'failed', error_code: 'provider_send_failed'
        }));

        const invalidLocation = createDispatcher({ tokens: tokenRows([1]), users: [audience[0]] });
        await expect(invalidLocation.dispatch({ tenantId, order: order({ location_id: 'invalid' }) }))
            .resolves.toMatchObject({ status: 'skipped', reason: 'invalid_order_location' });
        expect(invalidLocation.resolveLocation).not.toHaveBeenCalled();
    });
});
