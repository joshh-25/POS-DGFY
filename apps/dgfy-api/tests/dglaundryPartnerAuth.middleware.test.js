import { afterEach, describe, expect, it, jest } from '@jest/globals';
import crypto from 'node:crypto';

const loadMiddleware = async ({ redisConnected = true } = {}) => {
  jest.resetModules();
  const validateDglaundryMachineToken = jest.fn();
  const values = new Set();
  const redisClient = {
    set: jest.fn(async (key, _value, options) => {
      if (options?.NX && values.has(key)) return null;
      values.add(key);
      return 'OK';
    })
  };
  jest.unstable_mockModule('../src/modules/dgfyLaundry/services/dgfyLaundryOidcProvider.js', () => ({
    validateDglaundryMachineToken
  }));
  jest.unstable_mockModule('../src/config/redis.js', () => ({
    getRedisClient: () => (redisConnected ? redisClient : null),
    isRedisConnected: () => redisConnected
  }));
  const module = await import('../src/modules/dgfyLaundry/middleware/dglaundryPartnerAuth.js');
  return { requireDglaundryPartner: module.requireDglaundryPartner, validateDglaundryMachineToken, redisClient };
};

const buildRequest = ({ privateKey, nonce = crypto.randomUUID(), body = JSON.stringify({ intentId: 'synthetic-1' }), method = 'POST', url = 'https://api.dgfy.ph/api/v1/partners/dglaundry/registration-intents' }) => {
  const target = new URL(url);
  const created = Math.floor(Date.now() / 1000);
  const expires = created + 300;
  const digest = `sha-256=:${crypto.createHash('sha256').update(body).digest('base64')}:`;
  const headers = {
    authorization: 'Bearer synthetic-machine-token',
    'x-dgfy-app-id': 'dglaundry',
    'x-dgfy-contract-version': 'external-runtime-v0.1',
    date: new Date(created * 1000).toUTCString(),
    'content-digest': digest,
    'content-type': 'application/json',
    'idempotency-key': 'synthetic-idem-1'
  };
  const components = ['@method', '@target-uri', 'content-digest', 'content-type', 'authorization', 'idempotency-key', 'x-dgfy-app-id', 'x-dgfy-contract-version', 'date'];
  const params = `(${components.map((component) => `"${component}"`).join(' ')});created=${created};expires=${expires};nonce="${nonce}";keyid="dglaundry-p256";alg="ecdsa-p256-sha256";tag="dgfy-external-runtime-v1"`;
  const base = components.map((component) => component === '@method' ? `"@method": ${method}` : component === '@target-uri' ? `"@target-uri": ${target.toString()}` : `"${component}": ${headers[component]}`).concat(`"@signature-params": ${params}`).join('\n');
  const signature = crypto.sign('sha256', Buffer.from(base), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
  return {
    req: {
      method,
      originalUrl: target.pathname + target.search,
      url: target.pathname + target.search,
      rawBody: body,
      headers: { host: target.host, ...headers, 'signature-input': `sig1=${params}`, signature: `sig1=:${signature}:` }
    },
    body
  };
};

const configureProductionSignature = () => {
  process.env.NODE_ENV = 'production';
  process.env.DGFY_DGLAUNDRY_PARTNER_APP_ID = 'dglaundry';
  process.env.DGLAUNDRY_PARTNER_REQUEST_KEY_ID = 'dglaundry-p256';
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  process.env.DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
  return privateKey;
};

const machineGrant = { client_id: 'dglaundry-machine', scope: 'dglaundry' };

describe('DGLaundry partner authentication middleware', () => {
  const originalEnvironment = { ...process.env };

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnvironment)) delete process.env[key];
    }
    Object.assign(process.env, originalEnvironment);
  });

  it('propagates machine-token validation failures to Express error handling', async () => {
    process.env.NODE_ENV = 'production';
    const { requireDglaundryPartner, validateDglaundryMachineToken } = await loadMiddleware();
    const failure = new Error('redis unavailable');
    validateDglaundryMachineToken.mockRejectedValue(failure);
    const req = { headers: { authorization: 'Bearer machine-token' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await requireDglaundryPartner(req, res, next);

    expect(next).toHaveBeenCalledWith(failure);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects production requests without a machine bearer even when the legacy secret matches', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DGLAUNDRY_PARTNER_TOKEN = 'legacy-test-secret';
    const { requireDglaundryPartner, validateDglaundryMachineToken } = await loadMiddleware();
    const req = { headers: { 'x-dglaundry-partner-token': 'legacy-test-secret' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await requireDglaundryPartner(req, res, next);

    expect(validateDglaundryMachineToken).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error_code: 'DGLAUNDRY_MACHINE_AUTHENTICATION_REQUIRED' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts only the registered machine client, inbound scope, and application ID', async () => {
    process.env.NODE_ENV = 'test';
    const { requireDglaundryPartner, validateDglaundryMachineToken } = await loadMiddleware();
    validateDglaundryMachineToken.mockResolvedValue({ client_id: 'dglaundry-machine', scope: 'dglaundry' });
    const req = { headers: { authorization: 'Bearer machine-token', 'x-dgfy-app-id': 'dglaundry' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await requireDglaundryPartner(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.partnerIdentity).toBe('dglaundry-machine');
    expect(req.partnerScope).toBe('dglaundry');
  });

  it.each([
    ['unexpected client identity', { client_id: 'another-client', scope: 'dglaundry' }, 'dglaundry'],
    ['unexpected scope', { client_id: 'dglaundry-machine', scope: 'dglaundry:orders:read' }, 'dglaundry'],
    ['unexpected app identity', { client_id: 'dglaundry-machine', scope: 'dglaundry' }, 'another-app']
  ])('rejects a machine grant with %s', async (_name, grant, appId) => {
    process.env.NODE_ENV = 'test';
    const { requireDglaundryPartner, validateDglaundryMachineToken } = await loadMiddleware();
    validateDglaundryMachineToken.mockResolvedValue(grant);
    const req = { headers: { authorization: 'Bearer machine-token', 'x-dgfy-app-id': appId } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await requireDglaundryPartner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a production machine grant with a valid request signature', async () => {
    const privateKey = configureProductionSignature();
    const { requireDglaundryPartner, validateDglaundryMachineToken, redisClient } = await loadMiddleware();
    validateDglaundryMachineToken.mockResolvedValue(machineGrant);
    const { req } = buildRequest({ privateKey });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await requireDglaundryPartner(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.partnerIdentity).toBe('dglaundry-machine');
    expect(req.partnerScope).toBe('dglaundry');
    expect(req.dglaundryRequestReplayKey).toMatch(/^dglaundry-p256:/);
    expect(redisClient.set).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a production request signature replay through the middleware', async () => {
    const privateKey = configureProductionSignature();
    const { requireDglaundryPartner, validateDglaundryMachineToken } = await loadMiddleware();
    validateDglaundryMachineToken.mockResolvedValue(machineGrant);
    const { req } = buildRequest({ privateKey, nonce: 'middleware-replay-1' });
    const firstRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const secondRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const firstNext = jest.fn();
    const secondNext = jest.fn();

    await requireDglaundryPartner(req, firstRes, firstNext);
    await requireDglaundryPartner(req, secondRes, secondNext);

    expect(firstNext).toHaveBeenCalledWith();
    expect(secondRes.status).toHaveBeenCalledWith(401);
    expect(secondRes.json).toHaveBeenCalledWith(expect.objectContaining({ error_code: 'DGLAUNDRY_REQUEST_REPLAY' }));
    expect(secondNext).not.toHaveBeenCalled();
  });

  it('rejects an invalid production request signature through the middleware', async () => {
    const privateKey = configureProductionSignature();
    const { requireDglaundryPartner, validateDglaundryMachineToken } = await loadMiddleware();
    validateDglaundryMachineToken.mockResolvedValue(machineGrant);
    const { req } = buildRequest({ privateKey, nonce: 'middleware-invalid-signature-1' });
    req.headers.signature = `sig1=:${Buffer.alloc(64).toString('base64')}:`;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await requireDglaundryPartner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error_code: 'DGLAUNDRY_REQUEST_SIGNATURE_INVALID' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('fails closed through the middleware when production Redis is unavailable', async () => {
    const privateKey = configureProductionSignature();
    const { requireDglaundryPartner, validateDglaundryMachineToken, redisClient } = await loadMiddleware({ redisConnected: false });
    validateDglaundryMachineToken.mockResolvedValue(machineGrant);
    const { req } = buildRequest({ privateKey, nonce: 'middleware-redis-unavailable-1' });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await requireDglaundryPartner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error_code: 'DGLAUNDRY_REQUEST_REPLAY_STORE_UNAVAILABLE' }));
    expect(redisClient.set).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks legacy static tokens under the signed profile outside production', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DGLAUNDRY_SIGNATURE_PROFILE = 'http-message-signatures-v1';
    process.env.DGLAUNDRY_PARTNER_TOKEN = 'legacy-test-secret';
    const { requireDglaundryPartner, validateDglaundryMachineToken } = await loadMiddleware();
    const req = { headers: { 'x-dglaundry-partner-token': 'legacy-test-secret' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await requireDglaundryPartner(req, res, next);

    expect(validateDglaundryMachineToken).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Static DGLaundry partner tokens are disabled for hosted signed integration traffic.' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('verifies the request signature under the signed profile outside production', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DGLAUNDRY_SIGNATURE_PROFILE = 'http-message-signatures-v1';
    process.env.DGLAUNDRY_PARTNER_REQUEST_KEY_ID = 'dglaundry-p256';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    process.env.DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    const { requireDglaundryPartner, validateDglaundryMachineToken } = await loadMiddleware();
    validateDglaundryMachineToken.mockResolvedValue(machineGrant);
    const { req } = buildRequest({ privateKey, nonce: 'signed-profile-nonproduction-1' });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await requireDglaundryPartner(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.dglaundryRequestReplayKey).toMatch(/^dglaundry-p256:/);
    expect(res.status).not.toHaveBeenCalled();
  });
});
