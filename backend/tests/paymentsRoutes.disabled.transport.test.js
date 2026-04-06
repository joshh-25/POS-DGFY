import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockAuthenticate = jest.fn((req, res, next) => next());
const noopHandler = (req, res) => res.status(200).json({ success: true });

jest.unstable_mockModule('../src/controllers/paymentController.js', () => ({
    handleWebhook: noopHandler,
    simulateWebhook: noopHandler,
    upgradeToPremium: noopHandler,
    cancelSubscription: noopHandler,
    cancelPayMongoSubscription: noopHandler,
    getBillingHistory: noopHandler,
    syncWithPayPal: noopHandler,
    syncWithPayMongo: noopHandler,
    migrateToPayPal: noopHandler,
    migrateToPayMongo: noopHandler,
    changePlan: noopHandler,
    changePayMongoPlan: noopHandler,
    setupPayMongoRecurring: noopHandler,
    getPendingPlan: noopHandler,
    requestReactivation: noopHandler,
    reactivateWithPayPal: noopHandler,
    reactivateWithPayMongo: noopHandler
}));

jest.unstable_mockModule('../src/middleware/auth.js', () => ({
    authenticate: mockAuthenticate
}));

jest.unstable_mockModule('../src/config/paymentsFeature.js', () => ({
    paymentsEnabled: false,
    paymentsDisabledMessage: 'Payments are temporarily disabled while the billing direction is being updated.'
}));

let app;

beforeAll(async () => {
    const routerModule = await import('../src/routes/payments.js');
    app = express();
    app.use(express.json());
    app.use('/api/v1/payments', routerModule.default);
});

describe('payments routes when payments are disabled', () => {
    beforeEach(() => {
        mockAuthenticate.mockClear();
    });

    it('returns 503 for a public payments route', async () => {
        const res = await request(app)
            .post('/api/v1/payments/request-reactivation')
            .send({});

        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({
            success: false,
            code: 'PAYMENTS_DISABLED'
        });
    });

    it('returns 503 before auth middleware for private payments route', async () => {
        const res = await request(app)
            .get('/api/v1/payments/history');

        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({
            success: false,
            code: 'PAYMENTS_DISABLED'
        });
        expect(mockAuthenticate).not.toHaveBeenCalled();
    });
});
