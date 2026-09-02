import { jest } from '@jest/globals';
import { buildDgfyLaundryOrderUseCases } from '../src/modules/dgfyLaundryOrders/usecases/dgfyLaundryOrderUseCases.js';

const makeRepository = () => {
  const events = new Map();
  const catalogs = new Map();
  const availability = new Map();
  const orders = new Map();
  const idempotency = new Map();
  return {
    events,
    catalogs,
    availability,
    orders,
    idempotency,
    findActiveMapping: jest.fn(async () => ({ id: 'mapping-1', status: 'active' })),
    findEvent: jest.fn(async (id) => events.get(id) || null),
    recordEvent: jest.fn(async ({ eventId, ...input }) => {
      if (events.has(eventId)) return { row: events.get(eventId), duplicate: true };
      const row = { event_id: eventId, status: 'received', ...input };
      events.set(eventId, row);
      return { row, duplicate: false };
    }),
    updateEvent: jest.fn(async (id, patch) => { const row = events.get(id); Object.assign(row, patch); return row; }),
    getCatalog: jest.fn(async ({ companyId, locationId }) => catalogs.get(`${companyId}:${locationId || ''}`) || null),
    upsertCatalog: jest.fn(async ({ companyId, locationId, version, payload }) => {
      const key = `${companyId}:${locationId || ''}`;
      const current = catalogs.get(key);
      if (current && Number(current.version_number) >= Number(version)) return { row: current, stale: true };
      const row = { id: 'catalog-1', company_id: companyId, location_id: locationId || '', version_number: Number(version), payload };
      catalogs.set(key, row);
      return { row, stale: false };
    }),
    getAvailability: jest.fn(async ({ companyId, locationId }) => availability.get(`${companyId}:${locationId}`) || null),
    upsertAvailability: jest.fn(async ({ companyId, locationId, version, payload }) => {
      const key = `${companyId}:${locationId}`;
      const current = availability.get(key);
      if (current && Number(current.version_number) >= Number(version)) return { row: current, stale: true };
      const row = { id: 'availability-1', company_id: companyId, location_id: locationId, version_number: Number(version), payload };
      availability.set(key, row);
      return { row, stale: false };
    }),
    getOrder: jest.fn(async ({ companyId, locationId, externalOrderReference }) => orders.get(`${companyId}:${locationId}:${externalOrderReference}`) || null),
    getOrderForAccount: jest.fn(async ({ companyId, locationId, externalOrderReference, dgfyAccountId }) => {
      const row = orders.get(`${companyId}:${locationId}:${externalOrderReference}`);
      return row?.dgfy_account_id === dgfyAccountId ? row : null;
    }),
    bindOrderOwnership: jest.fn(async ({ companyId, locationId, externalOrderReference, dgfyAccountId }) => {
      const key = `${companyId}:${locationId}:${externalOrderReference}`;
      const existing = orders.get(key);
      if (existing) return existing;
      const row = { id: 'order-1', company_id: companyId, location_id: locationId, external_order_reference: externalOrderReference, dgfy_account_id: dgfyAccountId, aggregate_version: 0, status: 'pending_submission', payload: {} };
      orders.set(key, row);
      return row;
    }),
    upsertOrder: jest.fn(async ({ companyId, locationId, externalOrderReference, version, status, payload }) => {
      const key = `${companyId}:${locationId}:${externalOrderReference}`;
      const current = orders.get(key);
      if (current && Number(current.aggregate_version) >= Number(version)) return { row: current, stale: true };
      const row = { id: current?.id || 'order-1', company_id: companyId, location_id: locationId, external_order_reference: externalOrderReference, dgfy_account_id: current?.dgfy_account_id || null, aggregate_version: Number(version), status, payload };
      orders.set(key, row);
      return { row, stale: false };
    }),
    findIdempotency: jest.fn(async (key) => idempotency.get(key) || null),
    saveIdempotency: jest.fn(async ({ key, requestHash, operation, response }) => { const row = { idempotency_key: key, request_hash: requestHash, operation, response }; idempotency.set(key, row); return row; }),
    listDeadLetters: jest.fn(async () => [...events.values()].filter((event) => ['dead_letter', 'quarantined'].includes(event.status)))
  };
};

