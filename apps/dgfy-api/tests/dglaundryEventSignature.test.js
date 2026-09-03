import { verifyDglaundryEventSignature } from '../src/modules/dgfyLaundryOrders/services/dglaundryEventSignature.js';

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
});
