import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest
} from '@jest/globals';

const { buildConfirmCommercePaymentSessionSandboxUseCase } = await import(
  '../src/modules/commercePayments/usecases/commercePaymentAdminUseCases.js'
);

const baseSession = {
  session_id: 77,
  public_reference: 'CPS-SANDBOX001',
  tenant_id: '550e8400-e29b-41d4-a716-446655440000',
  store_slug: 'masu-cafe',
  provider: 'paymongo',
  target_type: 'store_order',
  status: 'awaiting_payment',
  idempotency_key: 'checkout:CPS-SANDBOX001',
  total_amount: '150.0000',
  total_amount_centavos: 15000,
  currency: 'PHP',
  qr_code_image_url: 'https://example.test/qr.png',
  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  provider_payment_intent_id: 'pi_sandbox_test',
  provider_payment_id: null,
  paid_at: null,
  finalized_at: null,
  pos_transaction_id: null,
  tracking_pin: null,
  failure_code: null,
  failure_reason: null
};

const buildRepository = (overrides = {}) => ({
  findSessionByPublicReference: jest.fn().mockResolvedValue(baseSession),
  listRefundsBySession: jest.fn().mockResolvedValue([]),
  createAuditLog: jest.fn().mockResolvedValue(null),
  ...overrides
});

describe('commerce payment admin sandbox confirmation (#1268)', () => {
  const originalMode = process.env.PAYMONGO_MODE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PAYMONGO_MODE = 'test';
  });

  afterEach(() => {
    process.env.PAYMONGO_MODE = originalMode;
  });

  it('404s when PayMongo is not in test mode, regardless of admin auth', async () => {
    process.env.PAYMONGO_MODE = 'live';
    const commercePaymentRepository = buildRepository();
    const paymongoService = { confirmSandboxQrphPayment: jest.fn() };
    const useCase = buildConfirmCommercePaymentSessionSandboxUseCase({ commercePaymentRepository, paymongoService });

    const result = await useCase({ paymentSessionId: baseSession.public_reference });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(404);
    expect(commercePaymentRepository.findSessionByPublicReference).not.toHaveBeenCalled();
    expect(paymongoService.confirmSandboxQrphPayment).not.toHaveBeenCalled();
  });

  it('404s when the session does not exist', async () => {
    const commercePaymentRepository = buildRepository({ findSessionByPublicReference: jest.fn().mockResolvedValue(null) });
    const paymongoService = { confirmSandboxQrphPayment: jest.fn() };
    const useCase = buildConfirmCommercePaymentSessionSandboxUseCase({ commercePaymentRepository, paymongoService });

    const result = await useCase({ paymentSessionId: 'CPS-MISSING0001' });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(404);
  });

  it('confirms the sandbox payment on the happy path and writes an audit log', async () => {
    const commercePaymentRepository = buildRepository();
    const paymongoService = {
      confirmSandboxQrphPayment: jest.fn().mockResolvedValue({
        paymentIntent: { attributes: { amount: 15000, currency: 'PHP' } }
      })
    };
    const useCase = buildConfirmCommercePaymentSessionSandboxUseCase({ commercePaymentRepository, paymongoService });

    const result = await useCase({ paymentSessionId: baseSession.public_reference, actor: 'admin@example.com' });

    expect(result.success).toBe(true);
    expect(result.data.confirmation_requested).toBe(true);
    expect(result.data.idempotent_replay).toBe(false);
    expect(paymongoService.confirmSandboxQrphPayment).toHaveBeenCalledWith({
      paymentIntentId: baseSession.provider_payment_intent_id,
      expectedAmount: baseSession.total_amount_centavos,
      expectedCurrency: baseSession.currency
    });
    expect(commercePaymentRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({ event: 'commerce_payment_sandbox_confirmation_requested' })
    }));
  });

  it('is idempotent when the session is already finalized', async () => {
    const commercePaymentRepository = buildRepository({
      findSessionByPublicReference: jest.fn().mockResolvedValue({ ...baseSession, status: 'finalized' })
    });
    const paymongoService = { confirmSandboxQrphPayment: jest.fn() };
    const useCase = buildConfirmCommercePaymentSessionSandboxUseCase({ commercePaymentRepository, paymongoService });

    const result = await useCase({ paymentSessionId: baseSession.public_reference });

    expect(result.success).toBe(true);
    expect(result.data.idempotent_replay).toBe(true);
    expect(paymongoService.confirmSandboxQrphPayment).not.toHaveBeenCalled();
  });

  it('conflicts when the session is not awaiting payment', async () => {
    const commercePaymentRepository = buildRepository({
      findSessionByPublicReference: jest.fn().mockResolvedValue({ ...baseSession, status: 'paid' })
    });
    const paymongoService = { confirmSandboxQrphPayment: jest.fn() };
    const useCase = buildConfirmCommercePaymentSessionSandboxUseCase({ commercePaymentRepository, paymongoService });

    const result = await useCase({ paymentSessionId: baseSession.public_reference });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(409);
    expect(paymongoService.confirmSandboxQrphPayment).not.toHaveBeenCalled();
  });

  it('conflicts when there is no provider payment intent', async () => {
    const commercePaymentRepository = buildRepository({
      findSessionByPublicReference: jest.fn().mockResolvedValue({ ...baseSession, provider_payment_intent_id: null })
    });
    const paymongoService = { confirmSandboxQrphPayment: jest.fn() };
    const useCase = buildConfirmCommercePaymentSessionSandboxUseCase({ commercePaymentRepository, paymongoService });

    const result = await useCase({ paymentSessionId: baseSession.public_reference });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(409);
  });

  it('conflicts when the QR Ph session has expired', async () => {
    const commercePaymentRepository = buildRepository({
      findSessionByPublicReference: jest.fn().mockResolvedValue({
        ...baseSession,
        expires_at: new Date(Date.now() - 60 * 1000).toISOString()
      })
    });
    const paymongoService = { confirmSandboxQrphPayment: jest.fn() };
    const useCase = buildConfirmCommercePaymentSessionSandboxUseCase({ commercePaymentRepository, paymongoService });

    const result = await useCase({ paymentSessionId: baseSession.public_reference });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(409);
    expect(paymongoService.confirmSandboxQrphPayment).not.toHaveBeenCalled();
  });

  it('conflicts when PayMongo reports a mismatched amount/currency', async () => {
    const commercePaymentRepository = buildRepository();
    const paymongoService = {
      confirmSandboxQrphPayment: jest.fn().mockResolvedValue({
        paymentIntent: { attributes: { amount: 99999, currency: 'PHP' } }
      })
    };
    const useCase = buildConfirmCommercePaymentSessionSandboxUseCase({ commercePaymentRepository, paymongoService });

    const result = await useCase({ paymentSessionId: baseSession.public_reference });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(409);
  });
});
