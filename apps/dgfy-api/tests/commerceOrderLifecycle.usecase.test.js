import { describe, expect, it, jest } from '@jest/globals';
import {
  buildHandleCommerceOrderLifecycleUseCase
} from '../src/modules/commercePayments/usecases/commerceOrderLifecycleUseCase.js';
import { ok } from '../src/modules/shared/contracts/applicationResult.js';

const session = {
  session_id: 41,
  public_reference: 'CPS-ORDER41',
  tenant_id: '550e8400-e29b-41d4-a716-446655440000',
  pos_transaction_id: 901,
  total_amount_centavos: 26500
};

const build = ({
  refunds = [],
  refundResult = ok({ refund: { refund_id: 7, status: 'pending' } })
} = {}) => {
  const commercePaymentRepository = {
    findSessionByTenantAndPosTransaction: jest.fn().mockResolvedValue(session),
    listRefundsBySession: jest.fn().mockResolvedValue(refunds)
  };
  const createCommercePaymentRefundUseCase = jest.fn().mockResolvedValue(refundResult);
  const recordTenantRevenueOrderFulfillmentUseCase = jest.fn().mockResolvedValue(
    ok({ updated: true })
  );
  const useCase = buildHandleCommerceOrderLifecycleUseCase({
    commercePaymentRepository,
    createCommercePaymentRefundUseCase,
    recordTenantRevenueOrderFulfillmentUseCase
  });
  return {
    useCase,
    commercePaymentRepository,
    createCommercePaymentRefundUseCase,
    recordTenantRevenueOrderFulfillmentUseCase
  };
};

describe('commerce order payment lifecycle', () => {
  it('releases a completed order to the settlement workflow without refunding it', async () => {
    const fixture = build();

    const result = await fixture.useCase({
      tenantId: session.tenant_id,
      posTransactionId: session.pos_transaction_id,
      fulfillmentStatus: 'completed',
      actor: 'pos_user:8'
    });

    expect(result.success).toBe(true);
    expect(result.data.payment_action).toBe('settlement_pending');
    expect(fixture.recordTenantRevenueOrderFulfillmentUseCase).toHaveBeenCalledWith({
      session,
      fulfillmentStatus: 'completed',
      actor: 'pos_user:8'
    });
    expect(fixture.createCommercePaymentRefundUseCase).not.toHaveBeenCalled();
  });

  it('requests the exact full payment amount when a paid order is rejected', async () => {
    const fixture = build();

    const result = await fixture.useCase({
      tenantId: session.tenant_id,
      posTransactionId: session.pos_transaction_id,
      fulfillmentStatus: 'rejected',
      actor: 'pos_user:8',
      rejectionReason: 'Item is unavailable'
    });

    expect(result.success).toBe(true);
    expect(result.data.payment_action).toBe('refund_pending');
    expect(fixture.createCommercePaymentRefundUseCase).toHaveBeenCalledWith({
      paymentSessionId: session.public_reference,
      payload: {
        amount_centavos: 26500,
        reason: 'requested_by_customer',
        notes: 'Item is unavailable',
        refund_strategy: 'proportional'
      },
      actor: 'pos_user:8'
    });
  });

  it('does not submit a duplicate refund while an earlier request is pending', async () => {
    const fixture = build({
      refunds: [{ refund_id: 9, status: 'pending' }]
    });

    const result = await fixture.useCase({
      tenantId: session.tenant_id,
      posTransactionId: session.pos_transaction_id,
      fulfillmentStatus: 'rejected',
      actor: 'pos_user:8'
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      payment_action: 'refund_pending',
      idempotent_replay: true
    });
    expect(fixture.createCommercePaymentRefundUseCase).not.toHaveBeenCalled();
  });
});
