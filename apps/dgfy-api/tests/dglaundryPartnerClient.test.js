import crypto from 'node:crypto';
import { signDglaundryPartnerRequest } from '../src/modules/dgfyLaundryOrders/services/dglaundryPartnerClient.js';

const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

describe('DGLaundry partner request profile', () => {
  it('emits separate RFC 9421-style headers with a P-256 signature', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    process.env.DGLAUNDRY_PARTNER_ACCESS_TOKEN = 'machine-access-token';
    process.env.DGLAUNDRY_PARTNER_SIGNING_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const target = new URL('https://laundry.surebizcorp.com/api/v1/integrations/dgfy/quotes?location_id=branch-1');
    const rawBody = JSON.stringify({ quoteId: 'quote-1' });
    const headers = signDglaundryPartnerRequest({ method: 'POST', target, rawBody, idempotencyKey: 'idem-1' });
    expect(headers.authorization).toBe('Bearer machine-access-token');
    expect(headers['signature-input']).toMatch(/^sig1=\("@method" "@target-uri" "content-digest" "content-type" "authorization" "idempotency-key" "x-dgfy-app-id" "x-dgfy-contract-version" "date"\);/);
    expect(headers.signature).toMatch(/^sig1=:[^:]+:$/);
    const signatureParams = headers['signature-input'].slice('sig1='.length);
    const signatureBase = [
      `"@method": POST`,
      `"@target-uri": ${target.toString()}`,
      `"content-digest": ${headers['content-digest']}`,
      `"content-type": ${headers['content-type']}`,
      `"authorization": ${headers.authorization}`,
      `"idempotency-key": ${headers['idempotency-key']}`,
      `"x-dgfy-app-id": ${headers['x-dgfy-app-id']}`,
      `"x-dgfy-contract-version": ${headers['x-dgfy-contract-version']}`,
      `"date": ${headers.date}`,
      `"@signature-params": ${signatureParams}`
    ].join('\n');
    const wireSignature = Buffer.from(headers.signature.slice(6, -1), 'base64');
    expect(wireSignature).toHaveLength(64);
    expect(crypto.verify('sha256', Buffer.from(signatureBase), { key: publicKey, dsaEncoding: 'ieee-p1363' }, wireSignature)).toBe(true);
    expect(crypto.verify('sha256', Buffer.from(signatureBase), publicKey, wireSignature)).toBe(false);
  });
});
