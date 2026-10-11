import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { buildPartnerLifecycleUseCases } from '../src/modules/partnerIdentity/usecases/partnerLifecycleUseCases.js';

describe('partner client destinations lifecycle', () => {
  let client;
  let app;
  let registry;
  let repository;
  let useCases;

  beforeEach(() => {
    app = { id: 'app-a', status: 'approved' };
    client = {
      id: 'client-row-a', app_id: app.id, client_id: 'client-a', client_type: 'browser',
      environment: 'production', status: 'active', allowed_origins: ['https://one.example.test'],
      redirect_uris: ['https://one.example.test/callback'], post_logout_redirect_uris: []
    };
    registry = {
      findAppById: async () => app,
      findClientByClientId: async () => client,
      listAllClients: async () => []
    };
    repository = {
      createClient: jest.fn(async (record) => record),
      updateClientDestinations: jest.fn(async ({ updates }) => ({ ...client, ...updates }))
    };
    useCases = buildPartnerLifecycleUseCases({ repository, registryRepository: registry });
  });

  test('registration validates and persists exact browser destinations', async () => {
    const created = await useCases.registerClient(app.id, {
      client_id: 'browser-a', client_type: 'browser', auth_method: 'client_secret_basic',
      audience: 'https://api.example.test', allowed_scopes: ['openid'],
      allowed_origins: ['https://Partner.example.test'],
      redirect_uris: ['https://Partner.example.test/callback'],
      post_logout_redirect_uris: ['https://Partner.example.test/logout']
    }, { id: 'admin-1' }, { method: 'POST' });
    expect(created.client).toMatchObject({
      allowed_origins: ['https://Partner.example.test'],
      redirect_uris: ['https://Partner.example.test/callback'],
      post_logout_redirect_uris: ['https://Partner.example.test/logout']
    });
  });

  test('machine clients cannot receive browser destinations', async () => {
    await expect(useCases.registerClient(app.id, {
      client_id: 'machine-a', client_type: 'machine', auth_method: 'private_key_jwt',
      audience: 'https://api.example.test', allowed_scopes: ['orders:read'],
      allowed_origins: ['https://partner.example.test'], key_id: 'key-a', public_key_pem: 'bad'
    }, {}, {})).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_DESTINATION' });
    expect(repository.createClient).not.toHaveBeenCalled();
  });

  test('cross-app canonical origin collisions fail with 409', async () => {
    registry.listAllClients = async () => [{
      app_id: 'app-b', environment: 'production', allowed_origins: ['https://partner.example.test:443'],
      redirect_uris: [], post_logout_redirect_uris: []
    }];
    await expect(useCases.registerClient(app.id, {
      client_id: 'browser-a', client_type: 'browser', auth_method: 'client_secret_basic',
      audience: 'https://api.example.test', allowed_scopes: ['openid'],
      allowed_origins: ['https://partner.example.test'], redirect_uris: ['https://partner.example.test/callback']
    }, {}, {})).rejects.toMatchObject({ statusCode: 409, code: 'DESTINATION_CONFLICT' });
  });

  test('destination changes audit exact before and after lists and reject revoked clients', async () => {
    await useCases.updateClientDestinations(client.client_id, {
      allowed_origins: ['https://two.example.test'],
      redirect_uris: ['https://two.example.test/callback'],
      post_logout_redirect_uris: [], reason: 'Partner domain moved'
    }, { id: 'admin-1', username: 'operator' }, { method: 'PUT', originalUrl: '/destinations' });
    expect(repository.updateClientDestinations).toHaveBeenCalledWith(expect.objectContaining({
      id: client.id,
      expected: 'active',
      audit: expect.objectContaining({ action: 'partner.client.destinations_updated', reason: 'Partner domain moved' }),
      updates: { allowed_origins: ['https://two.example.test'], redirect_uris: ['https://two.example.test/callback'], post_logout_redirect_uris: [] }
    }));

    repository.updateClientDestinations.mockClear();
    client.status = 'revoked';
    await expect(useCases.updateClientDestinations(client.client_id, {
      allowed_origins: [], redirect_uris: [], post_logout_redirect_uris: []
    }, {}, {})).rejects.toMatchObject({ statusCode: 409, code: 'LIFECYCLE_CONFLICT' });
    expect(repository.updateClientDestinations).not.toHaveBeenCalled();
  });
});
