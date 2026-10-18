import { describe, expect, it, jest } from '@jest/globals';
import { buildRetryCommercePaymentRefundUseCase } from '../src/modules/commercePayments/usecases/commercePaymentAdminUseCases.js';

const session = {
  session_id: 10,
  public_reference: 'CPS-ABC123DEF4',
  total_amount_centavos: 10000,
  provider_payment_id: 'pay_1234567890'
};

const failedRefund = {
  refund_id: 20,
  public_reference: 'CRF-ORIGINAL01',
  payment_session_id: session.session_id,
  status: 'failed',
  amount_centavos: 5000,
  refund_strategy: 'custom',
  reason: 'duplicate',
  split_refund_payload: {
    refund_sources: [{ merchant_id: 'org_child', split_type: 'fixed', value: 5000 }]
  }
};

const buildUseCase = ({ original = failedRefund, refunds = [], providerRefunds = [], createResult } = {}) => {
  const commercePaymentRepository = {
    findSessionByPublicReference: jest.fn().mockResolvedValue(session),
    findRefundByPublicReference: jest.fn().mockResolvedValue(original),
    listRefundsBySession: jest.fn().mockResolvedValue(refunds),
    findRefundByProviderId: jest.fn().mockResolvedValue(null),
    createAuditLog: jest.fn().mockResolvedValue(null)
  };
  const paymongoService = { listPaymentRefunds: jest.fn().mockResolvedValue(providerRefunds) };
  const createCommercePaymentRefundUseCase = jest.fn().mockResolvedValue(createResult || {
    success: true,
    data: { refund: { refund_id: 'CRF-RETRY0001', amount_centavos: 5000 } },
    error: null,
    message: null
  });
  return {
    useCase: buildRetryCommercePaymentRefundUseCase({
      commercePaymentRepository,
      paymongoService,
      createCommercePaymentRefundUseCase
    }),
    commercePaymentRepository,
    paymongoService,
    createCommercePaymentRefundUseCase
  };
};

describe('commerce refund retry', () => {
  it('creates a new attempt with the original amount, reason, strategy, and audit link', async () => {
    const harness = buildUseCase();
    const result = await harness.useCase({
      paymentSessionId: session.public_reference,
      refundId: failedRefund.public_reference,
      actor: 'admin@example.com'
    });

    expect(result.success).toBe(true);
    expect(harness.createCommercePaymentRefundUseCase).toHaveBeenCalledWith({
      paymentSessionId: session.public_reference,
      payload: {
        amount_centavos: 5000,
        refund_strategy: 'custom',
        reason: 'duplicate',
        notes: 'Retry of CRF-ORIGINAL01',
        refund_sources: [{ merchant_id: 'org_child', split_type: 'fixed', value: 5000 }]
      },
      actor: 'admin@example.com',
      retryOfRefundReference: 'CRF-ORIGINAL01'
    });
    expect(harness.commercePaymentRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({
        event: 'commerce_payment_refund_retried',
        retry_of: 'CRF-ORIGINAL01'
      })
    }));
    expect(failedRefund.status).toBe('failed');
  });

  it('allows retry after not-found review but refuses other manual-review rows', async () => {
    const eligible = buildUseCase({
      original: { ...failedRefund, status: 'manual_review_required', failure_code: 'PROVIDER_REFUND_NOT_FOUND' }
    });
    expect((await eligible.useCase({ paymentSessionId: session.public_reference, refundId: failedRefund.public_reference })).success).toBe(true);

    const ambiguous = buildUseCase({
      original: { ...failedRefund, status: 'manual_review_required', failure_code: 'PROVIDER_REFUND_AMBIGUOUS_MATCH' }
    });
    const result = await ambiguous.useCase({ paymentSessionId: session.public_reference, refundId: failedRefund.public_reference });
    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(409);
    expect(ambiguous.createCommercePaymentRefundUseCase).not.toHaveBeenCalled();
  });

  it('refuses an active refund and an unlinked provider refund with the same amount', async () => {
    const active = buildUseCase({ refunds: [
      { refund_id: 21, status: 'created' }
    ] });
    const activeResult = await active.useCase({ paymentSessionId: session.public_reference, refundId: failedRefund.public_reference });
    expect(activeResult.success).toBe(false);
    expect(activeResult.error.statusCode).toBe(409);

    const providerDuplicate = buildUseCase({
      providerRefunds: [{ id: 'ref_unlinked', attributes: { amount: 5000 } }]
    });
    const duplicateResult = await providerDuplicate.useCase({ paymentSessionId: session.public_reference, refundId: failedRefund.public_reference });
    expect(duplicateResult.success).toBe(false);
    expect(duplicateResult.error.statusCode).toBe(409);
    expect(providerDuplicate.paymongoService.listPaymentRefunds).toHaveBeenCalledWith(session.provider_payment_id);
    expect(providerDuplicate.createCommercePaymentRefundUseCase).not.toHaveBeenCalled();
  });

  it.each(['pending', 'succeeded'])('refuses a %s original attempt', async (status) => {
    const harness = buildUseCase({ original: { ...failedRefund, status } });
    const result = await harness.useCase({ paymentSessionId: session.public_reference, refundId: failedRefund.public_reference });
    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(409);
    expect(harness.createCommercePaymentRefundUseCase).not.toHaveBeenCalled();
  });
});
