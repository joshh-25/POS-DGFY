import { buildDglaundryDurableDelivery } from '../src/modules/dgfyLaundryOrders/services/dglaundryDurableDelivery.js';
import { requestHash } from '../src/modules/dgfyLaundryOrders/contracts.js';
import { jest } from '@jest/globals';

const createRepository = () => {
  const rows = new Map();
  return {
    rows,
    enqueue: jest.fn(async (input) => {
      const identity = `${input.operation}:${input.idempotencyKey}`;
      const existing = rows.get(identity);
      if (existing) return { row: existing, created: false };
      const row = { ...input, request_hash: input.requestHash, id: 'operation-1', status: 'pending', attempts: 0, max_attempts: input.maxAttempts, response: null };
      rows.set(identity, row);
      return { row, created: true };
    }),
    claim: jest.fn(async (id) => {
      const row = [...rows.values()].find((candidate) => candidate.id === id);
      if (!row || row.status === 'delivered' || row.status === 'dead_letter') return null;
      row.status = 'leased';
      row.attempts += 1;
      return { row: { ...row }, token: `lease-${row.attempts}` };
    }),
    acknowledge: jest.fn(async (input) => {
      const row = [...rows.values()].find((candidate) => candidate.id === input.id);
      Object.assign(row, input, { status: input.status, response: input.response });
      return row;
    }),
    hasCancellationIntent: jest.fn(async () => false)
  };
};

