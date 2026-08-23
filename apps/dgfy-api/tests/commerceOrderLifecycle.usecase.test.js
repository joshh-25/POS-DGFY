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

// --- Phase 144 (#824): refund-vs-forfeiture, and the downpayment-amount pin -------------------

// A downpayment capture: total_amount_centavos is the amount actually CAPTURED online (Phase 141,
// #822), and order_total_centavos carries the full order value. The gap between the two is the
// whole point of the pinning test below.
const downpaymentSession = {
  session_id: 77,
  public_reference: 'CPS-ORDER77',
  tenant_id: '550e8400-e29b-41d4-a716-446655440000',
  pos_transaction_id: 903,
  capture_kind: 'downpayment',
  capture_payment_method: 'gcash',
  provider_payment_id: 'pay_ABC123',
  total_amount_centavos: 20000,
  order_total_centavos: 100000,
  downpayment_refundable: true
};

const buildDownpayment = ({ refundable = true, refunds = [] } = {}) => {
  const activeSession = { ...downpaymentSession, downpayment_refundable: refundable };
  const commercePaymentRepository = {
    findSessionByTenantAndPosTransaction: jest.fn().mockResolvedValue(activeSession),
    listRefundsBySession: jest.fn().mockResolvedValue(refunds)
  };
  const createCommercePaymentRefundUseCase = jest.fn().mockResolvedValue(
    ok({ refund: { refund_id: 12, status: 'pending' } })
  );
  const recordTenantRevenueOrderFulfillmentUseCase = jest.fn().mockResolvedValue(ok({ updated: true }));
  const writeOrderPaymentLedgerEntry = jest.fn().mockResolvedValue({ written: true, entryId: 55 });
  const useCase = buildHandleCommerceOrderLifecycleUseCase({
    commercePaymentRepository,
    createCommercePaymentRefundUseCase,
    recordTenantRevenueOrderFulfillmentUseCase,
    writeOrderPaymentLedgerEntry
  });
  return {
    useCase,
    activeSession,
    createCommercePaymentRefundUseCase,
    writeOrderPaymentLedgerEntry
  };
};

const runTerminal = (fixture, overrides = {}) => fixture.useCase({
  tenantId: downpaymentSession.tenant_id,
  posTransactionId: downpaymentSession.pos_transaction_id,
  fulfillmentStatus: 'cancelled',
  actor: 'store_customer:4',
  ...overrides
});

