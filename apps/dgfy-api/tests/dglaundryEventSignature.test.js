import { signDgfyEvent, buildDglaundryEventSignatureVerifier } from '../src/modules/dgfyLaundryOrders/services/dglaundryEventSignature.js';
import crypto from 'node:crypto';
import { jest } from '@jest/globals';

const originalEnvironment = { ...process.env };
const makeRedis = () => {
  const keys = new Set();
  return { set: jest.fn(async (key, _value, options) => {
    if (options?.NX && keys.has(key)) return null;
    keys.add(key);
    return 'OK';
  }) };
};
const signLaundryEvent = (privateKey, keyId, nonce) => {
  const body = JSON.stringify({ type: 'dglaundry.laundry_order.counter_registered.v1', id: nonce });
  const digest = `sha-256=:${crypto.createHash('sha256').update(body).digest('base64')}:`;
  const created = Math.floor(Date.now() / 1000);
  const signatureParams = `("@method" "@authority" "@path" "content-digest" "content-type");created=${created};expires=${created + 300};nonce="${nonce}";keyid="${keyId}";alg="ed25519";tag="dglaundry-dgfy-v1"`;
  const signatureBase = [
    '"@method": POST',
    '"@authority": api.dgfy.ph',
    '"@path": /api/v1/integrations/dglaundry/events',
    `"content-digest": ${digest}`,
    '"content-type": application/cloudevents+json',
    `"@signature-params": ${signatureParams}`
  ].join('\n');
  return {
    headers: { 'signature-input': `sig1=${signatureParams}`, signature: `sig1=:${crypto.sign(null, Buffer.from(signatureBase), privateKey).toString('base64')}:`, 'content-digest': digest, 'content-type': 'application/cloudevents+json' },
    method: 'POST', authority: 'api.dgfy.ph', path: '/api/v1/integrations/dglaundry/events', rawBody: body
  };
};

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
});

