import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const sendSmsUseCase = jest.fn();
const raiseSmsOperationalAlert = jest.fn().mockResolvedValue(undefined);
const findTenantById = jest.fn();

jest.unstable_mockModule('../src/modules/smsDelivery/index.js', () => ({
    sendSmsUseCase,
    raiseSmsOperationalAlert,
    toE164: (raw) => {
        if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'empty_phone' };
        const digits = raw.replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('0')) return { ok: true, e164: `+63${digits.slice(1)}` };
        if (digits.length === 12 && digits.startsWith('63')) return { ok: true, e164: `+${digits}` };
        return { ok: false, reason: 'invalid_phone' };
    }
}));
jest.unstable_mockModule('../src/modules/dgfy/repositories/dgfyCustomerRepository.js', () => ({
    dgfyCustomerRepository: { findTenantById }
}));

const { dispatchDgfyOrderSmsAlert } = await import('../src/modules/dgfy/services/dgfyOrderSmsAlerts.js');

const order = {
    pos_transaction_id: 42,
    tracking_pin: 'SK-ABC123',
    customer_phone: '09171234567'
};

describe('dispatchDgfyOrderSmsAlert', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
        findTenantById.mockResolvedValue({ name: 'Main Street Cafe' });
        sendSmsUseCase.mockResolvedValue({ status: 'completed', deliveries: [{ status: 'accepted' }] });
    });

    afterEach(() => jest.useRealTimers());

    it.each(['placed', 'delivered'])('sends a transactional %s alert with normalized phone and replay key', async (event) => {
        const result = await dispatchDgfyOrderSmsAlert({ tenantId: 'tenant-1', order, event });

        expect(result).toMatchObject({ sent: true, status: 'completed' });
        expect(sendSmsUseCase).toHaveBeenCalledTimes(1);
        expect(sendSmsUseCase).toHaveBeenCalledWith(expect.objectContaining({
            recipients: ['+639171234567'],
            purpose: 'transactional_order',
            tenantId: 'tenant-1',
            orderId: null,
            dedupeKey: `order-alert:tenant-1:42:${event}`,
            correlation: { event, tenant_id: 'tenant-1', pos_transaction_id: 42 }
        }));
        expect(sendSmsUseCase.mock.calls[0][0].content).toContain('SK-ABC123');
    });

    it('falls back to the linked customer phone and store name fallback', async () => {
        findTenantById.mockResolvedValue(null);
        const result = await dispatchDgfyOrderSmsAlert({
            tenantId: 'tenant-1',
            order: { ...order, customer_phone: null },
            storeCustomer: { phone: '09181234567' },
            event: 'placed'
        });

        expect(result.sent).toBe(true);
        expect(sendSmsUseCase.mock.calls[0][0]).toMatchObject({
            recipients: ['+639181234567'],
            content: 'DGFY: we received your order SK-ABC123.'
        });
    });

    it('skips missing and invalid numbers without calling the sender', async () => {
        await expect(dispatchDgfyOrderSmsAlert({
            tenantId: 'tenant-1', order: { ...order, customer_phone: null }, event: 'placed'
        })).resolves.toEqual({ sent: false, skipped: 'no_usable_phone' });
        await expect(dispatchDgfyOrderSmsAlert({
            tenantId: 'tenant-1', order: { ...order, customer_phone: 'not a phone' }, event: 'placed'
        })).resolves.toEqual({ sent: false, skipped: 'no_usable_phone' });

        expect(sendSmsUseCase).not.toHaveBeenCalled();
        expect(findTenantById).not.toHaveBeenCalled();
    });

    it('swallows tenant lookup and sender failures and raises a PII-free alert', async () => {
        findTenantById.mockRejectedValueOnce(new Error('tenant read failed'));
        await expect(dispatchDgfyOrderSmsAlert({ tenantId: 'tenant-1', order, event: 'placed' }))
            .resolves.toMatchObject({ sent: false, skipped: 'dispatch_failed' });
        expect(sendSmsUseCase).not.toHaveBeenCalled();

        sendSmsUseCase.mockRejectedValueOnce(new Error('provider failed'));
        await expect(dispatchDgfyOrderSmsAlert({ tenantId: 'tenant-1', order, event: 'delivered' }))
            .resolves.toMatchObject({ sent: false, skipped: 'dispatch_failed' });
        expect(raiseSmsOperationalAlert).toHaveBeenCalledTimes(2);
        expect(raiseSmsOperationalAlert).toHaveBeenCalledWith({
            key: 'sms.order_alert_dispatch_failed', context: { event: 'delivered' }
        });
        expect(JSON.stringify(raiseSmsOperationalAlert.mock.calls)).not.toContain('09171234567');
        expect(JSON.stringify(raiseSmsOperationalAlert.mock.calls)).not.toContain('SK-ABC123');
    });

    it('bounds dispatch time and resolves with timeout when a sender stalls', async () => {
        jest.useFakeTimers();
        sendSmsUseCase.mockImplementation(() => new Promise(() => {}));
        const pending = dispatchDgfyOrderSmsAlert({ tenantId: 'tenant-1', order, event: 'placed' });
        await jest.advanceTimersByTimeAsync(5_000);

        await expect(pending).resolves.toEqual({ sent: false, skipped: 'timeout' });
        expect(raiseSmsOperationalAlert).toHaveBeenCalledWith({
            key: 'sms.order_alert_dispatch_failed', context: { event: 'placed' }
        });
    });
});
