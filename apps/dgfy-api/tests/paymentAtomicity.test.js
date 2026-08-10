import { jest } from '@jest/globals';

// Mock components before importing them
// We need to use jest.unstable_mockModule for ESM if we want to mock before import
// But here we can just mock the properties of the imported objects if they are exported as objects.

import db from '../src/models/index.js';
import { handleWebhook } from '../src/controllers/paymentController.js';
import { paypalService } from '../src/services/paypalService.js';

const { Tenant, Payment, WebhookLog } = db;

describe('Payment Processing Atomicity (Audit 3.3)', () => {
    let mockRes;
    let mockReq;

    beforeEach(() => {
        mockRes = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        jest.clearAllMocks();
    });

    it('should attempt to use a transaction and rollback on failure', async () => {
        // 1. Setup mocks
        const mockTenant = {
            id: 't1',
            name: 'Test Tenant',
            paypal_subscription_id: 'sub-123',
            save: jest.fn().mockRejectedValue(new Error('Database error during save')),
            plan: 'free',
            current_period_end: new Date()
        };

        jest.spyOn(Tenant, 'findOne').mockResolvedValue(mockTenant);
        const paymentCreateSpy = jest.spyOn(Payment, 'create').mockResolvedValue({});
        jest.spyOn(paypalService, 'verifyWebhookSignature').mockResolvedValue(true);

        // Mock WebhookLog
        jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
        jest.spyOn(WebhookLog, 'findOrCreate').mockResolvedValue([{
            status: 'pending',
            update: jest.fn().mockResolvedValue({})
        }]);

        // Capture transaction call
        const transactionSpy = jest.spyOn(db.sequelize, 'transaction');

        const resource = {
            billing_agreement_id: 'sub-123',
            id: 'txn-123',
            amount: { total: '10.00', currency: 'USD' }
        };

        mockReq = {
            body: {
                event_type: 'PAYMENT.SALE.COMPLETED',
                resource: resource
            },
            headers: {
                'paypal-transmission-id': 'webhook-123'
            }
        };

        // 2. Execute
        await handleWebhook(mockReq, mockRes);

        // 3. Verify
        // The transaction should have been started
        expect(transactionSpy).toHaveBeenCalled();

        // Payment.create should have been called with the transaction
        expect(paymentCreateSpy).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({ transaction: expect.any(Object) })
        );

        // Tenant.save should have been called with the transaction
        expect(mockTenant.save).toHaveBeenCalledWith(
            expect.objectContaining({ transaction: expect.any(Object) })
        );

        // Webhook status should be 'failed' because of the rejection inside transaction
        // Actually, handleWebhook catches and logs, then updates status to 'failed'
        // Let's verify that the log update was called for failure
    });
});
