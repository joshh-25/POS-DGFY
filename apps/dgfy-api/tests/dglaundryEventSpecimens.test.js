import crypto from 'node:crypto';
import { jest } from '@jest/globals';
import { buildDglaundryEventSpecimens } from '../scripts/generate-dglaundry-event-specimens.mjs';
import { buildDglaundryEventSignatureVerifier } from '../src/modules/dgfyLaundryOrders/services/dglaundryEventSignature.js';

describe('DGLaundry signed event specimens', () => {
  const originalEnvironment = { ...process.env };

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
    Object.assign(process.env, originalEnvironment);
  });

  it('produces independently verifiable normal/payment samples and a byte-identical replay sample', async () => {
    process.env.NODE_ENV = 'staging';
    process.env.DGLAUNDRY_SIGNATURE_PROFILE = 'http-message-signatures-v1';
    process.env.DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID = 'specimen-key';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    process.env.DGFY_DGLAUNDRY_EVENT_SIGNING_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.DGLAUNDRY_PARTNER_BASE_URL = 'https://dglaundry.stage.dgfy.ph';
    process.env.DGLAUNDRY_INTEGRATION_KEY_ID = 'specimen-key';
    process.env.DGLAUNDRY_INTEGRATION_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const { authority, path, specimens } = buildDglaundryEventSpecimens({ now: new Date('2026-10-08T10:00:00.000Z') });
    const redisKeys = new Set();
    const verifier = buildDglaundryEventSignatureVerifier({
      now: () => Date.parse('2026-10-08T10:00:01.000Z'),
      redisConnected: () => true,
      redisProvider: () => ({ set: jest.fn(async (key, _value, options) => {
        if (options?.NX && redisKeys.has(key)) return null;
        redisKeys.add(key);
        return 'OK';
      }) })
    });

    expect(authority).toBe('dglaundry.stage.dgfy.ph');
    expect(Object.keys(specimens)).toEqual(['normal', 'payment', 'duplicate-payment']);
    for (const specimen of [specimens.normal, specimens.payment]) {
      expect(specimen.path).toBe('/api/v1/integrations/dgfy/events');
      await expect(verifier({ ...specimen, rawBody: JSON.stringify(specimen.body) })).resolves.toMatchObject({ ok: true });
    }
    expect(specimens['duplicate-payment']).toEqual(specimens.payment);
    await expect(verifier({ ...specimens['duplicate-payment'], rawBody: JSON.stringify(specimens['duplicate-payment'].body) }))
      .resolves.toEqual({ ok: false, code: 'DGLAUNDRY_SIGNATURE_REPLAY' });
  });

  it('refuses to guess the target host when DGLAUNDRY_PARTNER_BASE_URL is not set (#2513)', () => {
    expect(() => buildDglaundryEventSpecimens({ env: {}, now: new Date('2026-10-08T10:00:00.000Z') }))
      .toThrow('DGLAUNDRY_PARTNER_BASE_URL is required');
  });
});
