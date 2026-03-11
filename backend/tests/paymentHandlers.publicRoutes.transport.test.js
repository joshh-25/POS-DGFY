import { jest } from '@jest/globals';

const mockHandleWebhookUseCase = jest.fn();
const mockCancelSubscriptionUseCase = jest.fn();
const mockGetBillingHistoryUseCase = jest.fn();
const mockSyncWithPayPalUseCase = jest.fn();
const mockUpgradeToPremiumUseCase = jest.fn();
const mockMigrateToPayPalUseCase = jest.fn();
const mockChangePlanUseCase = jest.fn();
const mockRequestReactivationUseCase = jest.fn();
const mockReactivateWithPayPalUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/payments/index.js', () => ({
    handleWebhookUseCase: mockHandleWebhookUseCase,
    cancelSubscriptionUseCase: mockCancelSubscriptionUseCase,
    getBillingHistoryUseCase: mockGetBillingHistoryUseCase,
    syncWithPayPalUseCase: mockSyncWithPayPalUseCase,
    upgradeToPremiumUseCase: mockUpgradeToPremiumUseCase,
    migrateToPayPalUseCase: mockMigrateToPayPalUseCase,
    changePlanUseCase: mockChangePlanUseCase,
    requestReactivationUseCase: mockRequestReactivationUseCase,
    reactivateWithPayPalUseCase: mockReactivateWithPayPalUseCase,
    paymentRepository: {}
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

let requestReactivation;
let reactivateWithPayPal;
let migrateToPayPal;

beforeAll(async () => {
    const mod = await import('../src/modules/payments/controllers/paymentHandlers.js');
    requestReactivation = mod.requestReactivation;
    reactivateWithPayPal = mod.reactivateWithPayPal;
    migrateToPayPal = mod.migrateToPayPal;
});

const createRes = () => {
    const res = {
        status: jest.fn(),
        json: jest.fn()
    };
    res.status.mockReturnValue(res);
    return res;
};

describe('payment handlers transport contracts (public + migrate)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('requestReactivation returns 400 without tenant context', async () => {
        const req = { tenant: null };
        const res = createRes();

        await requestReactivation(req, res);

        expect(mockRequestReactivationUseCase).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            message: 'Company token required'
        });
    });

    it('requestReactivation passes tenantId to use-case and returns success payload', async () => {
        mockRequestReactivationUseCase.mockResolvedValue({
            success: true,
            data: { message: 'Reactivation request submitted.' }
        });
        const req = { tenant: { id: 'tenant-100' } };
        const res = createRes();

        await requestReactivation(req, res);

        expect(mockRequestReactivationUseCase).toHaveBeenCalledWith({ tenantId: 'tenant-100' });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: 'Reactivation request submitted.',
            data: { message: 'Reactivation request submitted.' }
        });
    });

    it('reactivateWithPayPal returns 400 without tenant context', async () => {
        const req = { tenant: null, body: { subscriptionId: 'I-XYZ' } };
        const res = createRes();

        await reactivateWithPayPal(req, res);

        expect(mockReactivateWithPayPalUseCase).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            message: 'Company token required'
        });
    });

    it('reactivateWithPayPal forwards correlation id and payload to use-case', async () => {
        mockReactivateWithPayPalUseCase.mockResolvedValue({
            success: true,
            data: { message: 'Account reactivated successfully.', plan: 'standard' }
        });
        const req = {
            tenant: { id: 'tenant-200' },
            body: { subscriptionId: 'I-REACTIVATE' },
            requestId: 'req-reactivate-handler'
        };
        const res = createRes();

        await reactivateWithPayPal(req, res);

        expect(mockReactivateWithPayPalUseCase).toHaveBeenCalledWith({
            tenantId: 'tenant-200',
            userId: null,
            subscriptionId: 'I-REACTIVATE',
            correlationId: 'req-reactivate-handler'
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('migrateToPayPal forwards user + correlation id to use-case', async () => {
        mockMigrateToPayPalUseCase.mockResolvedValue({
            success: true,
            data: {
                payment_method: 'paypal',
                paypal_subscription_id: 'I-MIGRATE'
            }
        });
        const req = {
            tenant: { id: 'tenant-300' },
            user: { user_id: 77 },
            body: { subscriptionId: 'I-MIGRATE' },
            requestId: 'req-migrate-handler',
            headers: {}
        };
        const res = createRes();

        await migrateToPayPal(req, res);

        expect(mockMigrateToPayPalUseCase).toHaveBeenCalledWith({
            tenantId: 'tenant-300',
            userId: 77,
            subscriptionId: 'I-MIGRATE',
            correlationId: 'req-migrate-handler'
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
