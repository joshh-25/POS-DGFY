import { describe, expect, it, jest } from '@jest/globals';
import { buildCancelStoreOrderUseCase } from '../src/modules/store/usecases/storeUseCases.js';
import { ok, fail } from '../src/modules/shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import { generateStoreCancelProof } from '../src/modules/store/utils/storeJwtToken.js';

// Phase 144 (#824). Before this, PATCH /store/orders/:tracking_pin/cancel flipped
// fulfillment_status and released inventory and never touched money at all — a customer who paid a
// downpayment online could self-cancel and it was neither refunded, forfeited, nor recorded. This
// suite pins the wiring, and specifically that it happens POST-COMMIT and can never fail the
// cancel that already succeeded (ADR 0052's Architecture Boundaries: a cross-database/provider
// failure must not roll back the tenant order decision).

const makeTransaction = () => ({
  finished: false,
  LOCK: { UPDATE: 'UPDATE' },
  commit: jest.fn(async function commit() { this.finished = true; }),
  rollback: jest.fn(async function rollback() { this.finished = true; })
});

const ORDER = {
  pos_transaction_id: 903,
  tracking_pin: 'SK-CANCEL',
  store_customer_id: 55,
  fulfillment_status: 'placed'
};

const build = ({ lifecycleResult = ok({ tracked: true, payment_action: 'forfeited' }), lifecycleImpl = null } = {}) => {
  const transaction = makeTransaction();
  const storeRepository = {
    beginTransaction: jest.fn().mockResolvedValue(transaction),
    getOrderByTrackingPin: jest.fn()
      .mockResolvedValueOnce(ORDER)
      .mockResolvedValueOnce({ ...ORDER, fulfillment_status: 'cancelled' }),
    updateOrderByTrackingPin: jest.fn().mockResolvedValue({ ...ORDER, fulfillment_status: 'cancelled' })
  };
  const commerceOrderLifecycleUseCase = jest.fn(
    lifecycleImpl || (async () => lifecycleResult)
  );
  const useCase = buildCancelStoreOrderUseCase({
    storeRepository,
    inventoryReservationService: { releaseOnlineOrderInventory: jest.fn().mockResolvedValue({ status: 'released' }) },
    commerceOrderLifecycleUseCase
  });
  return { useCase, transaction, storeRepository, commerceOrderLifecycleUseCase };
};

const run = (fixture, overrides = {}) => fixture.useCase({
  trackingPin: 'SK-CANCEL',
  tenantId: '11111111-1111-4111-8111-111111111111',
  storeCustomer: { customer_id: 55 },
  payload: {},
  ...overrides
});

describe('customer cancellation payment lifecycle (Phase 144, #824)', () => {
  // The whole point of the origin split: this endpoint is the ONLY caller that may forfeit a
  // non-refundable downpayment. A store-side cancel through POS always refunds.
  it('invokes the payment lifecycle with initiatedBy: customer', async () => {
    const fixture = build();

    const result = await run(fixture);

    expect(result.success).toBe(true);
    expect(fixture.commerceOrderLifecycleUseCase).toHaveBeenCalledTimes(1);
    expect(fixture.commerceOrderLifecycleUseCase).toHaveBeenCalledWith({
      tenantId: '11111111-1111-4111-8111-111111111111',
      posTransactionId: 903,
      fulfillmentStatus: 'cancelled',
      actor: 'store_customer:55',
      initiatedBy: 'customer'
    });
    expect(result.data.payment_lifecycle).toMatchObject({ payment_action: 'forfeited' });
  });

  // A guest order carries no store_customer_id, so ownership is proven by a signed cancel_proof
  // instead. Signed for real with the same helper the checkout response uses, so this pins the
  // guest actor string rather than silently skipping when the branch isn't reached.
  it('attributes a guest cancellation distinctly from a logged-in customer', async () => {
    const guestOrder = { ...ORDER, store_customer_id: null };
    const fixture = build();
    fixture.storeRepository.getOrderByTrackingPin
      .mockReset()
      .mockResolvedValueOnce(guestOrder)
      .mockResolvedValueOnce({ ...guestOrder, fulfillment_status: 'cancelled' });

    const cancelProof = generateStoreCancelProof({
      trackingPin: guestOrder.tracking_pin,
      tenantId: '11111111-1111-4111-8111-111111111111',
      orderId: guestOrder.pos_transaction_id
    });

    const result = await run(fixture, { storeCustomer: null, payload: { cancel_proof: cancelProof } });

    expect(result.success).toBe(true);
    expect(fixture.commerceOrderLifecycleUseCase).toHaveBeenCalledTimes(1);
    expect(fixture.commerceOrderLifecycleUseCase.mock.calls[0][0]).toMatchObject({
      actor: 'store_guest',
      initiatedBy: 'customer'
    });
  });

  // Post-commit is mandatory, not stylistic — see the module comment above.
  it('runs the lifecycle only after the cancel transaction has committed', async () => {
    let committedWhenLifecycleRan = null;
    const fixture = build({
      lifecycleImpl: async () => {
        committedWhenLifecycleRan = fixture.transaction.commit.mock.calls.length;
        return ok({ tracked: true, payment_action: 'refund_pending' });
      }
    });

    await run(fixture);

    expect(committedWhenLifecycleRan).toBe(1);
  });

  it('still reports the cancel as successful when the lifecycle returns a failure', async () => {
    const fixture = build({
      lifecycleResult: fail(new DomainError(DomainErrorCode.CONFLICT, 'Payment session has no PayMongo payment ID to refund'))
    });

    const result = await run(fixture);

    expect(result.success).toBe(true);
    expect(result.data.status).toBe('cancelled');
    expect(result.data.payment_lifecycle).toMatchObject({
      tracked: true,
      payment_action: 'refund_failed',
      failure_reason: 'Payment session has no PayMongo payment ID to refund'
    });
  });

  // A thrown lifecycle (not a returned failure) must be equally survivable — the money decision is
  // reported for administrator review, the customer's cancel is not un-done.
  it('still reports the cancel as successful when the lifecycle throws outright', async () => {
    const fixture = build({
      lifecycleImpl: async () => { throw new Error('tenant connection refused'); }
    });

    const result = await run(fixture);

    expect(result.success).toBe(true);
    expect(result.data.status).toBe('cancelled');
    expect(result.data.payment_lifecycle.payment_action).toBe('refund_failed');
  });

  // Every pre-existing caller builds this use case without the new dependency; that must remain a
  // no-op rather than a crash.
  it('is a no-op when no lifecycle use case is injected', async () => {
    const transaction = makeTransaction();
    const useCase = buildCancelStoreOrderUseCase({
      storeRepository: {
        beginTransaction: jest.fn().mockResolvedValue(transaction),
        getOrderByTrackingPin: jest.fn()
          .mockResolvedValueOnce(ORDER)
          .mockResolvedValueOnce({ ...ORDER, fulfillment_status: 'cancelled' }),
        updateOrderByTrackingPin: jest.fn().mockResolvedValue({ ...ORDER, fulfillment_status: 'cancelled' })
      },
      inventoryReservationService: null
    });

    const result = await useCase({
      trackingPin: 'SK-CANCEL',
      tenantId: '11111111-1111-4111-8111-111111111111',
      storeCustomer: { customer_id: 55 },
      payload: {}
    });

    expect(result.success).toBe(true);
    expect(result.data.payment_lifecycle).toEqual({ tracked: false, payment_action: 'not_applicable' });
  });
});
