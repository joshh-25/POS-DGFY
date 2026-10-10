import crypto from 'node:crypto';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { buildPartnerLifecycleUseCases } from '../src/modules/partnerIdentity/usecases/partnerLifecycleUseCases.js';
import { authorizePartnerAccess } from '../src/modules/partnerIdentity/usecases/partnerIdentityUseCases.js';

const admin = { id: 'admin-1', username: 'operator' };
const request = { method: 'POST', originalUrl: '/api/v1/admin/partner-integrations/apps' };

describe('partner credential and attachment use cases', () => {
  let app;
  let client;
  let attachment;
  let registryRepository;
  let repository;
  let useCases;
  let issuedCredential;

  beforeEach(() => {
    app = { id: 'app-1', app_slug: 'partner-app', display_name: 'Partner', status: 'approved' };
    client = {
      id: 'oidc-1', app_id: app.id, client_id: 'partner-machine', client_type: 'machine',
      status: 'active', auth_method: 'private_key_jwt', allowed_scopes: ['catalog:read', 'orders:write'],
      app, has_credential_versions: true, credentials: [], credentials_all_versions: []
    };
    attachment = {
      id: 'attachment-1', app_id: app.id, client_id: client.client_id, tenant_id: 'tenant-1',
      location_ids: ['1'], scopes: ['catalog:read'], location_authority: { 1: 'dgfy' },
      entitlements: {}, status: 'active'
    };
    registryRepository = {
      findAppById: async () => app,
      findClientByClientId: async () => client,
      listAllClients: async () => [],
      findAttachmentById: async () => attachment,
      findAttachmentsForClientTenant: async () => [attachment],
      findAttachmentsForClient: async () => [attachment],
      findActiveAttachments: async () => [attachment]
    };
    repository = {
      createApp: async (data) => data,
      createClient: async (data, credential) => { issuedCredential = credential; return data; },
      transitionApp: async ({ id, updates }) => ({ id, ...updates }),
      transitionClient: async ({ id, updates }) => ({ id, ...updates }),
      rotateCredential: async ({ newCredential, overlapExpiresAt }) => ({ ...newCredential, overlap_expires_at: overlapExpiresAt }),
      findActiveTenantLocations: async (ids) => ids.map((id) => ({ location_id: Number(id) })),
      createAttachment: async (data, audit, tenantAudit) => { await tenantAudit(audit, { attachment: data }); return data; },
      writeTenantAudit: async () => {},
      updateAttachment: async ({ updates }) => ({ ...attachment, ...updates }),
      transitionAttachment: jest.fn(async ({ updates }) => ({ ...attachment, ...updates }))
    };
    useCases = buildPartnerLifecycleUseCases({ repository, registryRepository });
  });

  test('issues a 32-byte browser secret once and persists only a scrypt hash', async () => {
    app.status = 'approved';
    const browserClient = await useCases.registerClient(app.id, {
      client_id: 'browser-deployment', client_type: 'browser', auth_method: 'client_secret_basic',
      audience: 'https://api.example.test', allowed_scopes: ['openid'], allowed_origins: ['https://partner.example.test'], redirect_uris: ['https://partner.example.test/callback']
    }, admin, request);

    expect(Buffer.from(browserClient.issued_secret, 'base64url')).toHaveLength(32);
    expect(issuedCredential.secret_hash).toMatch(/^scrypt\$/);
    expect(issuedCredential.secret_hash).not.toContain(browserClient.issued_secret);
    expect(browserClient.client.secret_hash).toBe(issuedCredential.secret_hash);
  });

  test('rejects private keys during machine client registration', async () => {
    await expect(useCases.registerClient(app.id, {
      client_id: 'machine-2', client_type: 'machine', auth_method: 'private_key_jwt',
      audience: 'https://api.example.test', allowed_scopes: ['catalog:read'], key_id: 'key-1',
      public_key_pem: '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----'
    }, admin, request)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PUBLIC_KEY' });
  });

  test('rejects entitlement values outside the closed sync-round set', async () => {
    await expect(useCases.setAttachmentEntitlements(attachment.id, { sync_rounds: 20 }, admin, request))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ENTITLEMENTS' });
    expect(repository.transitionAttachment).not.toHaveBeenCalled();
  });

  test('authorizes only a client attachment with token scope and location membership', async () => {
    const allowed = await authorizePartnerAccess({
      registryRepository, client, token: { scope: 'catalog:read' }, tenantSelector: 'tenant-1', locationId: '1', scope: 'catalog:read'
    });
    expect(allowed).toMatchObject({ allowed: true, attachment, locationIds: ['1'], scopes: ['catalog:read'] });
    const scopeDenied = await authorizePartnerAccess({
      registryRepository, client, token: { scope: 'catalog:read' }, tenantSelector: 'tenant-1', locationId: '1', scope: 'orders:write'
    });
    expect(scopeDenied).toMatchObject({ allowed: false, reason: 'SCOPE_DENIED' });
    const locationDenied = await authorizePartnerAccess({
      registryRepository, client, token: { scope: 'catalog:read' }, tenantSelector: 'tenant-1', locationId: '2'
    });
    expect(locationDenied).toMatchObject({ allowed: false, reason: 'LOCATION_DENIED' });
  });

  test('reconcile mode quarantines a disconnected attachment without modifying it', async () => {
    attachment.status = 'disconnected';
    const result = await authorizePartnerAccess({
      registryRepository, client, token: { scope: 'catalog:read' }, tenantSelector: 'tenant-1', mode: 'reconcile'
    });
    expect(result).toMatchObject({ allowed: false, quarantine: true, reason: 'ATTACHMENT_NOT_ACTIVE' });
    expect(attachment.status).toBe('disconnected');
  });

  test('reconcile mode finds one disconnected attachment without a tenant selector', async () => {
    attachment.status = 'disconnected';
    const result = await authorizePartnerAccess({
      registryRepository, client, token: { scope: 'catalog:read' }, mode: 'reconcile'
    });
    expect(result).toMatchObject({ allowed: false, quarantine: true, reason: 'ATTACHMENT_NOT_ACTIVE' });
  });

  test('new public key ids cannot collide during credential overlap', async () => {
    client.credentials = [{ id: 'cred-1', kind: 'public_key', key_id: 'same-kid', status: 'active' }];
    client.credentials_all_versions = client.credentials;
    const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
    await expect(useCases.rotateCredential(client.client_id, { key_id: 'same-kid', public_key_pem: publicKeyPem }, admin, request))
      .rejects.toMatchObject({ statusCode: 409, code: 'DUPLICATE_KEY_ID' });
  });
});
