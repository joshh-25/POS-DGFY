import crypto from 'node:crypto';
import { jest } from '@jest/globals';
import { buildDglaundryRuntimeAttestationUseCase } from '../src/modules/dgfyLaundry/usecases/dglaundryRuntimeAttestationUseCase.js';

const fixedDate = new Date('2026-10-08T10:00:00.000Z');

const dependencies = (overrides = {}) => ({
  repository: { listMappings: jest.fn(async () => [
    { dgfy_company_id: 'company-b', dgfy_location_id: 'location-2', dglaundry_organization_id: 'org-b', dglaundry_branch_id: 'branch-2' },
    { dgfy_company_id: 'company-a', dgfy_location_id: 'location-1', dglaundry_organization_id: 'org-a', dglaundry_branch_id: 'branch-1' }
  ]) },
  listVerificationKeysFn: jest.fn(async () => [{ kid: 'oidc', publicKeyPem: 'public' }]),
  resolveRuntimeShaInfoFn: jest.fn(() => ({ runtimeSha: 'abcdef0123456', present: true })),
  redisConfiguredFn: jest.fn(() => true),
  redisConnectedFn: jest.fn(() => true),
  redisClientFn: jest.fn(() => ({ ping: jest.fn(async () => 'PONG') })),
  parPkceConfiguredFn: jest.fn(() => true),
  signDocumentFn: jest.fn((attestation) => ({ signature: 'signed', keyId: `key-${attestation.providerRuntimeAttestationVersion}` })),
  now: () => fixedDate,
  ...overrides
});

const originalEnvironment = { ...process.env };
afterEach(() => {
  jest.restoreAllMocks();
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

describe('DGLaundry runtime attestation', () => {
  it('derives readiness and mapping hash from live checks, then signs the report', async () => {
    const deps = dependencies();
    const result = await buildDglaundryRuntimeAttestationUseCase(deps)();

    expect(result.attestation).toMatchObject({
      providerRuntimeAttestationVersion: '1',
      configurationRevision: 'abcdef0123456',
      applicationShas: { 'dgfy-api': 'abcdef0123456' },
      oidcJwksReady: true,
      browserClientReady: false,
      machineClientReady: false,
      parPkceReady: true,
      replayStatePersistenceReady: true,
      generatedAt: fixedDate.toISOString()
    });
    expect(result.attestation.branchAllowlistSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.details.browserClientReady).toMatch(/not verifiable/i);
    expect(deps.signDocumentFn).toHaveBeenCalledWith(result.attestation);
    expect(result).toMatchObject({ signature: 'signed', keyId: 'key-1', algorithm: 'ed25519' });
  });

  it('fails closed when OIDC keys, Redis, or runtime SHA are unavailable', async () => {
    const deps = dependencies({
      listVerificationKeysFn: jest.fn(async () => { throw new Error('unavailable'); }),
      resolveRuntimeShaInfoFn: jest.fn(() => ({ runtimeSha: null, present: false })),
      redisClientFn: jest.fn(() => ({ ping: jest.fn(async () => { throw new Error('down'); }) }))
    });
    const result = await buildDglaundryRuntimeAttestationUseCase(deps)();

    expect(result.attestation).toMatchObject({
      configurationRevision: null,
      applicationShas: { 'dgfy-api': null },
      oidcJwksReady: false,
      parPkceReady: false,
      replayStatePersistenceReady: false
    });
    expect(result.details).toMatchObject({
      oidcJwksReady: expect.any(String),
      configurationRevision: expect.any(String)
    });
  });

  it('signs canonical JSON documents with the configured Ed25519 event key', async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    process.env.DGFY_DGLAUNDRY_EVENT_SIGNING_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID = 'attestation-test-key';
    const { signDgfyJsonDocument, canonicalJson } = await import('../src/modules/dgfyLaundryOrders/services/dglaundryEventSignature.js');
    const payload = { z: 1, nested: { b: true, a: 2 }, a: 'first' };
    const signed = signDgfyJsonDocument(payload);

    expect(signed.serialized).toBe(canonicalJson(payload));
    expect(crypto.verify(null, Buffer.from(signed.serialized), publicKey, Buffer.from(signed.signature, 'base64'))).toBe(true);
    delete process.env.DGFY_DGLAUNDRY_EVENT_SIGNING_PRIVATE_KEY;
    delete process.env.DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID;
  });

  it('reports the configured DGLaundry origin rather than a hardcoded host (#2513)', async () => {
    process.env.DGLAUNDRY_PARTNER_BASE_URL = 'https://dglaundry.stage.dgfy.ph';
    const result = await buildDglaundryRuntimeAttestationUseCase(dependencies())();
    expect(result.attestation.origins.laundry).toBe('https://dglaundry.stage.dgfy.ph');
    expect(result.details.laundryOrigin).toBeUndefined();
  });

  it('reports no DGLaundry origin, with a reason, when none is configured (#2513)', async () => {
    delete process.env.DGLAUNDRY_PARTNER_BASE_URL;
    const result = await buildDglaundryRuntimeAttestationUseCase(dependencies())();
    expect(result.attestation.origins.laundry).toBeNull();
    expect(result.details.laundryOrigin).toMatch(/DGLAUNDRY_PARTNER_BASE_URL/);
  });
});
