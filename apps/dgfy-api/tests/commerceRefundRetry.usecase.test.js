import { describe, expect, it, jest } from '@jest/globals';
import {
  buildListCommercePaymentRefundsUseCase,
  buildRetryCommercePaymentRefundUseCase
} from '../src/modules/commercePayments/usecases/commercePaymentAdminUseCases.js';

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

const retryReason = 'Provider confirmed no refund exists';

const buildUseCase = ({
  original = failedRefund,
  sessionRecord = session,
  refunds = [],
  retryChild = null,
  providerRefunds = [],
  providerError = null,
  providerReadAvailable = true,
  createResult = null
} = {}) => {
  const commercePaymentRepository = {
    findSessionByPublicReference: jest.fn().mockResolvedValue(sessionRecord),
    findRefundByPublicReference: jest.fn().mockResolvedValue(original),
    findRetryChildOf: jest.fn().mockResolvedValue(retryChild),
    listRefundsBySession: jest.fn().mockResolvedValue(refunds),
    findRefundByProviderId: jest.fn().mockResolvedValue(null),
    createAuditLog: jest.fn().mockResolvedValue(null),
    updateRefundById: jest.fn().mockResolvedValue(null)
  };
  const paymongoService = providerReadAvailable
    ? { listPaymentRefunds: providerError
      ? jest.fn().mockRejectedValue(providerError)
      : jest.fn().mockResolvedValue(providerRefunds) }
    : {};
  const defaultCreateResult = {
    success: true,
    data: {
      refund: {
        refund_id: 'CRF-RETRY0001',
        public_reference: 'CRF-RETRY0001',
        amount_centavos: 5000,
        status: 'pending',
        provider_refund_id: 'ref_retry'
      }
    },
    error: null,
    message: null
  };
  const createCommercePaymentRefundUseCase = jest.fn().mockResolvedValue(createResult || defaultCreateResult);
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

const runRetry = (harness, overrides = {}) => harness.useCase({
  paymentSessionId: session.public_reference,
  refundId: failedRefund.public_reference,
  actor: 'admin@example.com',
  actorAdminId: '550e8400-e29b-41d4-a716-446655440000',
  reason: retryReason,
  requestId: 'request-123',
  ...overrides
});

const lastAudit = (harness) => harness.commercePaymentRepository.createAuditLog.mock.calls.at(-1)?.[0];

describe('commerce refund retry', () => {
  it('creates a linked new attempt and records the operator reason and server identity', async () => {
    const harness = buildUseCase();
    const result = await runRetry(harness);

    expect(result.success).toBe(true);
    expect(result.data.refund.retry_of).toBe('CRF-ORIGINAL01');
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
    expect(harness.paymongoService.listPaymentRefunds).toHaveBeenCalledWith(session.provider_payment_id);
    expect(harness.commercePaymentRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      entity_id: 20,
      action: 'CREATE',
      event_type: 'commerce_payment_refund_retried',
      actor_username: 'admin@example.com',
      reason: retryReason,
      request_id: 'request-123',
      changes: expect.objectContaining({
        payment_session_id: session.public_reference,
        original_refund_reference: 'CRF-ORIGINAL01',
        new_refund_reference: 'CRF-RETRY0001',
        amount_centavos: 5000,
        outcome: 'pending',
        provider_refund_id: 'ref_retry',
        actor_admin_id: '550e8400-e29b-41d4-a716-446655440000',
        retry_reason: retryReason
      })
    }));
    expect(Number.isInteger(lastAudit(harness).entity_id)).toBe(true);
    expect(failedRefund.status).toBe('failed');
    expect(harness.commercePaymentRepository.updateRefundById).not.toHaveBeenCalled();
  });

  it.each(['succeeded', 'pending', 'failed'])('audits %s as the provider outcome', async (status) => {
    const harness = buildUseCase({
      createResult: {
        success: true,
        data: { refund: { refund_id: 'CRF-RETRY0001', public_reference: 'CRF-RETRY0001', status } }
      }
    });

    await runRetry(harness);

    expect(lastAudit(harness).changes.outcome).toBe(status);
  });

  it('allows retry after not-found review but refuses other manual-review rows', async () => {
    const eligible = buildUseCase({
      original: { ...failedRefund, status: 'manual_review_required', failure_code: 'PROVIDER_REFUND_NOT_FOUND' }
    });
    expect((await runRetry(eligible)).success).toBe(true);

    const ambiguous = buildUseCase({
      original: { ...failedRefund, status: 'manual_review_required', failure_code: 'PROVIDER_REFUND_AMBIGUOUS_MATCH' }
    });
    const result = await runRetry(ambiguous);
    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(409);
    expect(lastAudit(ambiguous)).toEqual(expect.objectContaining({
      entity_id: 20,
      event_type: 'commerce_payment_refund_retry_blocked',
      reason: retryReason,
      changes: expect.objectContaining({ block_code: 'COMMERCE_REFUND_RETRY_INELIGIBLE' })
    }));
    expect(ambiguous.createCommercePaymentRefundUseCase).not.toHaveBeenCalled();
  });

  it('blocks a retry when the selected attempt already has a child retry', async () => {
    const harness = buildUseCase({
      retryChild: { refund_id: 21, public_reference: 'CRF-CHILD00001' }
    });
    const result = await runRetry(harness);

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(409);
    expect(result.error.message).toBe('Retry the latest attempt instead.');
    expect(harness.paymongoService.listPaymentRefunds).not.toHaveBeenCalled();
    expect(harness.createCommercePaymentRefundUseCase).not.toHaveBeenCalled();
    expect(lastAudit(harness).changes.block_code).toBe('COMMERCE_REFUND_RETRY_HAS_CHILD');
  });

  it('refuses an active refund and an unlinked provider refund with the same amount', async () => {
    const active = buildUseCase({ refunds: [{ refund_id: 21, status: 'created' }] });
    const activeResult = await runRetry(active);
    expect(activeResult.success).toBe(false);
    expect(activeResult.error.statusCode).toBe(409);
    expect(lastAudit(active).changes.block_code).toBe('COMMERCE_REFUND_RETRY_ACTIVE_REFUND');

    const providerDuplicate = buildUseCase({
      providerRefunds: [{ id: 'ref_unlinked', attributes: { amount: 5000 } }]
    });
    const duplicateResult = await runRetry(providerDuplicate);
    expect(duplicateResult.success).toBe(false);
    expect(duplicateResult.error.statusCode).toBe(409);
    expect(providerDuplicate.paymongoService.listPaymentRefunds).toHaveBeenCalledWith(session.provider_payment_id);
    expect(lastAudit(providerDuplicate).changes.block_code).toBe('COMMERCE_REFUND_RETRY_UNLINKED_PROVIDER_MATCH');
    expect(providerDuplicate.createCommercePaymentRefundUseCase).not.toHaveBeenCalled();
  });

  it.each(['pending', 'succeeded'])('refuses a %s original attempt', async (status) => {
    const harness = buildUseCase({ original: { ...failedRefund, status } });
    const result = await runRetry(harness);
    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(409);
    expect(lastAudit(harness).changes.block_code).toBe('COMMERCE_REFUND_RETRY_INELIGIBLE');
    expect(harness.createCommercePaymentRefundUseCase).not.toHaveBeenCalled();
  });

  it('fails closed and audits a provider-read error as 503', async () => {
    const harness = buildUseCase({ providerError: new Error('PayMongo unavailable') });
    const result = await runRetry(harness);

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(503);
    expect(lastAudit(harness)).toEqual(expect.objectContaining({
      entity_id: 20,
      event_type: 'commerce_payment_refund_retry_blocked',
      actor_username: 'admin@example.com',
      reason: retryReason,
      changes: expect.objectContaining({ block_code: 'COMMERCE_REFUND_RETRY_PROVIDER_READ_FAILED' })
    }));
    expect(harness.createCommercePaymentRefundUseCase).not.toHaveBeenCalled();
  });

  it('fails closed and audits when provider refund listing is unavailable', async () => {
    const harness = buildUseCase({ providerReadAvailable: false });
    const result = await runRetry(harness);
    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(503);
    expect(lastAudit(harness).changes.block_code).toBe('COMMERCE_REFUND_RETRY_PROVIDER_READ_UNAVAILABLE');
  });

  it('returns not-found for missing sessions, missing refunds, and cross-session refunds', async () => {
    const missingSession = buildUseCase({ sessionRecord: null });
    expect((await runRetry(missingSession)).error.statusCode).toBe(404);
    expect(lastAudit(missingSession).entity_id).toBeNull();

    const missingRefund = buildUseCase({ original: null });
    expect((await runRetry(missingRefund)).error.statusCode).toBe(404);
    expect(lastAudit(missingRefund).entity_id).toBeNull();

    const crossSession = buildUseCase({ original: { ...failedRefund, payment_session_id: 999 } });
    expect((await runRetry(crossSession)).error.statusCode).toBe(404);
    expect(lastAudit(crossSession).entity_id).toBe(20);
  });

  it('passes through a retry create-use-case failure after recording the blocked attempt', async () => {
    const createFailure = {
      success: false,
      data: null,
      error: { statusCode: 409, message: 'The locked refund is no longer eligible.' }
    };
    const harness = buildUseCase({ createResult: createFailure });

    const result = await runRetry(harness);

    expect(result).toBe(createFailure);
    expect(lastAudit(harness).changes.block_code).toBe('COMMERCE_REFUND_RETRY_CREATE_FAILED');
  });
});