describe('DGLaundry durable outbound delivery', () => {
  it('persists the immutable scoped intent before sending and stores the provider result', async () => {
    const repository = createRepository();
    const payload = { companyId: 'company-1', locationId: 'location-1', lines: [{ service: 'wash' }], idempotencyKey: 'quote-1' };
    const transportClient = { prepareQuote: jest.fn(async () => ({ quoteId: 'quote-provider-1' })) };
    const delivery = buildDglaundryDurableDelivery({ repository, transportClient });
    transportClient.prepareQuote.mockImplementation(async () => {
      expect(repository.enqueue).toHaveBeenCalledTimes(1);
      expect([...repository.rows.values()][0].payload).toEqual(payload);
      return { quoteId: 'quote-provider-1' };
    });

    await expect(delivery.prepareQuote(payload)).resolves.toEqual({ quoteId: 'quote-provider-1' });
    expect([...repository.rows.values()][0].request_hash).toBe(requestHash(payload));
    expect([...repository.rows.values()][0].status).toBe('delivered');
  });

  it('returns explicit pending state on a retryable failure and reuses the same operation', async () => {
    const repository = createRepository();
    const payload = { companyId: 'company-1', locationId: 'location-1', lines: [{ service: 'wash' }], idempotencyKey: 'quote-2' };
    const transportClient = { prepareQuote: jest.fn().mockRejectedValueOnce(Object.assign(new Error('provider unavailable'), { statusCode: 503 })) };
    const delivery = buildDglaundryDurableDelivery({ repository, transportClient, random: () => 0 });

    await expect(delivery.prepareQuote(payload)).rejects.toMatchObject({ statusCode: 503, details: { delivery_status: 'retry_wait', operation_id: 'operation-1' } });
    const row = [...repository.rows.values()][0];
    expect(row.status).toBe('retry_wait');
    const claim = await repository.claim(row.id);
    transportClient.prepareQuote.mockResolvedValue({ quoteId: 'quote-provider-2' });
    await expect(delivery.processClaim(claim)).resolves.toEqual({ quoteId: 'quote-provider-2' });
    await expect(delivery.prepareQuote(payload)).resolves.toEqual({ quoteId: 'quote-provider-2' });
    expect(repository.enqueue).toHaveBeenCalledTimes(2);
    expect(transportClient.prepareQuote).toHaveBeenCalledTimes(2);
  });

  it('rejects changed payload under the same logical key without sending it', async () => {
    const repository = createRepository();
    const transportClient = { prepareQuote: jest.fn(async () => ({ quoteId: 'quote-1' })) };
    const delivery = buildDglaundryDurableDelivery({ repository, transportClient });
    await delivery.prepareQuote({ companyId: 'company-1', locationId: 'location-1', lines: [], idempotencyKey: 'key-1' });
    await expect(delivery.prepareQuote({ companyId: 'company-1', locationId: 'location-1', lines: [{ item: 'different' }], idempotencyKey: 'key-1' }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(transportClient.prepareQuote).toHaveBeenCalledTimes(1);
  });

  it('persists the originating idempotency caller link for delayed order submission', async () => {
    const repository = createRepository();
    const transportClient = { submitOrder: jest.fn(async () => ({ accepted: true })) };
    const delivery = buildDglaundryDurableDelivery({ repository, transportClient });
    const envelope = { id: 'submit-event-1', type: 'dgfy.laundry_order.submitted.v1', data: { companyId: 'company-1', locationId: 'location-1', externalOrderReference: 'order-1', externalTrackingReference: 'track-1' } };
    await delivery.submitOrder(envelope, { callerIdempotencyKey: 'caller-key-1' });
    const persisted = repository.enqueue.mock.calls[0][0];
    expect(persisted.callerIdempotencyKey).toBe('caller-key-1');
    expect(persisted.completion).toEqual({ type: 'dglaundry_order_idempotency', reference: 'caller-key-1' });
    expect([...repository.rows.values()][0]).toEqual(expect.objectContaining({ operation: 'submitOrder', status: 'delivered' }));
    expect(transportClient.submitOrder).toHaveBeenCalledTimes(1);
  });

  it('delivers a booking preparation when the operation is enabled', async () => {
    const previous = {
      enabled: process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED,
      killSwitch: process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH,
      disabledBranches: process.env.DGLAUNDRY_BOOKING_PAYMENTS_DISABLED_BRANCHES
    };
    process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED = 'true';
    delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH;
    delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_DISABLED_BRANCHES;
    try {
      const repository = createRepository();
      const transportClient = { prepareBookingGroup: jest.fn(async () => ({ bookingGroupId: 'booking-group-1' })) };
      const delivery = buildDglaundryDurableDelivery({ repository, transportClient });
      const payload = { companyId: 'company-1', locationId: 'location-1', bookings: [{ id: 'booking-1' }], idempotencyKey: 'booking-1' };

      await expect(delivery.prepareBookingGroup(payload)).resolves.toEqual({ bookingGroupId: 'booking-group-1' });
      expect([...repository.rows.values()][0]).toEqual(expect.objectContaining({ operation: 'prepareBookingGroup', status: 'delivered' }));
      expect(transportClient.prepareBookingGroup).toHaveBeenCalledTimes(1);
    } finally {
      if (previous.enabled === undefined) delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED; else process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED = previous.enabled;
      if (previous.killSwitch === undefined) delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH; else process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH = previous.killSwitch;
      if (previous.disabledBranches === undefined) delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_DISABLED_BRANCHES; else process.env.DGLAUNDRY_BOOKING_PAYMENTS_DISABLED_BRANCHES = previous.disabledBranches;
    }
  });

  it.each(['updateOrder', 'cancelOrder', 'resolveOrder'])('delivers %s and persists its provider response', async (operation) => {
    const repository = createRepository();
    const payload = operation === 'resolveOrder'
      ? { companyId: 'company-1', locationId: 'location-1', externalOrderReference: 'order-1' }
      : { id: `${operation}-event-1`, type: `dgfy.laundry_order.${operation}.v1`, data: { companyId: 'company-1', locationId: 'location-1', externalOrderReference: 'order-1' } };
    const transportClient = { [operation]: jest.fn(async () => ({ accepted: true, operation })) };
    const delivery = buildDglaundryDurableDelivery({ repository, transportClient });

    await expect(delivery[operation](payload)).resolves.toEqual({ accepted: true, operation });

    expect(repository.enqueue).toHaveBeenCalledTimes(1);
    expect([...repository.rows.values()][0]).toEqual(expect.objectContaining({ operation, status: 'delivered', response: { accepted: true, operation } }));
    expect(transportClient[operation]).toHaveBeenCalledTimes(1);
    if (operation === 'resolveOrder') {
      const firstKey = repository.enqueue.mock.calls[0][0].idempotencyKey;
      expect(firstKey).toBe(`resolve-${requestHash(payload)}`);
      await expect(delivery.resolveOrder(payload)).resolves.toEqual({ accepted: true, operation });
      expect(repository.enqueue.mock.calls[1][0].idempotencyKey).toBe(firstKey);
      expect(transportClient.resolveOrder).toHaveBeenCalledTimes(1);
    }
  });

  it('dead-letters the final retryable failure when the attempt budget is exhausted', async () => {
    const repository = createRepository();
    const transportClient = { updateOrder: jest.fn().mockRejectedValue(Object.assign(new Error('provider unavailable'), { statusCode: 503 })) };
    const delivery = buildDglaundryDurableDelivery({ repository, transportClient });
    const { row } = await repository.enqueue({
      companyId: 'company-1', locationId: 'location-1', operation: 'updateOrder',
      idempotencyKey: 'exhausted-key', requestHash: 'hash', payload: {}, maxAttempts: 4
    });
    row.attempts = 3;
    const claim = await repository.claim(row.id);

    const error = await delivery.processClaim(claim).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('provider unavailable');
    expect(error.statusCode).toBe(503);

    expect(repository.acknowledge).toHaveBeenCalledWith(expect.objectContaining({
      id: row.id, token: claim.token, status: 'dead_letter', failureReason: 'provider unavailable'
    }));
    expect(repository.acknowledge).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'retry_wait' }));
  });

  it('does not deliver a concurrent duplicate enqueue twice', async () => {
    const repository = createRepository();
    let releaseTransport;
    let transportStarted;
    const started = new Promise((resolve) => { transportStarted = resolve; });
    const transportGate = new Promise((resolve) => { releaseTransport = resolve; });
    const transportClient = { prepareQuote: jest.fn(async () => {
      transportStarted();
      await transportGate;
      return { quoteId: 'quote-concurrent' };
    }) };
    const delivery = buildDglaundryDurableDelivery({ repository, transportClient });
    const payload = { companyId: 'company-1', locationId: 'location-1', lines: [], idempotencyKey: 'concurrent-key' };

    const first = delivery.prepareQuote(payload);
    await started;
    const second = delivery.prepareQuote(payload);
    await expect(second).rejects.toMatchObject({ statusCode: 503, details: { delivery_status: 'leased' } });
    releaseTransport();
    await expect(first).resolves.toEqual({ quoteId: 'quote-concurrent' });

    expect(repository.enqueue).toHaveBeenCalledTimes(2);
    expect(transportClient.prepareQuote).toHaveBeenCalledTimes(1);
  });

  it('cancels a previously queued booking preparation when its durable compensation intent exists', async () => {
    const previous = {
      enabled: process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED,
      killSwitch: process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH,
      disabledBranches: process.env.DGLAUNDRY_BOOKING_PAYMENTS_DISABLED_BRANCHES
    };
    process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED = 'true';
    delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH;
    delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_DISABLED_BRANCHES;
    try {
      const repository = createRepository();
      repository.hasCancellationIntent = jest.fn(async () => true);
      const transportClient = { prepareBookingGroup: jest.fn() };
      const delivery = buildDglaundryDurableDelivery({ repository, transportClient });
      await repository.enqueue({ companyId: 'company-1', locationId: 'location-1', operation: 'prepareBookingGroup', idempotencyKey: 'booking-key', requestHash: 'hash', payload: {}, maxAttempts: 8 });
      await expect(delivery.processClaim({
        row: { id: 'operation-1', operation: 'prepareBookingGroup', order_reference: 'order-1', company_id: 'company-1', location_id: 'location-1', attempts: 1, max_attempts: 8, payload: {} },
        token: 'lease-1'
      })).rejects.toMatchObject({ statusCode: 409, details: { delivery_status: 'cancelled' } });
      expect(repository.acknowledge).toHaveBeenCalledWith(expect.objectContaining({ id: 'operation-1', token: 'lease-1', status: 'cancelled' }));
      expect(transportClient.prepareBookingGroup).not.toHaveBeenCalled();
    } finally {
      if (previous.enabled === undefined) delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED; else process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED = previous.enabled;
      if (previous.killSwitch === undefined) delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH; else process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH = previous.killSwitch;
      if (previous.disabledBranches === undefined) delete process.env.DGLAUNDRY_BOOKING_PAYMENTS_DISABLED_BRANCHES; else process.env.DGLAUNDRY_BOOKING_PAYMENTS_DISABLED_BRANCHES = previous.disabledBranches;
    }
  });
});
