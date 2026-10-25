import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const isEmailConfigured = jest.fn();
const sendStorefrontOrderConfirmationEmail = jest.fn();
const findTenantById = jest.fn();
const buildStorefrontTrackingUrl = jest.fn();
const raiseOperationalAlert = jest.fn().mockResolvedValue(undefined);
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn() };

jest.unstable_mockModule('../src/config/logger.js', () => ({ default: logger }));
jest.unstable_mockModule('../src/services/emailService.js', () => ({
    isEmailConfigured,
    sendStorefrontOrderConfirmationEmail
}));
jest.unstable_mockModule('../src/services/operationalAlertService.js', () => ({ raiseOperationalAlert }));
jest.unstable_mockModule('../src/modules/dgfy/repositories/dgfyCustomerRepository.js', () => ({
    dgfyCustomerRepository: { findTenantById }
}));
jest.unstable_mockModule('../src/modules/dgfy/services/storefrontOrderTrackingUrl.js', () => ({
    buildStorefrontTrackingUrl
}));

const { dispatchDgfyOrderConfirmationEmail } = await import('../src/modules/dgfy/services/dgfyOrderConfirmationEmail.js');

const order = {
    pos_transaction_id: 42,
    tracking_pin: 'SK-ABC123',
    customer_email: ' Buyer@Example.test ',
    delivery_address: '123 Market Road'
};
const originalEnv = { ...process.env };

describe('dispatchDgfyOrderConfirmationEmail', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
        process.env = { ...originalEnv };
        delete process.env.STOREFRONT_ORDER_CONFIRMATION_EMAIL_ENABLED;
        isEmailConfigured.mockReturnValue(true);
        sendStorefrontOrderConfirmationEmail.mockResolvedValue({ deliveryId: 'delivery-1' });
        findTenantById.mockResolvedValue({ name: 'Main Street Cafe' });
        buildStorefrontTrackingUrl.mockResolvedValue('https://shop.example.test/track?pin=SK-ABC123');
    });

    afterEach(() => {
        jest.useRealTimers();
        process.env = { ...originalEnv };
    });

    it('sends to the normalized order email with store context and tracking URL', async () => {
        await expect(dispatchDgfyOrderConfirmationEmail({ tenantId: 'tenant-1', order }))
            .resolves.toEqual({ sent: true, deliveryId: 'delivery-1' });

        expect(findTenantById).toHaveBeenCalledWith('tenant-1');
        expect(buildStorefrontTrackingUrl).toHaveBeenCalledWith({ tenantId: 'tenant-1', trackingPin: 'SK-ABC123' });
        expect(sendStorefrontOrderConfirmationEmail).toHaveBeenCalledWith(expect.objectContaining({
            email: 'buyer@example.test',
            storeName: 'Main Street Cafe',
            order,
            trackingUrl: 'https://shop.example.test/track?pin=SK-ABC123',
            tenantId: 'tenant-1'
        }));
    });

    it('falls back to the linked customer email and the DGFY store-name fallback', async () => {
        findTenantById.mockResolvedValue(null);
        await expect(dispatchDgfyOrderConfirmationEmail({
            tenantId: 'tenant-1',
            order: { ...order, customer_email: null },
            storeCustomer: { email: 'linked@example.test' }
        })).resolves.toMatchObject({ sent: true });

        expect(sendStorefrontOrderConfirmationEmail).toHaveBeenCalledWith(expect.objectContaining({
            email: 'linked@example.test',
            storeName: 'DGFY'
        }));
    });

    it('skips missing context, unusable email, unconfigured SMTP, and the kill switch', async () => {
        await expect(dispatchDgfyOrderConfirmationEmail({ tenantId: null, order }))
            .resolves.toEqual({ sent: false, skipped: 'missing_order_context' });

        await expect(dispatchDgfyOrderConfirmationEmail({
            tenantId: 'tenant-1', order: { ...order, customer_email: 'not-an-email' }
        })).resolves.toEqual({ sent: false, skipped: 'no_usable_email' });
        expect(findTenantById).not.toHaveBeenCalled();

        isEmailConfigured.mockReturnValue(false);
        await expect(dispatchDgfyOrderConfirmationEmail({ tenantId: 'tenant-1', order }))
            .resolves.toEqual({ sent: false, skipped: 'email_not_configured' });

        process.env.STOREFRONT_ORDER_CONFIRMATION_EMAIL_ENABLED = 'false';
        await expect(dispatchDgfyOrderConfirmationEmail({ tenantId: 'tenant-1', order }))
            .resolves.toEqual({ sent: false, skipped: 'disabled' });
        expect(sendStorefrontOrderConfirmationEmail).not.toHaveBeenCalled();
    });

    it('swallows tenant and send failures without exposing order PII in alerts or logs', async () => {
        findTenantById.mockRejectedValueOnce(Object.assign(new Error('tenant lookup failed'), { code: 'DB_DOWN' }));
        await expect(dispatchDgfyOrderConfirmationEmail({ tenantId: 'tenant-1', order }))
            .resolves.toEqual({ sent: false, skipped: 'dispatch_failed' });
        expect(raiseOperationalAlert).toHaveBeenCalledWith({
            key: 'email.order_confirmation_dispatch_failed',
            context: { event: 'placed' }
        });

        raiseOperationalAlert.mockClear();
        sendStorefrontOrderConfirmationEmail.mockRejectedValueOnce(Object.assign(new Error('SMTP rejected'), { code: 'SMTP_REJECTED' }));
        await expect(dispatchDgfyOrderConfirmationEmail({ tenantId: 'tenant-1', order }))
            .resolves.toEqual({ sent: false, skipped: 'dispatch_failed' });
        expect(raiseOperationalAlert).not.toHaveBeenCalled();
        const reports = JSON.stringify({ alerts: raiseOperationalAlert.mock.calls, logs: logger.warn.mock.calls });
        expect(reports).not.toContain('buyer@example.test');
        expect(reports).not.toContain('SK-ABC123');
        expect(reports).not.toContain('123 Market Road');
        expect(reports).toContain('42');
    });

    it('times out after ten seconds and raises a PII-free operational alert', async () => {
        jest.useFakeTimers();
        sendStorefrontOrderConfirmationEmail.mockImplementation(() => new Promise(() => {}));
        const pending = dispatchDgfyOrderConfirmationEmail({ tenantId: 'tenant-1', order });
        await jest.advanceTimersByTimeAsync(10_000);

        await expect(pending).resolves.toEqual({ sent: false, skipped: 'timeout' });
        expect(raiseOperationalAlert).toHaveBeenCalledWith({
            key: 'email.order_confirmation_dispatch_failed',
            context: { event: 'placed' }
        });
        expect(JSON.stringify(raiseOperationalAlert.mock.calls)).not.toContain('buyer@example.test');
        expect(JSON.stringify(raiseOperationalAlert.mock.calls)).not.toContain('SK-ABC123');
        expect(JSON.stringify(raiseOperationalAlert.mock.calls)).not.toContain('123 Market Road');
    });
});
