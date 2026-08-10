import { jest } from '@jest/globals';
import request from 'supertest';

jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({
    default: {
        getConnection: jest.fn(),
        getPoolStats: jest.fn().mockReturnValue({ utilizationPercent: 0 }),
        startPeriodicCleanup: jest.fn(),
        closeAll: jest.fn()
    }
}));

jest.unstable_mockModule('../src/controllers/aiController.js', () => ({
    chat: jest.fn(),
    confirmAction: jest.fn(),
    cancelAction: jest.fn(),
    getConversations: jest.fn(),
    getConversation: jest.fn(),
    deleteConversation: jest.fn(),
    downloadExport: jest.fn(),
    getDiagnostics: jest.fn()
}));

const { default: app } = await import('../src/server.js');

describe('Payment lifecycle integration hard-disable policy', () => {
    it('returns 503 for migrate-to-paypal route', async () => {
        const response = await request(app)
            .post('/api/v1/payments/migrate-to-paypal')
            .send({ subscriptionId: 'SUB-MIGRATE-DISABLED' });

        expect(response.status).toBe(503);
        expect(response.body?.success).toBe(false);
        expect(response.body?.code).toBe('PAYMENTS_DISABLED');
    });

    it('returns 503 for reactivate-with-paypal route', async () => {
        const response = await request(app)
            .post('/api/v1/payments/reactivate-with-paypal')
            .send({ subscriptionId: 'SUB-REACTIVATE-DISABLED' });

        expect(response.status).toBe(503);
        expect(response.body?.success).toBe(false);
        expect(response.body?.code).toBe('PAYMENTS_DISABLED');
    });
});
