import { jest } from '@jest/globals';
import { buildDgfyLaundryOrderUseCases } from '../src/modules/dgfyLaundryOrders/usecases/dgfyLaundryOrderUseCases.js';

const makeRepository = () => {
  const events = new Map();
  const catalogs = new Map();
  const availability = new Map();
  const orders = new Map();
  const customerActivities = new Map();
  const idempotency = new Map();
  return {
    events,
    catalogs,
    availability,
    orders,
    customerActivities,
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
    upsertCustomerActivity: jest.fn(async ({ companyId, locationId, activityReference, version, payload }) => {
      const key = `${companyId}:${locationId}:${activityReference}`;
      const current = customerActivities.get(key);
      if (current && Number(current.version_number) >= Number(version)) return { row: current, stale: true };
      const row = { company_id: companyId, location_id: locationId, activity_reference: activityReference, version_number: version, payload };
      customerActivities.set(key, row);
      return { row, stale: false };
    }),
    getOrderForAccount: jest.fn(async ({ companyId, locationId, externalOrderReference, dgfyAccountId }) => {
      const row = orders.get(`${companyId}:${locationId}:${externalOrderReference}`);
      return row?.dgfy_account_id === dgfyAccountId ? row : null;
    }),
    getOrderByTrackingReference: jest.fn(async ({ companyId, locationId, externalOrderReference, externalTrackingReference }) => {
      const row = orders.get(`${companyId}:${locationId}:${externalOrderReference}`);
      return row?.external_tracking_reference === externalTrackingReference ? row : null;
    }),
    bindOrderOwnership: jest.fn(async ({ companyId, locationId, externalOrderReference, externalTrackingReference, dgfyAccountId }) => {
      const key = `${companyId}:${locationId}:${externalOrderReference}`;
      const existing = orders.get(key);
      if (existing) return null;
      const row = { id: 'order-1', company_id: companyId, location_id: locationId, external_order_reference: externalOrderReference, external_tracking_reference: externalTrackingReference, dgfy_account_id: dgfyAccountId || null, aggregate_version: 0, status: 'pending_submission', payload: {} };
      orders.set(key, row);
      return row;
    }),
    upsertOrder: jest.fn(async ({ companyId, locationId, externalOrderReference, trackingReference, version, status, payload }) => {
      const key = `${companyId}:${locationId}:${externalOrderReference}`;
      const current = orders.get(key);
      if (current && Number(current.aggregate_version) >= Number(version)) return { row: current, stale: true };
      const row = { id: current?.id || 'order-1', company_id: companyId, location_id: locationId, external_order_reference: externalOrderReference, external_tracking_reference: current?.external_tracking_reference || trackingReference || null, dgfy_account_id: current?.dgfy_account_id || null, aggregate_version: Number(version), status, payload };
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
  it('serves mapped catalog, availability, and fixed/per-kilo quotes to storefront callers without laundry membership', async () => {
    const repository = makeRepository();
    repository.getCatalog = jest.fn(async () => ({ payload: { entries: [{ id: 'item-1' }] } }));
    repository.getAvailability = jest.fn(async () => ({ payload: { online: true } }));
    const partnerClient = { prepareQuote: jest.fn(async (input) => ({ quoteId: `quote-${input.mode}` })) };
    const useCases = buildDgfyLaundryOrderUseCases({ repository, partnerClient });
    const scope = { companyId: 'company-a', locationId: 'location-a' };

    await expect(useCases.getStoreCatalog(scope)).resolves.toMatchObject({ payload: { entries: [{ id: 'item-1' }] } });
    await expect(useCases.getStoreAvailability(scope)).resolves.toMatchObject({ payload: { online: true } });
    for (const mode of ['fixed', 'per_kilo']) {
      await expect(useCases.quote({
        payload: { ...scope, mode, lines: [{ variantId: 'item-1', mode, quantity: 1 }] },
        idempotencyKey: `mapped-quote-${mode}-123456`
      })).resolves.toMatchObject({ quote: { quoteId: `quote-${mode}` } });
    }

    expect(repository.findActiveMapping).toHaveBeenCalledTimes(4);
    expect(partnerClient.prepareQuote).toHaveBeenCalledTimes(2);
  });

  it('reads provider orders only through an active mapping and without account ownership', async () => {
    const repository = makeRepository();
    const useCases = buildDgfyLaundryOrderUseCases({ repository, partnerClient: {} });
    const input = { companyId: 'company-a', locationId: 'location-a', externalOrderReference: 'provider-order' };
    await expect(useCases.getOrderForProvider(input)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    expect(repository.getOrder).toHaveBeenCalledWith(input);
    expect(repository.findActiveMapping).toHaveBeenCalledWith({ companyId: 'company-a', locationId: 'location-a' });
    repository.orders.set('company-a:location-a:provider-order', { id: 'order-1', external_order_reference: 'provider-order' });
    await expect(useCases.getOrderForProvider(input)).resolves.toMatchObject({ id: 'order-1' });
    expect(repository.getOrder.mock.calls[0][0]).not.toHaveProperty('accountId');

    repository.findActiveMapping.mockResolvedValue(null);
    await expect(useCases.getOrderForProvider(input)).rejects.toMatchObject({ code: 'AUTHORIZATION_FAILED', statusCode: 403 });
  });

  it('registers sanitized customer activity and treats same-version replays as stale', async () => {
    const repository = makeRepository();
    const useCases = buildDgfyLaundryOrderUseCases({ repository, partnerClient: {} });
    const payload = {
      companyId: 'company-a', locationId: 'location-a', activityReference: 'counter-1',
      activityVersion: 2, summary: 'Wash completed', internalStaffId: 'must-not-persist'
    };
    const first = await useCases.registerCustomerActivity({ payload });
    expect(first).toMatchObject({ activityReference: 'counter-1', stale: false, projection: { version_number: 2 } });
    expect(first.projection.payload).not.toHaveProperty('internalStaffId');
    const replay = await useCases.registerCustomerActivity({ payload });
    expect(replay).toMatchObject({ activityReference: 'counter-1', stale: true });
    expect(repository.upsertCustomerActivity).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-a', locationId: 'location-a', activityReference: 'counter-1', version: 2
    }));
  });

  it('rejects customer activities without a sanitized reference or active mapping', async () => {
    const repository = makeRepository();
    const useCases = buildDgfyLaundryOrderUseCases({ repository, partnerClient: {} });
    await expect(useCases.registerCustomerActivity({ payload: { companyId: 'company-a', locationId: 'location-a' } }))
      .rejects.toMatchObject({ statusCode: 422 });
    repository.findActiveMapping.mockResolvedValue(null);
    await expect(useCases.registerCustomerActivity({ payload: {
      companyId: 'company-a', locationId: 'location-a', activityReference: 'counter-1'
    } })).rejects.toMatchObject({ code: 'AUTHORIZATION_FAILED', statusCode: 403 });
    expect(repository.upsertCustomerActivity).not.toHaveBeenCalled();
  });

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
    expect(repository.findActiveMapping).toHaveBeenCalledWith({ companyId: 'company-a', locationId: 'location-a' });
    expect(partnerClient.prepareQuote).toHaveBeenCalledTimes(1);
    const orderPayload = { ...payload, mode: 'per_kilo', lines: [{ variantId: 'svc-1', quantity: 1, mode: 'per_kilo' }], externalOrderReference: 'client-order', externalTrackingReference: 'client-tracking' };
    const submitted = await useCases.submitOrder({ payload: orderPayload, accountId: 'account-1', idempotencyKey: 'order-key-1234567890' });
    const replayed = await useCases.submitOrder({ payload: orderPayload, accountId: 'account-1', idempotencyKey: 'order-key-1234567890' });
    expect(partnerClient.submitOrder).toHaveBeenCalledTimes(1);
    expect(submitted.externalOrderReference).not.toBe('client-order');
    expect(submitted.externalTrackingReference).not.toBe('client-tracking');
    expect(replayed).toMatchObject({ idempotent_replay: true, externalOrderReference: submitted.externalOrderReference, externalTrackingReference: submitted.externalTrackingReference });
    expect(partnerClient.submitOrder.mock.calls[0][0].data).toEqual(expect.objectContaining({ customerReference: 'account-1', customerReferenceKind: 'dgfy_account' }));
  });

  it('submits per-kilo guest orders with a server-minted bearer reference and hides them without it', async () => {
    const repository = makeRepository();
    const partnerClient = { submitOrder: jest.fn(async () => ({ accepted: true })), cancelOrder: jest.fn(async () => ({ accepted: true })) };
    const useCases = buildDgfyLaundryOrderUseCases({ repository, partnerClient });
    const submitted = await useCases.submitOrder({
      payload: { companyId: 'company-a', locationId: 'location-a', mode: 'per_kilo', lines: [{ variantId: 'svc-1', quantity: 1, mode: 'per_kilo' }], fulfillment: { mode: 'pickup' } },
      idempotencyKey: 'guest-submit-123456789'
    });
    expect(partnerClient.submitOrder.mock.calls[0][0].data).toEqual(expect.objectContaining({
      customerReference: submitted.externalTrackingReference,
      customerReferenceKind: 'dgfy_guest'
    }));
    await expect(useCases.getOrder({ companyId: 'company-a', locationId: 'location-a', externalOrderReference: submitted.externalOrderReference }))
      .rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    await expect(useCases.getOrder({ companyId: 'company-a', locationId: 'location-a', externalOrderReference: submitted.externalOrderReference, externalTrackingReference: 'wrong-capability-reference' }))
      .rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    await expect(useCases.getOrder({ companyId: 'company-a', locationId: 'location-a', externalOrderReference: submitted.externalOrderReference, externalTrackingReference: submitted.externalTrackingReference }))
      .resolves.toMatchObject({ external_order_reference: submitted.externalOrderReference, dgfy_account_id: null });
    await expect(useCases.cancelOrder({
      payload: { companyId: 'company-a', locationId: 'location-a', externalOrderReference: submitted.externalOrderReference, reason: 'Customer requested cancellation' },
      idempotencyKey: 'guest-cancel-123456789',
    })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    await useCases.cancelOrder({
      payload: { companyId: 'company-a', locationId: 'location-a', externalOrderReference: submitted.externalOrderReference, externalTrackingReference: submitted.externalTrackingReference, reason: 'Customer requested cancellation' },
      idempotencyKey: 'guest-cancel-123456789',
    });
    expect(partnerClient.cancelOrder).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ externalOrderReference: submitted.externalOrderReference, externalTrackingReference: submitted.externalTrackingReference })
    }));
  });

  it('rejects fixed and mixed direct submission before creating any order', async () => {
    const repository = makeRepository();
    const partnerClient = { submitOrder: jest.fn() };
    const useCases = buildDgfyLaundryOrderUseCases({ repository, partnerClient });
    await expect(useCases.submitOrder({
      payload: { companyId: 'company-a', locationId: 'location-a', mode: 'fixed', lines: [{ variantId: 'svc-1', quantity: 1, mode: 'fixed' }] },
      idempotencyKey: 'fixed-submit-12345678'
    })).rejects.toMatchObject({ statusCode: 422 });
    expect(partnerClient.submitOrder).not.toHaveBeenCalled();
    expect(repository.bindOrderOwnership).not.toHaveBeenCalled();
  });

  it('blocks quote creation when the company/location mapping is not active', async () => {
    const repository = makeRepository();
    repository.findActiveMapping.mockResolvedValue(null);
    const partnerClient = { prepareQuote: jest.fn() };
    const useCases = buildDgfyLaundryOrderUseCases({ repository, partnerClient });
    await expect(useCases.quote({
      payload: { companyId: 'company-a', locationId: 'unmapped-location', lines: [{ variantId: 'svc-1', quantity: 1 }] },
      idempotencyKey: 'blocked-quote'
    })).rejects.toMatchObject({ code: 'AUTHORIZATION_FAILED', statusCode: 403 });
    expect(partnerClient.prepareQuote).not.toHaveBeenCalled();
  });

  it('only exposes an order to the immutable account that submitted it', async () => {
    const repository = makeRepository();
    const partnerClient = {
      submitOrder: jest.fn(async () => ({ accepted: true })),
      updateOrder: jest.fn(async () => ({ accepted: true })),
      cancelOrder: jest.fn(async () => ({ accepted: true }))
    };
    const useCases = buildDgfyLaundryOrderUseCases({ repository, partnerClient });
    const payload = { companyId: 'company-a', locationId: 'location-a', mode: 'per_kilo', customerReference: 'attacker-supplied', customerReferenceKind: 'dgfy_account', lines: [{ variantId: 'svc-1', quantity: 1, mode: 'per_kilo' }], fulfillment: { mode: 'pickup' } };

    const submitted = await useCases.submitOrder({ payload, accountId: 'account-owner', idempotencyKey: 'owned-submit-12345678' });
    const ownedPayload = { companyId: 'company-a', locationId: 'location-a', externalOrderReference: submitted.externalOrderReference };
    expect(partnerClient.submitOrder).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ customerReference: 'account-owner', customerReferenceKind: 'dgfy_account' }) }));
    await expect(useCases.getOrder({ ...ownedPayload, accountId: 'account-other' })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    await expect(useCases.updateOrder({ payload: ownedPayload, accountId: 'account-other', idempotencyKey: 'owned-update-other' })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    await expect(useCases.cancelOrder({ payload: ownedPayload, accountId: 'account-other', idempotencyKey: 'owned-cancel-other' })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    expect(partnerClient.updateOrder).not.toHaveBeenCalled();
    expect(partnerClient.cancelOrder).not.toHaveBeenCalled();

    await expect(useCases.getOrder({ ...ownedPayload, accountId: 'account-owner' })).resolves.toEqual(expect.objectContaining({ dgfy_account_id: 'account-owner' }));
    await useCases.updateOrder({ payload: ownedPayload, accountId: 'account-owner', idempotencyKey: 'owned-update-owner' });
    await useCases.cancelOrder({ payload: ownedPayload, accountId: 'account-owner', idempotencyKey: 'owned-cancel-owner' });
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
    const result = await useCases.submitOrder({ payload: { companyId: 'company-a', locationId: 'location-a', externalOrderReference: 'provider-order', externalTrackingReference: 'track-provider', mode: 'per_kilo', lines: [{ variantId: 'svc-1', quantity: 1, mode: 'per_kilo' }], fulfillment: { mode: 'pickup' } }, accountId: 'account-owner', idempotencyKey: 'provider-submit-123456' });
    expect(result.externalOrderReference).not.toBe('provider-order');
    expect(partnerClient.submitOrder).toHaveBeenCalledTimes(1);
    expect(repository.orders.get('company-a:location-a:provider-order')).toMatchObject({ dgfy_account_id: null, external_tracking_reference: 'track-provider' });
  });
});
