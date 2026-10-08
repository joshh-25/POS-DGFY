import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { jest } from '@jest/globals';
import { mapDomainErrorToHttp } from '../src/modules/shared/contracts/domainErrorMapper.js';

const redisNonces = new Set();
const redisSet = jest.fn(async (key, _value, options) => {
  if (options?.NX && redisNonces.has(key)) return null;
  redisNonces.add(key);
  return 'OK';
});
const findLaundryCompany = jest.fn();
const audit = jest.fn(async () => {});
const findActiveMapping = jest.fn();
const listDeadLetters = jest.fn();
const findDeadLetter = jest.fn();
const redriveOutbound = jest.fn();
const recordEvent = jest.fn();
const updateEvent = jest.fn();
const getOrder = jest.fn();
const upsertOrder = jest.fn();
const eventRows = new Map();
let projectionCount = 0;

jest.unstable_mockModule('../src/config/redis.js', () => ({
  getRedisClient: () => ({ set: redisSet }),
  isRedisConnected: () => true
}));
jest.unstable_mockModule('../src/middleware/dgfyAuth.js', () => ({
  authenticateDgfyAccount: (req, _res, next) => {
    req.dgfyAccount = { id: req.get('x-test-account-id') || 'account-1' };
    next();
  }
}));
jest.unstable_mockModule('../src/modules/dgfyLaundry/repositories/dgfyLaundryRepository.js', () => ({
  dgfyLaundryRepository: { findLaundryCompany, audit }
}));
jest.unstable_mockModule('../src/modules/dgfyLaundryOrders/repositories/dgfyLaundryOrderRepository.js', () => ({
  dgfyLaundryOrderRepository: {
    findActiveMapping, listDeadLetters, findDeadLetter, redriveOutbound,
    findEvent: jest.fn(async (eventId) => eventRows.get(eventId) || null),
    recordEvent, updateEvent, getOrder, upsertOrder
  }
}));

let app;

const signedEventRequest = ({ event, privateKey, nonce }) => {
  const rawBody = JSON.stringify(event);
  const digest = `sha-256=:${crypto.createHash('sha256').update(rawBody).digest('base64')}:`;
  const created = Math.floor(Date.now() / 1000);
  const signatureParams = `("@method" "@authority" "@path" "content-digest" "content-type");created=${created};expires=${created + 300};nonce="${nonce}";keyid="dglaundry-test";alg="ed25519";tag="dglaundry-dgfy-v1"`;
  const signatureBase = [
    '"@method": POST',
    '"@authority": api.dgfy.ph',
    '"@path": /api/v1/integrations/dglaundry/events',
    `"content-digest": ${digest}`,
    '"content-type": application/cloudevents+json',
    `"@signature-params": ${signatureParams}`
  ].join('\n');
  return request(app)
    .post('/api/v1/integrations/dglaundry/events')
    .set('host', 'api.dgfy.ph')
    .set('content-type', 'application/cloudevents+json')
    .set('content-digest', digest)
    .set('signature-input', `sig1=${signatureParams}`)
    .set('signature', `sig1=:${crypto.sign(null, Buffer.from(signatureBase), privateKey).toString('base64')}:`)
    .send(rawBody);
};