describe('downpayment refund vs forfeiture (Phase 144, #824)', () => {
  // Epic #815's Definition of done, first line: "Reject-and-refund refunds exactly the collected
  // downpayment, never the order total." True by construction since Phase 141, but unpinned until
  // now -- this test is what stops a future edit from silently refunding money never collected.
  it('refunds exactly the captured downpayment on reject, never the order total', async () => {
    const fixture = buildDownpayment();

    const result = await runTerminal(fixture, { fulfillmentStatus: 'rejected', actor: 'pos_user:8', rejectionReason: 'Out of stock' });

    expect(result.success).toBe(true);
    expect(fixture.createCommercePaymentRefundUseCase).toHaveBeenCalledTimes(1);
    const submitted = fixture.createCommercePaymentRefundUseCase.mock.calls[0][0];
    expect(submitted.payload.amount_centavos).toBe(20000);
    expect(submitted.payload.amount_centavos).not.toBe(100000);
  });

  // Decision 1 (Pat, 2026-08-22): the store's inability to fulfil is never the customer's
  // forfeiture, so a store-side reject refunds regardless of the toggle.
  it('refunds a non-refundable downpayment anyway when the STORE rejects', async () => {
    const fixture = buildDownpayment({ refundable: false });

    const result = await runTerminal(fixture, { fulfillmentStatus: 'rejected', actor: 'pos_user:8', rejectionReason: 'Cannot fulfil' });

    expect(result.success).toBe(true);
    expect(result.data.payment_action).toBe('refund_pending');
    expect(fixture.createCommercePaymentRefundUseCase).toHaveBeenCalledTimes(1);
    expect(fixture.writeOrderPaymentLedgerEntry).not.toHaveBeenCalled();
  });

  // Same rule for a staff-set 'cancelled' -- initiatedBy defaults to 'store', so a caller that
  // forgets the parameter fails toward giving the money back.
  it('refunds a non-refundable downpayment when POS cancels (initiatedBy defaults to store)', async () => {
    const fixture = buildDownpayment({ refundable: false });

    const result = await runTerminal(fixture, { actor: 'pos_user:8' });

    expect(result.success).toBe(true);
    expect(result.data.payment_action).toBe('refund_pending');
    expect(fixture.createCommercePaymentRefundUseCase).toHaveBeenCalledTimes(1);
  });

  it('forfeits without any provider call when the CUSTOMER cancels a non-refundable downpayment', async () => {
    const fixture = buildDownpayment({ refundable: false });

    const result = await runTerminal(fixture, { initiatedBy: 'customer' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      payment_action: 'forfeited',
      forfeited_amount_centavos: 20000,
      ledger_entry_recorded: true
    });
    expect(fixture.createCommercePaymentRefundUseCase).not.toHaveBeenCalled();
    expect(fixture.writeOrderPaymentLedgerEntry).toHaveBeenCalledTimes(1);
    expect(fixture.writeOrderPaymentLedgerEntry).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'forfeiture',
      status: 'successful',
      amountCentavos: 20000,
      paymentMethod: 'gcash',
      idempotencyKey: 'CPS-ORDER77:forfeiture'
    }));
  });

  it('refunds when the customer cancels a REFUNDABLE downpayment', async () => {
    const fixture = buildDownpayment({ refundable: true });

    const result = await runTerminal(fixture, { initiatedBy: 'customer' });

    expect(result.success).toBe(true);
    expect(result.data.payment_action).toBe('refund_pending');
    expect(fixture.createCommercePaymentRefundUseCase).toHaveBeenCalledTimes(1);
    expect(fixture.writeOrderPaymentLedgerEntry).not.toHaveBeenCalled();
  });

  // The column is nullable. Unknown policy must fall through to refunding, not to keeping money.
  it('refunds rather than forfeits when downpayment_refundable is null', async () => {
    const fixture = buildDownpayment({ refundable: null });

    const result = await runTerminal(fixture, { initiatedBy: 'customer' });

    expect(result.success).toBe(true);
    expect(result.data.payment_action).toBe('refund_pending');
    expect(fixture.createCommercePaymentRefundUseCase).toHaveBeenCalledTimes(1);
  });

  // Regression guard: a plain full-payment order must be byte-for-byte unaffected by the new
  // parameter, forfeiture branch included -- pos_order_payments is the downpayment epic's ledger
  // and a full-payment order has never had a row in it.
  it('never forfeits a full-payment session, even for a customer cancel', async () => {
    const fullPaymentSession = {
      ...downpaymentSession,
      capture_kind: 'full',
      downpayment_refundable: false
    };
    const commercePaymentRepository = {
      findSessionByTenantAndPosTransaction: jest.fn().mockResolvedValue(fullPaymentSession),
      listRefundsBySession: jest.fn().mockResolvedValue([])
    };
    const createCommercePaymentRefundUseCase = jest.fn().mockResolvedValue(
      ok({ refund: { refund_id: 13, status: 'pending' } })
    );
    const writeOrderPaymentLedgerEntry = jest.fn();
    const useCase = buildHandleCommerceOrderLifecycleUseCase({
      commercePaymentRepository,
      createCommercePaymentRefundUseCase,
      recordTenantRevenueOrderFulfillmentUseCase: jest.fn().mockResolvedValue(ok({ updated: true })),
      writeOrderPaymentLedgerEntry
    });

    const result = await useCase({
      tenantId: fullPaymentSession.tenant_id,
      posTransactionId: fullPaymentSession.pos_transaction_id,
      fulfillmentStatus: 'cancelled',
      actor: 'store_customer:4',
      initiatedBy: 'customer'
    });

    expect(result.success).toBe(true);
    expect(result.data.payment_action).toBe('refund_pending');
    expect(createCommercePaymentRefundUseCase).toHaveBeenCalledTimes(1);
    expect(writeOrderPaymentLedgerEntry).not.toHaveBeenCalled();
  });

  it('does not forfeit twice when an earlier refund already succeeded', async () => {
    const fixture = buildDownpayment({
      refundable: false,
      refunds: [{ refund_id: 21, status: 'succeeded' }]
    });

    const result = await runTerminal(fixture, { initiatedBy: 'customer' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ payment_action: 'refunded', idempotent_replay: true });
    expect(fixture.writeOrderPaymentLedgerEntry).not.toHaveBeenCalled();
  });
});
