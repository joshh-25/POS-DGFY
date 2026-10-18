import { describe, expect, it, jest } from '@jest/globals';
import { buildDispatchOrderStatusPushUseCase } from '../src/modules/pushDelivery/usecases/dispatchOrderStatusPushUseCase.js';
import { buildDispatchStaffNewOnlineOrderPushUseCase } from '../src/modules/pushDelivery/usecases/dispatchStaffNewOnlineOrderPushUseCase.js';
import {
    buildDispatchEventRecorder,
    classifyDispatchResult,
    pickReservationReason
} from '../src/modules/pushDelivery/utils/dispatchEventRecorder.js';

const TENANT = '7d54bdb5-7b8a-4a10-a788-6b8897770001';
const activity = (overrides = {}) => ({
    activity_id: 81, tenant_id: TENANT, reference: 'SK-ABC123',
    dgfy_account_id: 'd5cba9b3-c2f8-4768-8e80-101010101010',
    location_id: 7, status: 'confirmed', display_snapshot: { order_id: 37 }, ...overrides
});

describe('dispatch event classification', () => {
    it.each([
        [{ status: 'completed', attempted: 2 }, { outcome: 'dispatched', reasonCode: 'dispatched', count: 2 }],
        [{ status: 'skipped', reason: 'no_active_tokens' }, { outcome: 'skipped', reasonCode: 'no_active_tokens', count: 0 }],
        [{ status: 'skipped', reason: 'no_authorized_staff_tokens' }, { outcome: 'skipped', reasonCode: 'no_authorized_staff_tokens', count: 0 }],
        [{ status: 'skipped', reason: 'status_not_notifiable' }, { outcome: 'suppressed', reasonCode: 'status_not_notifiable', count: 0 }],
        [{ status: 'skipped', reason: 'notification_not_created' }, { outcome: 'suppressed', reasonCode: 'notification_not_created', count: 0 }],
        [{ status: 'completed', attempted: 0, reason: 'token_limit' }, { outcome: 'suppressed', reasonCode: 'token_limit', count: 0 }],
        [{ status: 'completed', attempted: 0, reason: 'token_hash_failed' }, { outcome: 'skipped', reasonCode: 'token_hash_failed', count: 0 }],
        [{ status: 'failed', attempted: 0 }, { outcome: 'failed', reasonCode: 'dispatch_failed', count: 0 }]
    ])('classifies %j', (result, expected) => {
        expect(classifyDispatchResult(result)).toEqual(expected);
    });

    it('prefers the strongest reservation reason', () => {
        expect(pickReservationReason({ duplicate: 2, order_limit: 1 })).toBe('order_limit');
        expect(pickReservationReason({ stale_token: 1 })).toBe('stale_token');
        expect(pickReservationReason({})).toBe('no_deliveries_created');
    });

    it('never throws when persisting the event fails (ADR 0097 D8)', async () => {
        const repository = { create: jest.fn().mockRejectedValue(new Error('db down')) };
        const record = buildDispatchEventRecorder({ repository });
        await expect(record({ purpose: 'order_status', result: { status: 'skipped', reason: 'no_active_tokens' } })).resolves.toBeUndefined();
    });

    it('stores only fixed codes and a bounded reference, never token or message data', async () => {
        const repository = { create: jest.fn().mockResolvedValue({}) };
        const record = buildDispatchEventRecorder({ repository });
        await record({ purpose: 'order_status', result: { status: 'skipped', reason: 'No Active; Tokens!' }, tenantId: TENANT, reference: 'X'.repeat(80) });
        const row = repository.create.mock.calls[0][0];
        expect(row.reason_code).toBe('no_active__tokens_');
        expect(row.reference.length).toBe(32);
        expect(Object.keys(row).sort()).toEqual(['eligible_token_count', 'outcome', 'purpose', 'reason_code', 'reference', 'tenant_id']);
    });
});

