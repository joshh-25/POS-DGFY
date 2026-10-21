import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { buildDispatchOrderStatusPushUseCase } from '../src/modules/pushDelivery/usecases/dispatchOrderStatusPushUseCase.js';

const orderActivity = (overrides = {}) => ({
    activity_id: 81,
    tenant_id: '7d54bdb5-7b8a-4a10-a788-6b8897770001',
    reference: 'SK-ABC123',
    dgfy_account_id: 'd5cba9b3-c2f8-4768-8e80-101010101010',
    location_id: 7,
    status: 'confirmed',
    display_snapshot: { order_id: 37 },
    ...overrides
});
const makeUseCase = ({ tokens = [{ id: 'device-1', token: 'ExponentPushToken[abcdefghijk]' }], send = jest.fn().mockResolvedValue([{ status: 'accepted', ticketId: 'ticket-1' }]) } = {}) => {
    const deviceRepository = {
        listActiveForAccount: jest.fn().mockResolvedValue(tokens),
        listActiveForGuestOrder: jest.fn().mockResolvedValue(tokens),
        findPublicStoreSlug: jest.fn().mockResolvedValue('public-store'),
        revokeTokenById: jest.fn().mockResolvedValue(1),
        revokeGuestOrderTokens: jest.fn().mockResolvedValue(1)
    };
    const logRepository = {
        reservePending: jest.fn().mockImplementation(async (row) => ({
            status: 'created',
            log: { id: `log-${row.token_id}`, ...row }
        })),
        updateById: jest.fn().mockResolvedValue({})
    };
    const adapter = { send, getReceipts: jest.fn() };
    const useCase = buildDispatchOrderStatusPushUseCase({
        deviceRepository,
        logRepository,
        adapterResolver: jest.fn(() => ({ mode: 'expo', adapter })),
        hashToken: jest.fn(() => 'a'.repeat(64)),
        now: () => new Date('2026-10-17T00:00:00.000Z')
    });
    return { useCase, deviceRepository, logRepository, adapter };
};

afterEach(() => { jest.restoreAllMocks(); });

describe('dispatchOrderStatusPushUseCase', () => {
    it('sends only allowlisted status copy and public tracking data after notification creation', async () => {
        const { useCase, deviceRepository, logRepository, adapter } = makeUseCase();
        const notCreated = await useCase.dispatchAccount(orderActivity(), { created: false });
        expect(notCreated.reason).toBe('notification_not_created');
        expect(deviceRepository.listActiveForAccount).not.toHaveBeenCalled();

        await useCase.dispatchAccount(orderActivity(), { eventKey: 'order:81:confirmed', created: true });
        const message = adapter.send.mock.calls[0][0][0];
        expect(message).toEqual({
            to: 'ExponentPushToken[abcdefghijk]',
            title: 'Order confirmed',
            body: 'The store confirmed your order.',
            data: { tracking_pin: 'SK-ABC123', store_slug: 'public-store' }
        });
        expect(JSON.stringify(message)).not.toMatch(/customer|phone|email|address|company_token/i);
        expect(logRepository.reservePending).toHaveBeenCalledWith(expect.objectContaining({
            token_hash: 'a'.repeat(64), purpose: 'order_status', status: 'pending'
        }), expect.objectContaining({ tokenLimit: 10, orderLimit: 15, owner: expect.objectContaining({ dgfy_account_id: orderActivity().dgfy_account_id }) }));
        expect(JSON.stringify(logRepository.reservePending.mock.calls[0][0])).not.toContain('ExponentPushToken');
    });

    it('dedupes an event and skips statuses outside the explicit allowlist', async () => {
        const { useCase, deviceRepository, logRepository, adapter } = makeUseCase();
        logRepository.reservePending.mockResolvedValue({ status: 'duplicate', log: null });
        await useCase.dispatchAccount(orderActivity(), { eventKey: 'order:81:confirmed', created: true });
        expect(adapter.send).not.toHaveBeenCalled();

        const skipped = await useCase.dispatchAccount(orderActivity({ status: 'packed' }), { created: true });
        expect(skipped.reason).toBe('status_not_notifiable');
        expect(deviceRepository.listActiveForAccount).toHaveBeenCalledTimes(1);
    });

    it('keeps provider failures out of the order transition and revokes guest devices on final status', async () => {
        const send = jest.fn().mockRejectedValue(Object.assign(new Error('provider failed'), { code: 'ETIMEDOUT' }));
        const { useCase, deviceRepository, logRepository } = makeUseCase({ send });
        const result = await useCase.dispatchGuest(orderActivity({ dgfy_account_id: null, status: 'completed' }));

        expect(result).toMatchObject({ status: 'completed', attempted: 1 });
        expect(logRepository.updateById).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
            status: 'failed', error_code: 'etimedout'
        }));
        expect(deviceRepository.revokeGuestOrderTokens).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: orderActivity().tenant_id,
            reference: 'SK-ABC123',
            posTransactionId: 37,
            reason: 'order_final'
        }));
    });

    it('revokes final guest tokens even when delivery logging is disabled', async () => {
        const previous = process.env.PUSH_DELIVERY_LOG_ENABLED;
        process.env.PUSH_DELIVERY_LOG_ENABLED = 'false';
        try {
            const { useCase, deviceRepository, logRepository } = makeUseCase();
            const result = await useCase.dispatchGuest(orderActivity({ dgfy_account_id: null, status: 'cancelled' }));
            expect(result.reason).toBe('delivery_logging_disabled');
            expect(logRepository.reservePending).not.toHaveBeenCalled();
            expect(deviceRepository.revokeGuestOrderTokens).toHaveBeenCalledWith(expect.objectContaining({ reason: 'order_final' }));
        } finally {
            if (previous === undefined) delete process.env.PUSH_DELIVERY_LOG_ENABLED;
            else process.env.PUSH_DELIVERY_LOG_ENABLED = previous;
        }
    });
});
