import crypto from 'crypto';
import { generatePartnerClientSecret, hashPartnerClientSecret } from '../domain/credentialSecrets.js';

const fail = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });
const allowedEntitlementKeys = new Set(['sync_rounds']);
const validSyncRounds = new Set([2, 5, 10, 'premium_realtime']);
const cleanList = (value) => [...new Set((Array.isArray(value) ? value : []).map((item) => String(item).trim()).filter(Boolean))];
const auditContext = (actor, request, reason) => ({
  actorId: actor?.id || null,
  actorUsername: actor?.username || null,
  reason: String(reason || '').slice(0, 500) || null,
  request: { requestId: request?.id || request?.headers?.['x-request-id'] || null, method: request?.method, path: request?.originalUrl?.split('?')[0] }
});
const credentialRecord = ({ clientId, version, authMethod, secretHash, publicKeyPem, keyId, adminId }) => ({
  id: crypto.randomUUID(), client_id: clientId, version,
  kind: authMethod === 'client_secret_basic' ? 'secret_hash' : 'public_key',
  secret_hash: secretHash || null, public_key_pem: publicKeyPem || null, key_id: keyId || null,
  status: 'active', activated_at: new Date(), created_by_admin_id: adminId || null
});

export const buildPartnerLifecycleUseCases = ({ repository, registryRepository }) => ({
  async registerApp(input, actor, request) {
    const appSlug = String(input.app_slug || '').trim().toLowerCase();
    const displayName = String(input.display_name || '').trim();
    if (!/^[a-z0-9][a-z0-9-]{1,94}[a-z0-9]$/.test(appSlug) || !displayName) throw fail(400, 'INVALID_APP', 'A valid app_slug and display_name are required.');
    return repository.createApp({ id: crypto.randomUUID(), app_slug: appSlug, display_name: displayName, status: 'pending' }, auditContext(actor, request, input.reason));
  },
  async transitionApp(appId, action, actor, request, reason) {
    const app = await registryRepository.findAppById(appId);
    if (!app) throw fail(404, 'APP_NOT_FOUND', 'Partner app was not found.');
    const transition = {
      approve: ['pending', 'approved'],
      suspend: ['approved', 'suspended'],
      unsuspend: ['suspended', 'approved'],
      retire: [['approved', 'suspended'], 'retired']
    }[action];
    if (!transition || !(Array.isArray(transition[0]) ? transition[0].includes(app.status) : app.status === transition[0])) throw fail(409, 'LIFECYCLE_CONFLICT', 'This app transition is not allowed from its current state.');
    const expected = app.status;
    const next = transition[1];
    return repository.transitionApp({ id: appId, expected, updates: { status: next }, audit: { ...auditContext(actor, request, reason), action: `partner.app.${action}`, after: { app_id: appId, status: next } } });
  },
  async registerClient(appId, input, actor, request) {
    const app = await registryRepository.findAppById(appId);
    if (!app || app.status !== 'approved') throw fail(409, 'APP_NOT_APPROVED', 'Only an approved app can register a client.');
    const clientId = String(input.client_id || '').trim();
    const clientType = String(input.client_type || '').trim();
    const authMethod = String(input.auth_method || '').trim();
    const audience = String(input.audience || '').trim();
    const scopes = cleanList(input.allowed_scopes);
    if (!clientId || clientId.length > 191 || !['browser', 'machine', 'service'].includes(clientType) || !['client_secret_basic', 'private_key_jwt'].includes(authMethod) || !audience || !scopes.length) throw fail(400, 'INVALID_CLIENT', 'Client id, type, auth method, audience, and allowed scopes are required.');
    if ((clientType === 'browser') !== (authMethod === 'client_secret_basic')) throw fail(400, 'INVALID_CLIENT', 'Browser clients use client_secret_basic; machine and service clients use private_key_jwt.');
    if (input.entitlements !== undefined) throw fail(400, 'INVALID_CLIENT', 'Client registration cannot set attachment entitlements.');
    if (authMethod === 'client_secret_basic' && typeof input.public_key_pem === 'string') throw fail(400, 'INVALID_CLIENT', 'Browser clients cannot register a public key.');
    const registryClient = {
      id: crypto.randomUUID(), app_id: app.id, client_id: clientId, client_type: clientType,
      environment: String(input.environment || 'production').trim(), status: 'pending', auth_method: authMethod,
      secret_hash: null, public_key_pem: null, key_id: null, audience,
      redirect_uris: cleanList(input.redirect_uris), post_logout_redirect_uris: cleanList(input.post_logout_redirect_uris),
      allowed_scopes: scopes, context_adapter: null, secret_rotated_at: null
    };
    if (authMethod === 'client_secret_basic') {
      const secret = generatePartnerClientSecret();
      const secretHash = hashPartnerClientSecret(secret);
      registryClient.secret_hash = secretHash;
      const credential = credentialRecord({ clientId, version: 1, authMethod, secretHash, adminId: actor?.id });
      const client = await repository.createClient(registryClient, credential, auditContext(actor, request, input.reason));
      return { client, issued_secret: secret };
    }
    const publicKeyPem = String(input.public_key_pem || '').trim();
    const keyId = String(input.key_id || '').trim();
    if (!publicKeyPem || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(publicKeyPem) || !keyId) throw fail(400, 'INVALID_PUBLIC_KEY', 'A public PEM key and key_id are required; private keys are never accepted.');
    try {
      const parsed = crypto.createPublicKey(publicKeyPem);
      if (parsed.asymmetricKeyType !== 'rsa') throw new Error('RSA required');
    } catch { throw fail(400, 'INVALID_PUBLIC_KEY', 'A valid RSA public PEM key is required.'); }
    registryClient.public_key_pem = publicKeyPem;
    registryClient.key_id = keyId;
    const credential = credentialRecord({ clientId, version: 1, authMethod, publicKeyPem, keyId, adminId: actor?.id });
    const client = await repository.createClient(registryClient, credential, auditContext(actor, request, input.reason));
    return { client, issued_secret: null };
  },
  async transitionClient(clientId, action, actor, request, reason) {
    const client = await registryRepository.findClientByClientId(clientId);
    if (!client) throw fail(404, 'CLIENT_NOT_FOUND', 'Partner client was not found.');
    const transitions = {
      activate: ['pending', 'active'], suspend: ['active', 'suspended'],
      unsuspend: ['suspended', 'active'], revoke: [['active', 'suspended'], 'revoked']
    };
    const transition = transitions[action];
    if (!transition || !(Array.isArray(transition[0]) ? transition[0].includes(client.status) : client.status === transition[0])) throw fail(409, 'LIFECYCLE_CONFLICT', 'This client transition is not allowed from its current state.');
    return repository.transitionClient({ id: client.id, expected: client.status, updates: { status: transition[1] }, audit: { ...auditContext(actor, request, reason), action: `partner.client.${action}`, after: { app_id: client.app_id, client_id: client.client_id, status: transition[1] } } });
  },
  async rotateCredential(clientId, input, actor, request) {
    const client = await registryRepository.findClientByClientId(clientId);
    if (!client || client.status !== 'active' || client.app?.status !== 'approved') throw fail(409, 'CLIENT_NOT_ACTIVE', 'Only an active client under an approved app can rotate credentials.');
    const overlap = Number(input.overlap_seconds ?? process.env.PARTNER_CREDENTIAL_ROTATION_OVERLAP_SECONDS ?? 86400);
    if (!Number.isInteger(overlap) || overlap < 0 || overlap > 604800) throw fail(400, 'INVALID_OVERLAP', 'Credential overlap must be between 0 and 604800 seconds.');
    const valid = client.credentials || [];
    const existingVersion = Math.max(0, ...(client.credentials_all_versions || []).map((item) => Number(item.version) || 0), ...valid.map((item) => Number(item.version) || 0));
    const version = existingVersion ? existingVersion + 1 : ((client.secret_hash || client.public_key_pem) ? 2 : 1);
    let secret = null;
    let secretHash = null;
    let publicKeyPem = null;
    let keyId = null;
    if (client.auth_method === 'client_secret_basic') {
      secret = generatePartnerClientSecret();
      secretHash = hashPartnerClientSecret(secret);
    } else {
      publicKeyPem = String(input.public_key_pem || '').trim();
      keyId = String(input.key_id || '').trim();
      if (!publicKeyPem || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(publicKeyPem) || !keyId) throw fail(400, 'INVALID_PUBLIC_KEY', 'A public PEM key and key_id are required; private keys are never accepted.');
      if (valid.some((item) => item.key_id === keyId)) throw fail(409, 'DUPLICATE_KEY_ID', 'A credential key_id must be unique across overlapping versions.');
      try { if (crypto.createPublicKey(publicKeyPem).asymmetricKeyType !== 'rsa') throw new Error('RSA required'); } catch { throw fail(400, 'INVALID_PUBLIC_KEY', 'A valid RSA public PEM key is required.'); }
    }
    const activatedAt = new Date();
    const overlapExpiresAt = new Date(activatedAt.getTime() + overlap * 1000);
    const credential = credentialRecord({ clientId, version, authMethod: client.auth_method, secretHash, publicKeyPem, keyId, adminId: actor?.id });
    const created = await repository.rotateCredential({ client, newCredential: credential, overlapExpiresAt, audit: auditContext(actor, request, input.reason) });
    return { credential: this.toCredentialMetadata(created), issued_secret: secret };
  },
  async revokeCredential(clientId, versionId, actor, request, reason) {
    const client = await registryRepository.findClientByClientId(clientId);
    if (!client) throw fail(404, 'CLIENT_NOT_FOUND', 'Partner client was not found.');
    const credential = (client.credentials || []).find((item) => item.id === versionId);
    if (!credential) throw fail(404, 'CREDENTIAL_NOT_FOUND', 'An active credential version was not found.');
    const revoked = await repository.revokeCredential({ client, credential, audit: auditContext(actor, request, reason) });
    return this.toCredentialMetadata(revoked);
  },
  toCredentialMetadata(credential) {
    return { id: credential.id, client_id: credential.client_id, version: credential.version, kind: credential.kind, status: credential.status, key_id: credential.key_id || null, activated_at: credential.activated_at, overlap_expires_at: credential.overlap_expires_at, revoked_at: credential.revoked_at, created_at: credential.created_at };
  },
  async setAttachmentEntitlements(attachmentId, entitlements, actor, request) {
    if (!entitlements || typeof entitlements !== 'object' || Array.isArray(entitlements) || Object.keys(entitlements).some((key) => !allowedEntitlementKeys.has(key))) throw fail(400, 'INVALID_ENTITLEMENTS', 'Only sync_rounds is configurable.');
    if (entitlements.sync_rounds !== undefined && !validSyncRounds.has(entitlements.sync_rounds)) throw fail(400, 'INVALID_ENTITLEMENTS', 'sync_rounds must be 2, 5, 10, or premium_realtime.');
    const attachment = await registryRepository.findAttachmentById(attachmentId);
    if (!attachment) throw fail(404, 'ATTACHMENT_NOT_FOUND', 'Partner attachment was not found.');
    const before = { attachment_id: attachment.id, entitlements: attachment.entitlements };
    const after = { attachment_id: attachment.id, entitlements };
    return repository.transitionAttachment({ id: attachment.id, expected: attachment.status, updates: { entitlements }, audit: { ...auditContext(actor, request), action: 'partner.attachment.entitlements_updated', before, after } });
  },
  async consentAttachment({ clientId, tenantId, locationIds, scopes, user, request, reason }) {
    const client = await registryRepository.findClientByClientId(clientId);
    if (!client || client.status !== 'active' || client.app?.status !== 'approved') throw fail(409, 'CLIENT_NOT_ACTIVE', 'Only an active client under an approved app can be attached.');
    const normalizedLocations = cleanList(locationIds).map(String);
    const normalizedScopes = cleanList(scopes);
    if (!normalizedLocations.length || !normalizedScopes.length || normalizedScopes.some((scope) => !client.allowed_scopes.includes(scope))) throw fail(400, 'INVALID_ATTACHMENT', 'At least one active location and allowed scope are required.');
    const rows = await repository.findActiveTenantLocations(normalizedLocations);
    const activeLocationIds = rows.map((row) => String(row.location_id));
    if (activeLocationIds.length !== normalizedLocations.length) throw fail(400, 'INVALID_LOCATION', 'One or more selected locations are inactive or unavailable.');
    const authority = {};
    for (const id of activeLocationIds) authority[id] = 'dgfy';
    const attachment = {
      id: crypto.randomUUID(), app_id: client.app_id, client_id: client.client_id, tenant_id: String(tenantId),
      location_ids: activeLocationIds, scopes: normalizedScopes, location_authority: authority,
      entitlements: {}, status: 'active', consented_by_user_id: String(user?.user_id || user?.id || ''), consented_at: new Date()
    };
    if (!attachment.consented_by_user_id) throw fail(401, 'TENANT_AUTH_REQUIRED', 'An authenticated tenant user is required.');
    const tenantAudit = async (_audit, snapshots) => repository.writeTenantAudit({
      userId: user?.user_id || user?.id, username: user?.username, eventType: 'partner.attachment.consented', reason,
      requestId: request?.id || request?.headers?.['x-request-id'] || null,
      changes: { attachment_id: attachment.id, client_id: client.client_id, location_ids: activeLocationIds, scopes: normalizedScopes, after: snapshots.attachment || attachment }
    });
    return repository.createAttachment(attachment, { reason }, tenantAudit);
  },
  async updateMerchantAttachment({ id, tenantId, action, scopes, user, request, reason }) {
    const attachment = await registryRepository.findAttachmentById(id);
    if (!attachment || String(attachment.tenant_id) !== String(tenantId)) throw fail(404, 'ATTACHMENT_NOT_FOUND', 'Partner attachment was not found.');
    let updates;
    let event;
    if (action === 'scopes') {
      const client = await registryRepository.findClientByClientId(attachment.client_id);
      const normalizedScopes = cleanList(scopes);
      if (attachment.status !== 'active' || !normalizedScopes.length || normalizedScopes.some((scope) => !client?.allowed_scopes?.includes(scope))) throw fail(400, 'INVALID_ATTACHMENT_SCOPES', 'Scopes must be non-empty and allowed by the registered client.');
      updates = { scopes: normalizedScopes };
      event = 'partner.attachment.scopes_changed';
    } else {
      const transitions = {
        suspend: ['active', 'suspended'],
        reactivate: ['suspended', 'active'],
        disconnect: [['active', 'suspended'], 'disconnected']
      };
      const transition = transitions[action];
      if (!transition || !(Array.isArray(transition[0]) ? transition[0].includes(attachment.status) : attachment.status === transition[0])) throw fail(409, 'LIFECYCLE_CONFLICT', 'This attachment transition is not allowed from its current state.');
      updates = { status: transition[1], ...(action === 'disconnect' ? { disconnected_at: new Date() } : {}) };
      event = `partner.attachment.${action === 'reactivate' ? 'reactivated' : action === 'disconnect' ? 'disconnected' : 'suspended'}`;
    }
    const tenantAudit = async (audit, snapshots) => repository.writeTenantAudit({
      userId: user?.user_id || user?.id, username: user?.username, eventType: event, reason,
      requestId: request?.id || request?.headers?.['x-request-id'] || null,
      changes: { attachment_id: attachment.id, client_id: attachment.client_id, before: snapshots.before, after: snapshots.after }
    });
    return repository.updateAttachment({ id: attachment.id, tenantId: String(tenantId), expected: attachment.status, updates, audit: null, tenantAudit });
  }
});