describe('commerce admin refund list use case', () => {
  it('returns joined session metadata and computes retry eligibility server-side', async () => {
    const commercePaymentRepository = {
      listRefundsForAdmin: jest.fn().mockResolvedValue({
        total: 6,
        refunds: [
          { ...failedRefund, payment_session: { public_reference: session.public_reference, tenant_id: 'tenant-1', store_slug: 'space-bar', pos_transaction_id: 2749, status: 'refund_pending' } },
          { ...failedRefund, refund_id: 21, public_reference: 'CRF-PENDING001', status: 'pending', payment_session: { public_reference: session.public_reference } },
          { ...failedRefund, refund_id: 22, public_reference: 'CRF-SUCCEEDED1', status: 'succeeded', payment_session: { public_reference: session.public_reference } },
          { ...failedRefund, refund_id: 23, public_reference: 'CRF-HASCHILD01', has_retry: true, retry_child_references: ['CRF-CHILD00001'], payment_session: { public_reference: session.public_reference } },
          { ...failedRefund, refund_id: 24, public_reference: 'CRF-ACTIVE0001', _has_active_refund: true, payment_session: { public_reference: session.public_reference } },
          { ...failedRefund, refund_id: 25, public_reference: 'CRF-RETRY0001', retry_of: 'CRF-ORIGINAL01', payment_session: { public_reference: session.public_reference } }
        ]
      })
    };
    const useCase = buildListCommercePaymentRefundsUseCase({ commercePaymentRepository });

    const result = await useCase({ query: { status: 'failed', tenant_id: '550e8400-e29b-41d4-a716-446655440000', limit: '25', offset: '10' } });

    expect(result.success).toBe(true);
    expect(commercePaymentRepository.listRefundsForAdmin).toHaveBeenCalledWith({
      status: ['failed'],
      tenant_id: '550e8400-e29b-41d4-a716-446655440000',
      limit: 25,
      offset: 10
    });
    expect(result.data.pagination).toEqual({ limit: 25, offset: 10, count: 6, total: 6 });
    expect(result.data.refunds[0]).toEqual(expect.objectContaining({
      retry_of: null,
      has_retry: false,
      retry_eligible: true,
      payment_session: expect.objectContaining({
        public_reference: session.public_reference,
        tenant_id: 'tenant-1',
        store_slug: 'space-bar',
        pos_transaction_id: 2749
      })
    }));
    expect(result.data.refunds[1].retry_eligible).toBe(false);
    expect(result.data.refunds[2].retry_eligible).toBe(false);
    expect(result.data.refunds[3].retry_eligible).toBe(false);
    expect(result.data.refunds[4].retry_eligible).toBe(false);
    expect(result.data.refunds[5].retry_of).toBe('CRF-ORIGINAL01');
    expect(result.data.refunds[0]).not.toHaveProperty('retry_of_refund_id');
  });
});