describe('DGLaundry event signature verification', () => {
  it('builds provider-origin events with the Ed25519 event profile', async () => {
    process.env.DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID = 'dgfy-event-test';
    process.env.DGLAUNDRY_INTEGRATION_KEY_ID = 'dgfy-event-test';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    process.env.DGFY_DGLAUNDRY_EVENT_SIGNING_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
    process.env.NODE_ENV = 'staging';
    process.env.DGLAUNDRY_SIGNATURE_PROFILE = 'http-message-signatures-v1';
    process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    const body = { specversion: '1.0', id: 'event-provider-1', type: 'dgfy.laundry_order.submitted.v1', data: { companyId: 'company-1' } };
    const headers = signDgfyEvent({ authority: 'laundry.surebizcorp.com', path: '/api/v1/integrations/dgfy/events', body });
    expect(Buffer.from(headers.signature.match(/^sig1=:([^:]+):$/)[1], 'base64')).toHaveLength(64);
    const verifier = buildDglaundryEventSignatureVerifier({ redisProvider: () => makeRedis(), redisConnected: () => true });
    await expect(verifier({ headers, method: 'POST', authority: 'laundry.surebizcorp.com', path: '/api/v1/integrations/dgfy/events', rawBody: JSON.stringify(body) })).resolves.toEqual({ ok: true, keyId: 'dgfy-event-test' });
  });

  it('fails closed with a stable error when the asymmetric public key is absent outside production', async () => {
    process.env.NODE_ENV = 'staging';
    process.env.DGLAUNDRY_SIGNATURE_PROFILE = 'http-message-signatures-v1';
    delete process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY;

    const verifier = buildDglaundryEventSignatureVerifier({ redisProvider: () => makeRedis(), redisConnected: () => true });
    await expect(verifier({
      headers: {},
      rawBody: '{}'
    })).resolves.toEqual({ ok: false, code: 'DGLAUNDRY_PUBLIC_KEY_REQUIRED' });
  });

  it('does not invoke crypto verification with an empty key when the profile is explicitly enabled', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DGLAUNDRY_SIGNATURE_PROFILE = 'http-message-signatures-v1';
    delete process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY;

    const verifier = buildDglaundryEventSignatureVerifier({ redisProvider: () => makeRedis(), redisConnected: () => true });
    await expect(verifier({
      headers: {
        signature: 'sig1=:invalid:;created=1;expires=2;nonce="n";keyid="k";alg="ed25519";tag="dglaundry-dgfy-v1"',
        'content-digest': 'sha-256=:invalid:',
        'content-type': 'application/json'
      },
      rawBody: '{}'
    })).resolves.toEqual({ ok: false, code: 'DGLAUNDRY_PUBLIC_KEY_REQUIRED' });
  });

  it('verifies the interoperable Signature-Input and Signature pair and rejects a replay', async () => {
    process.env.NODE_ENV = 'staging';
    process.env.DGLAUNDRY_SIGNATURE_PROFILE = 'http-message-signatures-v1';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    const body = JSON.stringify({ type: 'dglaundry.laundry_order.counter_registered.v1', id: 'event-1' });
    const digest = `sha-256=:${crypto.createHash('sha256').update(body).digest('base64')}:`;
    const created = Math.floor(Date.now() / 1000);
    const expires = created + 300;
    const nonce = crypto.randomUUID();
    const signatureParams = `("@method" "@authority" "@path" "content-digest" "content-type");created=${created};expires=${expires};nonce="${nonce}";keyid="dglaundry";alg="ed25519";tag="dglaundry-dgfy-v1"`;
    const signatureBase = [
      '"@method": POST',
      '"@authority": api.dgfy.ph',
      '"@path": /api/v1/integrations/dglaundry/events',
      `"content-digest": ${digest}`,
      '"content-type": application/cloudevents+json',
      `"@signature-params": ${signatureParams}`
    ].join('\n');
    const signature = crypto.sign(null, Buffer.from(signatureBase), privateKey).toString('base64');
    const input = {
      headers: {
        'signature-input': `sig1=${signatureParams}`,
        signature: `sig1=:${signature}:`,
        'content-digest': digest,
        'content-type': 'application/cloudevents+json'
      },
      method: 'POST',
      authority: 'api.dgfy.ph',
      path: '/api/v1/integrations/dglaundry/events',
      rawBody: body
    };
    const redis = makeRedis();
    const verifierA = buildDglaundryEventSignatureVerifier({ redisProvider: () => redis, redisConnected: () => true });
    const verifierB = buildDglaundryEventSignatureVerifier({ redisProvider: () => redis, redisConnected: () => true });
    await expect(verifierA(input)).resolves.toEqual({ ok: true, keyId: 'dglaundry' });
    await expect(verifierB(input)).resolves.toEqual({ ok: false, code: 'DGLAUNDRY_SIGNATURE_REPLAY' });
    expect(redis.set).toHaveBeenCalledWith(expect.stringMatching(/^dglaundry:event:nonce:[a-f0-9]{64}$/), '1', { NX: true, EX: expect.any(Number) });
    expect(redis.set.mock.calls[0][2].EX).toBeGreaterThanOrEqual(300);
  });

  it('rejects tampered signature bytes when the registered key ID and signature shape are valid', async () => {
    process.env.NODE_ENV = 'staging';
    process.env.DGLAUNDRY_SIGNATURE_PROFILE = 'http-message-signatures-v1';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    const input = signLaundryEvent(privateKey, 'dglaundry', 'tampered-signature-event');
    const signatureBytes = Buffer.from(input.headers.signature.match(/^sig1=:([^:]+):$/)[1], 'base64');
    signatureBytes[0] ^= 0xff;
    input.headers.signature = `sig1=:${signatureBytes.toString('base64')}:`;
    const redis = makeRedis();
    const verifier = buildDglaundryEventSignatureVerifier({ redisProvider: () => redis, redisConnected: () => true });

    await expect(verifier(input)).resolves.toEqual({ ok: false, code: 'DGLAUNDRY_SIGNATURE_INVALID' });
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('rejects expired signatures and fails closed when the shared replay store is unavailable', async () => {
    process.env.NODE_ENV = 'staging';
    process.env.DGLAUNDRY_SIGNATURE_PROFILE = 'http-message-signatures-v1';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    const body = JSON.stringify({ type: 'dglaundry.laundry_order.counter_registered.v1', id: 'event-expiry' });
    const sign = ({ nowSeconds, expires, nonce }) => {
      const digest = `sha-256=:${crypto.createHash('sha256').update(body).digest('base64')}:`;
      const signatureParams = `("@method" "@authority" "@path" "content-digest" "content-type");created=${nowSeconds};expires=${expires};nonce="${nonce}";keyid="dglaundry";alg="ed25519";tag="dglaundry-dgfy-v1"`;
      const signatureBase = [
        '"@method": POST',
        '"@authority": api.dgfy.ph',
        '"@path": /api/v1/integrations/dglaundry/events',
        `"content-digest": ${digest}`,
        '"content-type": application/cloudevents+json',
        `"@signature-params": ${signatureParams}`
      ].join('\n');
      const signature = crypto.sign(null, Buffer.from(signatureBase), privateKey).toString('base64');
      return {
        headers: {
          'signature-input': `sig1=${signatureParams}`,
          signature: `sig1=:${signature}:`,
          'content-digest': digest,
          'content-type': 'application/cloudevents+json'
        },
        method: 'POST',
        authority: 'api.dgfy.ph',
        path: '/api/v1/integrations/dglaundry/events',
        rawBody: body
      };
    };

    const start = Math.floor(Date.now() / 1000);
    const verifier = buildDglaundryEventSignatureVerifier({ redisProvider: () => makeRedis(), redisConnected: () => true, now: () => (start + 2) * 1000 });
    await expect(verifier(sign({ nowSeconds: start, expires: start + 1, nonce: 'expires-once' }))).resolves.toEqual({ ok: false, code: 'DGLAUNDRY_TIMESTAMP_INVALID' });

    const unavailable = buildDglaundryEventSignatureVerifier({ redisProvider: () => null, redisConnected: () => false });
    await expect(unavailable(sign({ nowSeconds: Math.floor(Date.now() / 1000), expires: Math.floor(Date.now() / 1000) + 300, nonce: 'redis-down' }))).resolves.toEqual({ ok: false, code: 'DGLAUNDRY_EVENT_REPLAY_STORE_UNAVAILABLE' });
  });

  it('accepts registered old and new event keys during overlap and rejects an unknown key ID', async () => {
    process.env.NODE_ENV = 'staging';
    process.env.DGLAUNDRY_SIGNATURE_PROFILE = 'http-message-signatures-v1';
    delete process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY;
    const oldPair = crypto.generateKeyPairSync('ed25519');
    const newPair = crypto.generateKeyPairSync('ed25519');
    process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEYS_JSON = JSON.stringify({
      'dglaundry-event-stage-old': oldPair.publicKey.export({ type: 'spki', format: 'pem' }),
      'dglaundry-event-stage-new': newPair.publicKey.export({ type: 'spki', format: 'pem' })
    });
    const verifier = buildDglaundryEventSignatureVerifier({ redisProvider: () => makeRedis(), redisConnected: () => true });
    await expect(verifier(signLaundryEvent(oldPair.privateKey, 'dglaundry-event-stage-old', 'old-key-event'))).resolves.toEqual({ ok: true, keyId: 'dglaundry-event-stage-old' });
    await expect(verifier(signLaundryEvent(newPair.privateKey, 'dglaundry-event-stage-new', 'new-key-event'))).resolves.toEqual({ ok: true, keyId: 'dglaundry-event-stage-new' });
    await expect(verifier(signLaundryEvent(newPair.privateKey, 'dglaundry-event-unregistered', 'unknown-key-event'))).resolves.toEqual({ ok: false, code: 'DGLAUNDRY_KEY_ID_UNKNOWN' });
  });
});
