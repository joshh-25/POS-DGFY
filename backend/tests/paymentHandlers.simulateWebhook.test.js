import { jest } from '@jest/globals';

const mockHandleWebhookUseCase = jest.fn();
const mockCancelSubscriptionUseCase = jest.fn();
const mockGetBillingHistoryUseCase = jest.fn();
const mockSyncWithPayPalUseCase = jest.fn();
const mockUpgradeToPremiumUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/payments/index.js', () => ({
  handleWebhookUseCase: mockHandleWebhookUseCase,
  cancelSubscriptionUseCase: mockCancelSubscriptionUseCase,
  getBillingHistoryUseCase: mockGetBillingHistoryUseCase,
  syncWithPayPalUseCase: mockSyncWithPayPalUseCase,
  upgradeToPremiumUseCase: mockUpgradeToPremiumUseCase
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

let simulateWebhook;
const originalNodeEnv = process.env.NODE_ENV;

beforeAll(async () => {
  const mod = await import('../src/modules/payments/controllers/paymentHandlers.js');
  simulateWebhook = mod.simulateWebhook;
});

const makeRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('paymentHandlers.simulateWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('returns 400 when event_type is missing', async () => {
    const req = { body: {}, headers: {} };
    const res = makeRes();

    await simulateWebhook(req, res);

    expect(mockHandleWebhookUseCase).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'event_type is required'
    });
  });

  it('processes simulated webhook with signature bypass enabled', async () => {
    mockHandleWebhookUseCase.mockResolvedValue({
      success: true,
      data: { format: 'text', body: 'OK' }
    });

    const req = {
      body: {
        id: 'SIM-001',
        event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
        resource: { id: 'I-SUB-123' }
      },
      headers: {}
    };
    const res = makeRes();

    await simulateWebhook(req, res);

    expect(mockHandleWebhookUseCase).toHaveBeenCalledWith({
      body: {
        id: 'SIM-001',
        event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
        resource: { id: 'I-SUB-123' }
      },
      headers: expect.objectContaining({
        'paypal-transmission-id': expect.any(String)
      }),
      bypassSignature: true
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Simulated webhook processed successfully',
      data: {
        event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
        webhook_id: 'SIM-001'
      }
    });
  });
});