const event = (type, data, id = `event-${type.split('.').at(-2)}`) => ({ specversion: '1.0', id, type, source: 'https://laundry.dgfy.ph', time: new Date().toISOString(), data });

describe('DGFY DGLaundry storefront/order projections', () => {
  it('materializes only sanitized catalog fields and ignores a stale publication', async () => {
    const repository = makeRepository();
    const useCases = buildDgfyLaundryOrderUseCases({ repository, partnerClient: {} });
    const first = await useCases.ingestProviderEvent({ event: event('dglaundry.laundry_catalog.published.v1', {
      companyId: 'company-a',
      catalogVersion: '2',
      secret: 'must-not-persist',
      entries: [{ id: 'svc-1', type: 'service', name: 'Wash', internalMachineId: 'washer-1', media: [{ url: 'https://cdn.test/wash.png', displayOrder: 0, isPrimary: true }] }]
    }) });
    expect(first.status).toBe('applied');
    expect(first.projection.payload.entries[0]).toEqual(expect.objectContaining({ id: 'svc-1', name: 'Wash' }));
    expect(first.projection.payload.entries[0].internalMachineId).toBeUndefined();
    const stale = await useCases.ingestProviderEvent({ event: event('dglaundry.laundry_catalog.published.v1', { companyId: 'company-a', catalogVersion: '1', entries: [] }, 'event-catalog-stale') });
    expect(stale.status).toBe('ignored');
  });

  it('deduplicates event ids and quarantines order version gaps', async () => {
    const repository = makeRepository();
    const useCases = buildDgfyLaundryOrderUseCases({ repository, partnerClient: {} });
    const data = { companyId: 'company-a', locationId: 'location-a', externalOrderReference: 'order-1', externalTrackingReference: 'track-1', aggregateVersion: 1, status: 'received', lines: [{ externalLineReference: 'line-1', serviceName: 'Wash', quantity: 1 }], fulfillment: { mode: 'pickup' } };
    const first = await useCases.ingestProviderEvent({ event: event('dglaundry.laundry_order.status_changed.v1', data, 'event-order-1') });
    expect(first.status).toBe('applied');
    const duplicate = await useCases.ingestProviderEvent({ event: event('dglaundry.laundry_order.status_changed.v1', data, 'event-order-1') });
    expect(duplicate.duplicate).toBe(true);
    const gap = await useCases.ingestProviderEvent({ event: event('dglaundry.laundry_order.status_changed.v1', { ...data, aggregateVersion: 3, status: 'ready' }, 'event-order-3') });
    expect(gap.status).toBe('quarantined');
    expect((await useCases.listDeadLetters({}))).toEqual(expect.arrayContaining([expect.objectContaining({ event_id: 'event-order-3' })]));
  });

  it('materializes counter activity without inferring a DGFY account', async () => {
    const repository = makeRepository();
    repository.upsertCustomerActivity = jest.fn(async ({ payload }) => ({ row: { payload }, stale: false }));
    const useCases = buildDgfyLaundryOrderUseCases({ repository, partnerClient: {} });
    const result = await useCases.ingestProviderEvent({ event: event('dglaundry.laundry_order.counter_registered.v1', { companyId: 'company-a', locationId: 'location-a', aggregateVersion: 1, localOrderId: 'counter-1', customerReference: { kind: 'dgfy_guest', reference: 'guest-1' }, internalStaffId: 'must-not-persist' }, 'event-counter-1') });
    expect(result.status).toBe('applied');
    expect(result.projection.payload.customerReference).toEqual({ kind: 'dgfy_guest', reference: 'guest-1' });
    expect(result.projection.payload.internalStaffId).toBeUndefined();
  });

  it('forwards quotes and orders once for an idempotency key', async () => {
    const repository = makeRepository();
    const partnerClient = {
      prepareQuote: jest.fn(async (payload) => ({ quoteId: 'quote-1', ...payload })),
      submitOrder: jest.fn(async (envelope) => ({ accepted: true, eventId: envelope.id })),
      updateOrder: jest.fn(),
      cancelOrder: jest.fn()
    };
    const useCases = buildDgfyLaundryOrderUseCases({ repository, partnerClient });
    const payload = { companyId: 'company-a', locationId: 'location-a', lines: [{ variantId: 'svc-1', quantity: 1 }], fulfillment: { mode: 'pickup' } };
    await useCases.quote({ payload, idempotencyKey: 'quote-key' });
    await useCases.quote({ payload, idempotencyKey: 'quote-key' });
    expect(partnerClient.prepareQuote).toHaveBeenCalledTimes(1);
    const orderPayload = { ...payload, externalOrderReference: 'order-1', externalTrackingReference: 'track-1' };
    await useCases.submitOrder({ payload: orderPayload, accountId: 'account-1', idempotencyKey: 'order-key' });
    await useCases.submitOrder({ payload: orderPayload, accountId: 'account-1', idempotencyKey: 'order-key' });
    expect(partnerClient.submitOrder).toHaveBeenCalledTimes(1);
    expect(partnerClient.submitOrder.mock.calls[0][0].data).toEqual(expect.objectContaining({ customerReference: 'account-1', customerReferenceKind: 'dgfy_account' }));
  });

  it('only exposes an order to the immutable account that submitted it', async () => {
    const repository = makeRepository();
    const partnerClient = {
      submitOrder: jest.fn(async () => ({ accepted: true })),
      updateOrder: jest.fn(async () => ({ accepted: true })),
      cancelOrder: jest.fn(async () => ({ accepted: true }))
    };
    const useCases = buildDgfyLaundryOrderUseCases({ repository, partnerClient });
    const payload = { companyId: 'company-a', locationId: 'location-a', externalOrderReference: 'owned-order', externalTrackingReference: 'track-1', customerReference: 'attacker-supplied', customerReferenceKind: 'dgfy_account', lines: [{ variantId: 'svc-1', quantity: 1 }], fulfillment: { mode: 'pickup' } };

    await useCases.submitOrder({ payload, accountId: 'account-owner', idempotencyKey: 'owned-submit' });
    expect(partnerClient.submitOrder).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ customerReference: 'account-owner', customerReferenceKind: 'dgfy_account' }) }));
    await expect(useCases.getOrder({ companyId: 'company-a', locationId: 'location-a', externalOrderReference: 'owned-order', accountId: 'account-other' })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    await expect(useCases.updateOrder({ payload, accountId: 'account-other', idempotencyKey: 'owned-update-other' })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    await expect(useCases.cancelOrder({ payload, accountId: 'account-other', idempotencyKey: 'owned-cancel-other' })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    expect(partnerClient.updateOrder).not.toHaveBeenCalled();
    expect(partnerClient.cancelOrder).not.toHaveBeenCalled();

    await expect(useCases.getOrder({ companyId: 'company-a', locationId: 'location-a', externalOrderReference: 'owned-order', accountId: 'account-owner' })).resolves.toEqual(expect.objectContaining({ dgfy_account_id: 'account-owner' }));
    await useCases.updateOrder({ payload, accountId: 'account-owner', idempotencyKey: 'owned-update-owner' });
    await useCases.cancelOrder({ payload, accountId: 'account-owner', idempotencyKey: 'owned-cancel-owner' });
    expect(partnerClient.updateOrder).toHaveBeenCalledTimes(1);
    expect(partnerClient.cancelOrder).toHaveBeenCalledTimes(1);
  });

  it('does not claim an unowned provider projection', async () => {
    const repository = makeRepository();
    const partnerClient = { submitOrder: jest.fn(async () => ({ accepted: true })) };
    const useCases = buildDgfyLaundryOrderUseCases({ repository, partnerClient });
    await useCases.ingestProviderEvent({ event: event('dglaundry.laundry_order.status_changed.v1', {
      companyId: 'company-a', locationId: 'location-a', externalOrderReference: 'provider-order', externalTrackingReference: 'track-provider', aggregateVersion: 1, status: 'received', lines: [{ externalLineReference: 'line-1', serviceName: 'Wash', quantity: 1 }], fulfillment: { mode: 'pickup' }
    }, 'event-provider-order') });
    await expect(useCases.submitOrder({ payload: { companyId: 'company-a', locationId: 'location-a', externalOrderReference: 'provider-order', externalTrackingReference: 'track-provider', lines: [{ variantId: 'svc-1', quantity: 1 }], fulfillment: { mode: 'pickup' } }, accountId: 'account-owner', idempotencyKey: 'provider-submit' })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    expect(partnerClient.submitOrder).not.toHaveBeenCalled();
  });
});
