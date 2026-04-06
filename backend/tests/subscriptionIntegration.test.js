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

describe('Subscription integration hard-disable policy', () => {
    it('returns 503 for upgrade route with PAYMENTS_DISABLED contract', async () => {
        const response = await request(app)
            .post('/api/v1/payments/upgrade')
            .send({ subscriptionId: 'SUB-TEST-DISABLED' });

        expect(response.status).toBe(503);
        expect(response.body?.success).toBe(false);
        expect(response.body?.code).toBe('PAYMENTS_DISABLED');
    });

    it('blocks premium registration while payments are disabled', async () => {
        const response = await request(app)
            .post('/api/v1/admin/tenants/register')
            .send({
                name: 'Disabled Premium Registration Co',
                adminEmail: 'disabled-premium@test.local',
                adminPassword: 'Password123!',
                plan: 'premium',
                subscriptionId: 'SUB-REGISTER-DISABLED'
            });

        expect(response.status).toBe(503);
        expect(response.body?.success).toBe(false);
        expect(response.body?.code).toBe('PAYMENTS_DISABLED');
    });
});
