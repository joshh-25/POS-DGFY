import crypto from 'node:crypto';
import { jest } from '@jest/globals';

const originalEnvironment = { ...process.env };

const loadVerifier = async ({ redisConnected = true } = {}) => {
  jest.resetModules();
  const values = new Map();
  const redisClient = {
    set: jest.fn(async (key, value, options) => {
      if (options?.NX && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    })
  };
  jest.unstable_mockModule('../src/config/redis.js', () => ({
    getRedisClient: () => (redisConnected ? redisClient : null),
    isRedisConnected: () => redisConnected
  }));
  jest.unstable_mockModule('../src/modules/dgfyLaundry/services/dgfyLaundryOidcProvider.js', () => ({
    validateDglaundryMachineToken: jest.fn()
  }));
  const { verifyAsymmetricRequest } = await import('../src/modules/dgfyLaundry/middleware/dglaundryPartnerAuth.js');
  return { verifyAsymmetricRequest, redisClient };
};

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

const buildRequest = ({ privateKey, keyId = 'dglaundry-p256', nonce = crypto.randomUUID(), body = JSON.stringify({ intentId: 'synthetic-1' }), method = 'POST', url = 'https://api.dgfy.ph/api/v1/partners/dglaundry/registration-intents' }) => {
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
  const params = `(${components.map((component) => `"${component}"`).join(' ')});created=${created};expires=${expires};nonce="${nonce}";keyid="${keyId}";alg="ecdsa-p256-sha256";tag="dgfy-external-runtime-v1"`;
  const base = components.map((component) => component === '@method' ? `"@method": ${method}` : component === '@target-uri' ? `"@target-uri": ${target.toString()}` : `"${component}": ${headers[component]}`).concat(`"@signature-params": ${params}`).join('\n');
  const signature = crypto.sign('sha256', Buffer.from(base), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
  return { req: { method, originalUrl: target.pathname + target.search, url: target.pathname + target.search, headers: { host: target.host, ...headers, 'signature-input': `sig1=${params}`, signature: `sig1=:${signature}:` } }, body, base, privateKey };
};

describe('DGLaundry partner request authentication', () => {
  it('verifies raw P-256 requests, atomically claims shared replay keys, binds the query target, and rejects DER', async () => {
    const { verifyAsymmetricRequest, redisClient } = await loadVerifier();
    process.env.NODE_ENV = 'production';
    process.env.DGLAUNDRY_PARTNER_REQUEST_KEY_ID = 'dglaundry-p256';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    process.env.DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    const fixture = buildRequest({ privateKey, url: 'https://api.dgfy.ph/api/v1/partners/dglaundry/registration-intents?branch=main&n=2' });
    expect(await verifyAsymmetricRequest({ req: fixture.req, rawBody: fixture.body })).toMatch(/^dglaundry-p256:/);
    expect(await verifyAsymmetricRequest({ req: fixture.req, rawBody: fixture.body })).toBe('DGLAUNDRY_REQUEST_REPLAY');
    expect(redisClient.set).toHaveBeenCalledTimes(2);
    expect(redisClient.set).toHaveBeenCalledWith(expect.stringMatching(/^dgfy:dglaundry:partner-request-nonce:v1:/), '1', expect.objectContaining({ EX: expect.any(Number), NX: true }));

    const derFixture = buildRequest({ privateKey, nonce: 'der-nonce-1' });
    const der = crypto.sign('sha256', Buffer.from(derFixture.base), privateKey).toString('base64');
    derFixture.req.headers.signature = `sig1=:${der}:`;
    expect(await verifyAsymmetricRequest({ req: derFixture.req, rawBody: derFixture.body })).toBe('DGLAUNDRY_REQUEST_SIGNATURE_INVALID');

    const changedTarget = buildRequest({ privateKey, nonce: 'target-nonce-1', url: 'https://api.dgfy.ph/api/v1/partners/dglaundry/registration-intents?branch=main' });
    changedTarget.req.originalUrl += '&tampered=1';
    expect(await verifyAsymmetricRequest({ req: changedTarget.req, rawBody: changedTarget.body })).toBe('DGLAUNDRY_REQUEST_SIGNATURE_INVALID');
  });

  it('fails closed when production Redis is unavailable rather than using a process-local replay cache', async () => {
    const { verifyAsymmetricRequest, redisClient } = await loadVerifier({ redisConnected: false });
    process.env.NODE_ENV = 'production';
    process.env.DGLAUNDRY_PARTNER_REQUEST_KEY_ID = 'dglaundry-p256';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    process.env.DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    const fixture = buildRequest({ privateKey, nonce: 'redis-unavailable-1' });
    expect(await verifyAsymmetricRequest({ req: fixture.req, rawBody: fixture.body })).toBe('DGLAUNDRY_REQUEST_REPLAY_STORE_UNAVAILABLE');
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it('fails closed when the shared replay store operation errors', async () => {
    const { verifyAsymmetricRequest, redisClient } = await loadVerifier();
    process.env.NODE_ENV = 'production';
    process.env.DGLAUNDRY_PARTNER_REQUEST_KEY_ID = 'dglaundry-p256';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    process.env.DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    const fixture = buildRequest({ privateKey, nonce: 'redis-write-error-1' });
    redisClient.set.mockRejectedValue(new Error('redis unavailable'));
    expect(await verifyAsymmetricRequest({ req: fixture.req, rawBody: fixture.body })).toBe('DGLAUNDRY_REQUEST_REPLAY_STORE_UNAVAILABLE');
  });

  it('allows exactly one concurrent request with the same nonce', async () => {
    const { verifyAsymmetricRequest } = await loadVerifier();
    process.env.NODE_ENV = 'production';
    process.env.DGLAUNDRY_PARTNER_REQUEST_KEY_ID = 'dglaundry-p256';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    process.env.DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    const fixture = buildRequest({ privateKey, nonce: 'concurrent-replay-1' });
    const results = await Promise.all([
      verifyAsymmetricRequest({ req: fixture.req, rawBody: fixture.body }),
      verifyAsymmetricRequest({ req: fixture.req, rawBody: fixture.body })
    ]);
    expect(results.filter((result) => result === 'DGLAUNDRY_REQUEST_REPLAY')).toHaveLength(1);
    expect(results.filter((result) => result.startsWith('dglaundry-p256:'))).toHaveLength(1);
  });

  it('uses process-local replay tracking only outside production', async () => {
    const { verifyAsymmetricRequest } = await loadVerifier({ redisConnected: false });
    process.env.NODE_ENV = 'test';
    process.env.DGLAUNDRY_PARTNER_REQUEST_KEY_ID = 'dglaundry-p256';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    process.env.DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    const fixture = buildRequest({ privateKey, nonce: 'local-test-only-1' });
    expect(await verifyAsymmetricRequest({ req: fixture.req, rawBody: fixture.body })).toMatch(/^dglaundry-p256:/);
    expect(await verifyAsymmetricRequest({ req: fixture.req, rawBody: fixture.body })).toBe('DGLAUNDRY_REQUEST_REPLAY');
  });

  it('fails closed when the distinct DGLaundry request key is not configured', async () => {
    const { verifyAsymmetricRequest } = await loadVerifier();
    process.env.NODE_ENV = 'production';
    delete process.env.DGLAUNDRY_PARTNER_REQUEST_KEY_ID;
    delete process.env.DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY;
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const fixture = buildRequest({ privateKey, nonce: 'missing-key-1' });
    expect(await verifyAsymmetricRequest({ req: fixture.req, rawBody: fixture.body })).toBe('DGLAUNDRY_REQUEST_PUBLIC_KEY_NOT_CONFIGURED');
  });
});
