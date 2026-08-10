import {
  beforeEach,
  describe,
  expect,
  it,
  jest
} from '@jest/globals';

const processVerifiedPaidCommerceSession = jest.fn();

jest.unstable_mockModule('../src/modules/commercePayments/usecases/processVerifiedPaidCommerceSession.js', () => ({
  buildProcessVerifiedPaidCommerceSessionUseCase: jest.fn(() => processVerifiedPaidCommerceSession)
}));

jest.unstable_mockModule('../src/modules/commercePayments/usecases/finalizePaidCommerceSession.js', () => ({
  finalizePaidCommerceSession: jest.fn()
}));

jest.unstable_mockModule('../src/modules/tenantRevenue/index.js', () => ({
  recordSucceededTenantRevenueRefundUseCase: jest.fn()
}));

const { buildReconcileCommercePaymentSessionUseCase } = await import(
  '../src/modules/commercePayments/usecases/commercePaymentAdminUseCases.js'
);

const baseSession = {
  session_id: 44,
  public_reference: 'CPS-RECONCILE1',
  tenant_id: '550e8400-e29b-41d4-a716-446655440000',
  store_slug: 'masu-cafe',
  provider: 'paymongo',
  target_type: 'store_order',
  status: 'awaiting_payment',
  idempotency_key: 'checkout:CPS-RECONCILE1',
  total_amount: '150.0000',
  total_amount_centavos: 15000,
  currency: 'PHP',
  provider_payment_intent_id: 'pi_reconcile_test',
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

describe('commerce payment provider reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    processVerifiedPaidCommerceSession.mockResolvedValue({
      handled: true,
      status: 'finalized',
      payment_session: baseSession.public_reference
    });
  });

  it('reports the provider state without mutating the order when payment is not paid', async () => {
    const commercePaymentRepository = buildRepository();
    const paymongoService = {
      retrievePaymentIntent: jest.fn().mockResolvedValue({
        id: baseSession.provider_payment_intent_id,
        attributes: {
          status: 'awaiting_payment',
          payments: []
        }
      })
    };
    const useCase = buildReconcileCommercePaymentSessionUseCase({
      commercePaymentRepository,
      paymongoService
    });

    const result = await useCase({
      paymentSessionId: baseSession.public_reference,
      actor: 'admin@example.com'
    });

    expect(result.success).toBe(true);
    expect(result.data.reconciliation).toEqual({
      status: 'provider_not_paid',
      provider_status: 'awaiting_payment',
      provider_payment_id: null
    });
    expect(processVerifiedPaidCommerceSession).not.toHaveBeenCalled();
    expect(commercePaymentRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('requires a paid provider payment record before finalizing the order', async () => {
    const commercePaymentRepository = buildRepository({
      findSessionByPublicReference: jest.fn()
        .mockResolvedValueOnce(baseSession)
        .mockResolvedValueOnce({
          ...baseSession,
          status: 'finalized',
          provider_payment_id: 'pay_reconcile_test',
          pos_transaction_id: 9001,
          tracking_pin: 'SK-RECONCILE'
        })
    });
    const paymongoService = {
      retrievePaymentIntent: jest.fn().mockResolvedValue({
        id: baseSession.provider_payment_intent_id,
        attributes: {
          status: 'succeeded',
          amount: 15000,
          currency: 'PHP',
          payments: [{
            id: 'pay_reconcile_test',
            type: 'payment',
            attributes: {
              status: 'paid',
              amount: 15000,
              currency: 'PHP'
            }
          }]
        }
      })
    };
    const useCase = buildReconcileCommercePaymentSessionUseCase({
      commercePaymentRepository,
      paymongoService
    });

    const result = await useCase({
      paymentSessionId: baseSession.public_reference,
      actor: 'admin@example.com'
    });

    expect(result.success).toBe(true);
    expect(result.data.reconciliation).toEqual({
      status: 'finalized',
      provider_status: 'paid',
      provider_payment_id: 'pay_reconcile_test'
    });
    expect(processVerifiedPaidCommerceSession).toHaveBeenCalledWith({
      session: baseSession,
      actor: 'admin@example.com',
      resource: expect.objectContaining({
        id: 'pay_reconcile_test',
        type: 'payment',
        attributes: expect.objectContaining({
          status: 'paid',
          amount: 15000,
          currency: 'PHP',
          payment_intent_id: baseSession.provider_payment_intent_id
        })
      })
    });
    expect(commercePaymentRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({
        event: 'commerce_payment_provider_reconciled',
        provider_payment_id: 'pay_reconcile_test',
        final_status: 'finalized'
      })
    }));
  });

  it('does not infer payment success from an intent when its payment record is still pending', async () => {
    const commercePaymentRepository = buildRepository();
    const paymongoService = {
      retrievePaymentIntent: jest.fn().mockResolvedValue({
        id: baseSession.provider_payment_intent_id,
        attributes: {
          status: 'succeeded',
          payments: [{
            id: 'pay_pending_test',
            type: 'payment',
            attributes: {
              status: 'pending',
              amount: 15000,
              currency: 'PHP'
            }
          }]
        }
      })
    };
    const useCase = buildReconcileCommercePaymentSessionUseCase({
      commercePaymentRepository,
      paymongoService
    });

    const result = await useCase({ paymentSessionId: baseSession.public_reference });

    expect(result.success).toBe(true);
    expect(result.data.reconciliation.status).toBe('provider_not_paid');
    expect(result.data.reconciliation.provider_status).toBe('pending');
    expect(processVerifiedPaidCommerceSession).not.toHaveBeenCalled();
  });

  it('stops safely when PayMongo reports success without a payment record', async () => {
    const commercePaymentRepository = buildRepository();
    const paymongoService = {
      retrievePaymentIntent: jest.fn().mockResolvedValue({
        id: baseSession.provider_payment_intent_id,
        attributes: {
          status: 'succeeded',
          amount: 15000,
          currency: 'PHP',
          payments: []
        }
      })
    };
    const useCase = buildReconcileCommercePaymentSessionUseCase({
      commercePaymentRepository,
      paymongoService
    });

    const result = await useCase({ paymentSessionId: baseSession.public_reference });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('CONFLICT');
    expect(result.error.statusCode).toBe(409);
    expect(processVerifiedPaidCommerceSession).not.toHaveBeenCalled();
  });
});
