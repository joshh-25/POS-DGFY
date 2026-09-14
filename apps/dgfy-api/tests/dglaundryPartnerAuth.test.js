import crypto from 'node:crypto';
import { jest } from '@jest/globals';
import { verifyAsymmetricRequest } from '../src/modules/dgfyLaundry/middleware/dglaundryPartnerAuth.js';

const originalEnvironment = { ...process.env };

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
  it('verifies raw P-256 requests, binds the query target, and rejects replay/DER', () => {
    process.env.NODE_ENV = 'production';
    process.env.DGLAUNDRY_PARTNER_REQUEST_KEY_ID = 'dglaundry-p256';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    process.env.DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    const fixture = buildRequest({ privateKey, url: 'https://api.dgfy.ph/api/v1/partners/dglaundry/registration-intents?branch=main&n=2' });
    expect(verifyAsymmetricRequest({ req: fixture.req, rawBody: fixture.body })).toMatch(/^dglaundry-p256:/);
    expect(verifyAsymmetricRequest({ req: fixture.req, rawBody: fixture.body })).toBe('DGLAUNDRY_REQUEST_REPLAY');

    const derFixture = buildRequest({ privateKey, nonce: 'der-nonce-1' });
    const der = crypto.sign('sha256', Buffer.from(derFixture.base), privateKey).toString('base64');
    derFixture.req.headers.signature = `sig1=:${der}:`;
    expect(verifyAsymmetricRequest({ req: derFixture.req, rawBody: derFixture.body })).toBe('DGLAUNDRY_REQUEST_SIGNATURE_INVALID');

    const changedTarget = buildRequest({ privateKey, nonce: 'target-nonce-1', url: 'https://api.dgfy.ph/api/v1/partners/dglaundry/registration-intents?branch=main' });
    changedTarget.req.originalUrl += '&tampered=1';
    expect(verifyAsymmetricRequest({ req: changedTarget.req, rawBody: changedTarget.body })).toBe('DGLAUNDRY_REQUEST_SIGNATURE_INVALID');
  });

  it('fails closed when the distinct DGLaundry request key is not configured', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DGLAUNDRY_PARTNER_REQUEST_KEY_ID;
    delete process.env.DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY;
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const fixture = buildRequest({ privateKey, nonce: 'missing-key-1' });
    expect(verifyAsymmetricRequest({ req: fixture.req, rawBody: fixture.body })).toBe('DGLAUNDRY_REQUEST_PUBLIC_KEY_NOT_CONFIGURED');
  });
});