describe('order-status dispatch records its decision', () => {
    const build = ({ tokens = [{ id: 'device-1', token: 'ExponentPushToken[abcdefghijk]' }], reservationStatus = 'created' } = {}) => {
        const recordEvent = jest.fn().mockResolvedValue(undefined);
        const useCase = buildDispatchOrderStatusPushUseCase({
            deviceRepository: {
                listActiveForAccount: jest.fn().mockResolvedValue(tokens),
                listActiveForGuestOrder: jest.fn().mockResolvedValue(tokens),
                findPublicStoreSlug: jest.fn().mockResolvedValue(null),
                revokeTokenById: jest.fn(), revokeGuestOrderTokens: jest.fn().mockResolvedValue(1)
            },
            logRepository: {
                reservePending: jest.fn().mockImplementation(async (row) => (
                    reservationStatus === 'created' ? { status: 'created', log: { id: 'log-1', ...row } } : { status: reservationStatus, log: null }
                )),
                updateById: jest.fn().mockResolvedValue({})
            },
            adapterResolver: () => ({ mode: 'expo', adapter: { send: jest.fn().mockResolvedValue([{ status: 'accepted', ticketId: 't' }]) } }),
            hashToken: () => 'a'.repeat(64),
            recordEvent
        });
        return { useCase, recordEvent };
    };

    it('records no_active_tokens when there is no registered device', async () => {
        const { useCase, recordEvent } = build({ tokens: [] });
        await useCase.dispatchGuest(activity());
        expect(recordEvent).toHaveBeenCalledWith({
            purpose: 'order_status', result: { status: 'skipped', reason: 'no_active_tokens' }, tenantId: TENANT, reference: 'SK-ABC123'
        });
    });

    it('records a policy skip and a not-created notification', async () => {
        const { useCase, recordEvent } = build();
        await useCase.dispatchGuest(activity({ status: 'packed' }));
        expect(recordEvent.mock.calls[0][0].result).toEqual({ status: 'skipped', reason: 'status_not_notifiable' });
        await useCase.dispatchAccount(activity(), { created: false });
        expect(recordEvent.mock.calls[1][0].result).toEqual({ status: 'skipped', reason: 'notification_not_created' });
    });

    it('records a successful dispatch with the attempted count', async () => {
        const { useCase, recordEvent } = build();
        await useCase.dispatchGuest(activity());
        expect(recordEvent.mock.calls[0][0].result).toEqual({ status: 'completed', attempted: 1 });
    });

    it('records why nothing was sent when every reservation was refused', async () => {
        const { useCase, recordEvent } = build({ reservationStatus: 'token_limit' });
        const result = await useCase.dispatchGuest(activity());
        expect(result).toEqual({ status: 'completed', attempted: 0, reason: 'token_limit' });
        expect(recordEvent.mock.calls[0][0].result.reason).toBe('token_limit');
    });

    it('still returns the dispatch result when the recorder is absent', async () => {
        const useCase = buildDispatchOrderStatusPushUseCase({
            deviceRepository: { listActiveForGuestOrder: jest.fn().mockResolvedValue([]), revokeGuestOrderTokens: jest.fn().mockResolvedValue(1) },
            logRepository: {}, adapterResolver: jest.fn()
        });
        await expect(useCase.dispatchGuest(activity())).resolves.toEqual({ status: 'skipped', reason: 'no_active_tokens' });
    });
});

describe('staff dispatch records its decision', () => {
    const order = { pos_transaction_id: 55, order_source: 'online_store', location_id: 7 };

    it('records no_active_tokens and unsupported orders with the order id as the reference', async () => {
        const recordEvent = jest.fn().mockResolvedValue(undefined);
        const useCase = buildDispatchStaffNewOnlineOrderPushUseCase({
            deviceRepository: { listActiveForStaffTenant: jest.fn().mockResolvedValue([]) },
            logRepository: {}, audienceRepository: {}, adapterResolver: jest.fn(), resolveLocation: jest.fn(), recordEvent
        });
        await useCase({ tenantId: TENANT, order });
        expect(recordEvent).toHaveBeenLastCalledWith({
            purpose: 'staff_new_online_order', result: { status: 'skipped', reason: 'no_active_tokens' }, tenantId: TENANT, reference: 55
        });
        await useCase({ tenantId: TENANT, order: { ...order, order_source: 'pos' } });
        expect(recordEvent.mock.calls[1][0].result.reason).toBe('missing_or_unsupported_order_identity');
    });

    it('records no_authorized_staff_tokens when every staff token is ineligible', async () => {
        const recordEvent = jest.fn().mockResolvedValue(undefined);
        const useCase = buildDispatchStaffNewOnlineOrderPushUseCase({
            deviceRepository: { listActiveForStaffTenant: jest.fn().mockResolvedValue([{ id: 't1', token: 'ExponentPushToken[abcdefghijk]', staff_user_id: 9 }]) },
            logRepository: {},
            audienceRepository: { listActiveStaffUsers: jest.fn().mockResolvedValue([{ user_id: 9, is_active: false, deleted_at: null }]) },
            adapterResolver: jest.fn(), resolveLocation: jest.fn(), recordEvent
        });
        await useCase({ tenantId: TENANT, order });
        expect(recordEvent.mock.calls[0][0].result).toEqual({ status: 'skipped', reason: 'no_authorized_staff_tokens' });
    });
});
