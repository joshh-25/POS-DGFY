import { verifyDglaundryEventSignature } from '../src/modules/dgfyLaundryOrders/services/dglaundryEventSignature.js';
import crypto from 'node:crypto';

const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
});

describe('DGLaundry event signature verification', () => {
  it('fails closed with a stable error when the asymmetric public key is absent outside production', () => {
    process.env.NODE_ENV = 'staging';
    process.env.DGLAUNDRY_SIGNATURE_PROFILE = 'http-message-signatures-v1';
    delete process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY;

    expect(verifyDglaundryEventSignature({
      headers: {},
      rawBody: '{}'
    })).toEqual({ ok: false, code: 'DGLAUNDRY_PUBLIC_KEY_REQUIRED' });
  });

  it('does not invoke crypto verification with an empty key when the profile is explicitly enabled', () => {
    process.env.NODE_ENV = 'test';
    process.env.DGLAUNDRY_SIGNATURE_PROFILE = 'http-message-signatures-v1';
    delete process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY;

    expect(() => verifyDglaundryEventSignature({
      headers: {
        signature: 'sig1=:invalid:;created=1;expires=2;nonce="n";keyid="k";alg="ed25519";tag="dglaundry-dgfy-v1"',
        'content-digest': 'sha-256=:invalid:',
        'content-type': 'application/json'
      },
      rawBody: '{}'
    })).not.toThrow();
  });

  it('verifies the interoperable Signature-Input and Signature pair and rejects a replay', () => {
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
    expect(verifyDglaundryEventSignature(input)).toEqual({ ok: true, keyId: 'dglaundry' });
    expect(verifyDglaundryEventSignature(input)).toEqual({ ok: false, code: 'DGLAUNDRY_SIGNATURE_REPLAY' });
  });
});
