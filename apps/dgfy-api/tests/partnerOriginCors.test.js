import request from 'supertest';
import { afterAll, describe, expect, test, jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.SKIP_SERVER_START = 'true';
process.env.CORS_ORIGIN = 'https://dgfy.ph';

let clients = [];
let registryError = false;
jest.unstable_mockModule('../src/modules/partnerIdentity/repositories/partnerIdentityRegistryRepository.js', () => ({
  partnerIdentityRegistryRepository: {
    listActiveBrowserClients: async () => { if (registryError) throw new Error('registry unavailable'); return clients; },
    findClientByClientId: async () => null,
    findAppBySlug: async () => null,
    listClientsForApp: async () => [],
    listActiveClients: async () => []
  }
}));
const { default: app } = await import('../src/server.js');

const registered = (overrides = {}) => ({
  client_id: 'partner-browser', client_type: 'browser', status: 'active',
  environment: 'production', allowed_origins: ['https://partner.example.test'],
  app: { status: 'approved' }, ...overrides
});

describe('partner registry CORS', () => {
  afterAll(() => { clients = []; });

  test.each(['/oidc/.well-known/openid-configuration', '/oidc/jwks'])('allows registered origins for public metadata only: %s', async (path) => {
    clients = [registered()];
    const response = await request(app).get(path).set('Origin', 'https://partner.example.test');
    expect(response.headers['access-control-allow-origin']).toBe('https://partner.example.test');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  test('allows only GET, HEAD, and OPTIONS for metadata', async () => {
    clients = [registered()];
    const response = await request(app).options('/oidc/jwks')
      .set('Origin', 'https://partner.example.test')
      .set('Access-Control-Request-Method', 'GET');
    expect(response.headers['access-control-allow-origin']).toBe('https://partner.example.test');
    expect(response.headers['access-control-allow-methods']).toContain('GET');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  test.each([
    ['unregistered', []],
    ['pending client', [registered({ status: 'pending' })]],
    ['suspended client', [registered({ status: 'suspended' })]],
    ['revoked client', [registered({ status: 'revoked' })]],
    ['suspended app', [registered({ app: { status: 'suspended' } })]],
    ['lookalike', [registered({ allowed_origins: ['https://partner.example.test.evil.test'] })]]
  ])('denies %s origin registrations', async (_label, rows) => {
    clients = rows;
    const response = await request(app).get('/oidc/jwks').set('Origin', 'https://partner.example.test');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  test.each(['/api/v1/auth/me', '/oidc/token', '/oidc/par', '/oidc/authorize', '/oidc/logout'])('never grants partner CORS on %s', async (path) => {
    clients = [registered()];
    const response = await request(app).get(path).set('Origin', 'https://partner.example.test');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('fails closed when the registry lookup fails and leaves the env-backed DGLaundry client out', async () => {
    clients = [registered({ client_id: 'oidc-dglaundry-env-client-source', allowed_origins: undefined })];
    const response = await request(app).get('/oidc/jwks').set('Origin', 'https://dglaundry.example.test');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    registryError = true;
    clients = [];
    const failedLookup = await request(app).get('/oidc/jwks').set('Origin', 'https://partner.example.test');
    expect(failedLookup.headers['access-control-allow-origin']).toBeUndefined();
    registryError = false;
  });
});
