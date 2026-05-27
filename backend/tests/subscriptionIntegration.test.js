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
const { DgfyAccount } = await import('../src/models/index.js');
const { generateDgfyToken } = await import('../src/modules/dgfy/usecases/dgfyAuthUseCases.js');

describe('Subscription integration hard-disable policy', () => {
    let dgfyAccount;
    let dgfyToken;

    beforeAll(async () => {
        const suffix = Date.now();
        dgfyAccount = await DgfyAccount.create({
            first_name: 'Subscription',
            last_name: 'Disabled',
            username: `subscription_disabled_${suffix}`,
            email: `subscription-disabled-${suffix}@test.local`,
            phone: `+63919${String(suffix).slice(-7).padStart(7, '0')}`,
            password_hash: '$2y$10$abcdefghijklmnopqrstuv',
            is_active: true
        });
        dgfyToken = generateDgfyToken(dgfyAccount);
    });

    afterAll(async () => {
        if (dgfyAccount) {
            await DgfyAccount.destroy({ where: { id: dgfyAccount.id } });
        }
    });

    it('returns 503 for upgrade route with PAYMENTS_DISABLED contract', async () => {
        const response = await request(app)
            .post('/api/v1/payments/upgrade')
            .send({ subscriptionId: 'SUB-TEST-DISABLED' });

        expect(response.status).toBe(503);
        expect(response.body?.success).toBe(false);
        expect(response.body?.code).toBe('PAYMENTS_DISABLED');
    });

    it('blocks subscription-driven registration while payments are disabled', async () => {
        const response = await request(app)
            .post('/api/v1/admin/tenants/register')
            .set('Authorization', `Bearer ${dgfyToken}`)
            .send({
                name: 'Disabled Premium Registration Co',
                plan: 'premium',
                workflowMode: 'msme',
                subscriptionId: 'SUB-REGISTER-DISABLED'
            });

        expect(response.status).toBe(503);
        expect(response.body?.success).toBe(false);
        expect(response.body?.code).toBe('PAYMENTS_DISABLED');
    });
});