beforeAll(async () => {
  const [laundryRouter, eventRouter] = await Promise.all([
    import('../src/routes/dgfyLaundry.js'),
    import('../src/routes/dgfyLaundryOrders.js')
  ]);
  app = express();
  app.use(express.json({
    type: ['application/json', 'application/cloudevents+json'],
    verify: (req, _res, buffer) => { req.rawBody = buffer.toString(); }
  }));
  app.use('/api/v1/partners/dglaundry', laundryRouter.default);
  app.use(eventRouter.default);
  app.use((error, _req, res, next) => {
    const mapped = mapDomainErrorToHttp(error);
    if (!mapped) return next(error);
    return res.status(mapped.statusCode).json({ success: false, ...mapped.payload });
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  redisNonces.clear();
  eventRows.clear();
  projectionCount = 0;
  process.env.NODE_ENV = 'test';
  process.env.DGLAUNDRY_SIGNATURE_PROFILE = 'http-message-signatures-v1';
  process.env.DGLAUNDRY_INTEGRATION_KEY_ID = 'dglaundry-test';
  findLaundryCompany.mockResolvedValue({ role: 'owner' });
  findActiveMapping.mockResolvedValue({ dgfy_company_id: 'company-1', dgfy_location_id: 'location-1', status: 'active' });
  listDeadLetters.mockResolvedValue([{ id: 'dead-1', direction: 'outbound', status: 'dead_letter' }]);
  findDeadLetter.mockResolvedValue({ id: 'dead-1', direction: 'outbound', status: 'dead_letter', attempts: 4 });
  redriveOutbound.mockResolvedValue(true);
  recordEvent.mockImplementation(async (input) => {
    const previous = eventRows.get(input.eventId);
    if (previous) return { row: previous, duplicate: true };
    const row = { event_id: input.eventId, status: 'received', ...input };
    eventRows.set(input.eventId, row);
    return { row, duplicate: false };
  });
  updateEvent.mockImplementation(async (eventId, patch) => {
    const row = eventRows.get(eventId);
    Object.assign(row, patch);
    return row;
  });
  getOrder.mockResolvedValue(null);
  upsertOrder.mockImplementation(async (input) => {
    projectionCount += 1;
    return { stale: false, row: { aggregate_version: input.version, status: input.status } };
  });
});

describe('DGLaundry dead-letter HTTP transport', () => {
  // Repository modules are faked so HTTP requests execute the real router, controller, use case,
  // and authorizeOperator decision without claiming to exercise the underlying SQL mutation.
  it('lists dead letters for an owner through the real authorization decision', async () => {
    const response = await request(app)
      .get('/api/v1/partners/dglaundry/dead-letters')
      .query({ company_id: 'company-1', location_id: 'location-1', direction: 'outbound' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ id: 'dead-1', direction: 'outbound', status: 'dead_letter' }]);
    expect(findLaundryCompany).toHaveBeenCalledWith({ dgfyAccountId: 'account-1', companyId: 'company-1' });
    expect(findActiveMapping).toHaveBeenCalledWith({ companyId: 'company-1', locationId: 'location-1' });
    expect(listDeadLetters).toHaveBeenCalledWith({ companyId: 'company-1', locationId: 'location-1', direction: 'outbound', limit: 100 });
  });

  it('rejects a customer role and an inactive mapping through the HTTP middleware chain', async () => {
    findLaundryCompany.mockResolvedValueOnce({ role: 'customer' });
    const customerResponse = await request(app)
      .get('/api/v1/partners/dglaundry/dead-letters?company_id=company-1&location_id=location-1');
    expect(customerResponse.status).toBe(403);
    expect(customerResponse.body.code).toBe('AUTHORIZATION_FAILED');
    expect(findActiveMapping).not.toHaveBeenCalled();

    findActiveMapping.mockResolvedValueOnce(null);
    const unmappedResponse = await request(app)
      .get('/api/v1/partners/dglaundry/dead-letters?company_id=company-1&location_id=location-1');
    expect(unmappedResponse.status).toBe(403);
    expect(unmappedResponse.body.code).toBe('AUTHORIZATION_FAILED');
    expect(listDeadLetters).not.toHaveBeenCalled();
  });

  it('audits a redrive before mutation and forwards the caller scope and reason', async () => {
    const response = await request(app)
      .post('/api/v1/partners/dglaundry/dead-letters/dead-1/redrive')
      .send({ reason: 'Provider recovered', company_id: 'company-1', location_id: 'location-1', direction: 'outbound' });

    expect(response.status).toBe(202);
    expect(response.body.data).toEqual({ id: 'dead-1', direction: 'outbound', disposition: 'requeued' });
    expect(findDeadLetter).toHaveBeenCalledWith({ id: 'dead-1', companyId: 'company-1', locationId: 'location-1', direction: 'outbound' });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'dglaundry_dead_letter_redrive', dgfyAccountId: 'account-1', companyId: 'company-1',
      metadata: expect.objectContaining({ id: 'dead-1', direction: 'outbound', reason: 'Provider recovered' })
    }));
    expect(redriveOutbound).toHaveBeenCalledWith({ id: 'dead-1', companyId: 'company-1', locationId: 'location-1', maxAttempts: 8 });
    expect(audit.mock.invocationCallOrder[0]).toBeLessThan(redriveOutbound.mock.invocationCallOrder[0]);
  });

  it('deduplicates the same event ID after two valid signatures with fresh nonces', async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    const event = {
      specversion: '1.0', id: 'same-business-event', source: 'https://laundry.example/events',
      type: 'dglaundry.laundry_order.accepted.v1', aggregateVersion: 1,
      data: { companyId: 'company-1', locationId: 'location-1', externalOrderReference: 'order-1', externalTrackingReference: 'tracking-1', status: 'received' }
    };

    const first = await signedEventRequest({ event, privateKey, nonce: 'fresh-nonce-1' });
    const second = await signedEventRequest({ event, privateKey, nonce: 'fresh-nonce-2' });

    expect(first.status).toBe(202);
    expect(first.body.data).toEqual(expect.objectContaining({ eventId: event.id, status: 'applied', duplicate: false }));
    expect(second.status).toBe(202);
    expect(second.body.data).toEqual({ eventId: event.id, status: 'applied', duplicate: true });
    expect(redisSet).toHaveBeenCalledTimes(2);
    expect(recordEvent).toHaveBeenCalledTimes(2);
    expect(projectionCount).toBe(1);
    expect(upsertOrder).toHaveBeenCalledTimes(1);
  });
});
