import { jest } from '@jest/globals';
import { processPendingDglaundryCompletions } from '../src/workers/dglaundryOutboxWorker.js';

describe('DGLaundry outbox caller completion worker', () => {
  it('reconciles the original caller result and paid session without sending another provider event', async () => {
    const row = {
      id: 'outbox-1', completion_type: 'paid_dglaundry_booking', completion_reference: 'session-7',
      completion_attempts: 1, caller_idempotency_key: 'caller-key', response: { accepted: true },
      payload: { data: { externalOrderReference: 'order-7', externalTrackingReference: 'tracking-7' } }
    };
    const repository = {
      claimPendingCompletions: jest.fn(async () => [{ row, token: 'lease-1' }]),
      acknowledgeCompletion: jest.fn(async () => {})
    };
    const orderUseCases = { reconcileOutboxCallerResult: jest.fn(async () => {}) };
    const reconcilePayment = jest.fn(async () => {});
    await expect(processPendingDglaundryCompletions({ repository, orderUseCases, reconcilePayment })).resolves.toBe(1);
    expect(orderUseCases.reconcileOutboxCallerResult).toHaveBeenCalledWith({
      callerIdempotencyKey: 'caller-key', response: { accepted: true },
      externalOrderReference: 'order-7', externalTrackingReference: 'tracking-7'
    });
    expect(reconcilePayment).toHaveBeenCalledWith({ completionReference: 'session-7' });
    expect(repository.acknowledgeCompletion).toHaveBeenCalledWith({ id: 'outbox-1', token: 'lease-1', completed: true });
  });

  it('records bounded retry for a failed local reconciliation without repeating delivery', async () => {
    const row = {
      id: 'outbox-2', completion_type: 'dglaundry_order_idempotency', completion_attempts: 2,
      caller_idempotency_key: 'caller-key', response: { accepted: true },
      payload: { data: { externalOrderReference: 'order-8', externalTrackingReference: 'tracking-8' } }
    };
    const repository = {
      claimPendingCompletions: jest.fn(async () => [{ row, token: 'lease-2' }]),
      acknowledgeCompletion: jest.fn(async () => {})
    };
    const orderUseCases = { reconcileOutboxCallerResult: jest.fn().mockRejectedValue(new Error('landlord database unavailable')) };
    const reconcilePayment = jest.fn();
    await expect(processPendingDglaundryCompletions({ repository, orderUseCases, reconcilePayment })).resolves.toBe(1);
    expect(reconcilePayment).not.toHaveBeenCalled();
    expect(repository.acknowledgeCompletion).toHaveBeenCalledWith(expect.objectContaining({
      id: 'outbox-2', token: 'lease-2', completed: false, failure: 'landlord database unavailable', retryDelayMs: 10000
    }));
  });
});
