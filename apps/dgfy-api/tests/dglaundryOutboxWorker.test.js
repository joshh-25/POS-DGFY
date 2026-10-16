import { jest } from '@jest/globals';

const loggerWarn = jest.fn();
const loggerError = jest.fn();
const outboxRepository = {
  markExhausted: jest.fn(async () => {}),
  claimDue: jest.fn(async () => []),
  claimPendingCompletions: jest.fn(async () => []),
  acknowledgeCompletion: jest.fn(async () => {})
};
const durableDelivery = { processClaim: jest.fn(async () => {}) };

jest.unstable_mockModule('../src/config/logger.js', () => ({ default: { warn: loggerWarn, error: loggerError } }));
jest.unstable_mockModule('../src/modules/dgfyLaundryOrders/repositories/dgfyLaundryOutboxRepository.js', () => ({
  dgfyLaundryOutboxRepository: outboxRepository
}));
jest.unstable_mockModule('../src/modules/dgfyLaundryOrders/index.js', () => ({
  dglaundryDurableDelivery: durableDelivery
}));

const { processPendingDglaundryCompletions, processDglaundryOutboxBatch } = await import('../src/workers/dglaundryOutboxWorker.js');

beforeEach(() => {
  jest.clearAllMocks();
  outboxRepository.claimDue.mockResolvedValue([]);
  outboxRepository.claimPendingCompletions.mockResolvedValue([]);
});

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

describe('DGLaundry outbox delivery worker', () => {
  it('marks exhausted rows, claims due work, delivers in parallel, and contains per-claim failures', async () => {
    const claims = [
      { row: { id: 'outbox-1' }, token: 'lease-1' },
      { row: { id: 'outbox-2' }, token: 'lease-2' }
    ];
    const order = [];
    let signalBothStarted;
    const bothStarted = new Promise((resolve) => { signalBothStarted = resolve; });
    let deliveriesStarted = 0;
    outboxRepository.markExhausted.mockImplementation(async () => { order.push('mark-exhausted'); });
    outboxRepository.claimDue.mockImplementation(async () => { order.push('claim-due'); return claims; });
    durableDelivery.processClaim.mockImplementation(async (claim) => {
      order.push(`deliver:${claim.row.id}`);
      deliveriesStarted += 1;
      if (deliveriesStarted === claims.length) signalBothStarted();
      await bothStarted;
      if (claim.row.id === 'outbox-1') throw new Error('provider failed');
      return { accepted: true };
    });

    await expect(processDglaundryOutboxBatch()).resolves.toBe(2);

    expect(order.slice(0, 2)).toEqual(['mark-exhausted', 'claim-due']);
    expect(order.slice(2).sort()).toEqual(['deliver:outbox-1', 'deliver:outbox-2']);
    expect(durableDelivery.processClaim).toHaveBeenCalledTimes(2);
    expect(loggerWarn).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'dglaundry_outbox_delivery_failed', operation_id: 'outbox-1', error: 'provider failed'
    }));
    expect(loggerError).not.toHaveBeenCalled();
  });
});
