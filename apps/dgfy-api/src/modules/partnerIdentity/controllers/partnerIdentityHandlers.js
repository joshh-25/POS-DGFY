import { partnerIdentityRegistryRepository } from '../repositories/partnerIdentityRegistryRepository.js';
import { partnerLifecycleRepository } from '../repositories/partnerLifecycleRepository.js';
import { buildPartnerLifecycleUseCases } from '../usecases/partnerLifecycleUseCases.js';

const lifecycle = buildPartnerLifecycleUseCases({ repository: partnerLifecycleRepository, registryRepository: partnerIdentityRegistryRepository });
const safeClient = (client) => {
  if (!client) return client;
  const safe = { ...client };
  for (const key of ['secret_hash', 'public_key_pem', 'credentials', 'credentials_all_versions']) delete safe[key];
  return safe;
};
const run = (handler) => async (req, res, next) => {
  try { return await handler(req, res); } catch (error) { return next(error); }
};
const send = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const listPartnerApps = run(async (_req, res) => send(res, await partnerIdentityRegistryRepository.listApps()));
export const createPartnerApp = run(async (req, res) => send(res, await lifecycle.registerApp(req.body || {}, req.admin, req), 201));
export const transitionPartnerApp = run(async (req, res) => send(res, await lifecycle.transitionApp(req.params.id, req.params.action, req.admin, req, req.body?.reason)));
export const listPartnerClients = run(async (req, res) => {
  const app = await partnerIdentityRegistryRepository.findAppById(req.params.id);
  if (!app) return res.status(404).json({ success: false, message: 'Partner app was not found.', error_code: 'APP_NOT_FOUND' });
  const clients = await partnerIdentityRegistryRepository.listClientsForApp(app.id);
  return send(res, clients.map(safeClient));
});
export const createPartnerClient = run(async (req, res) => {
  const result = await lifecycle.registerClient(req.params.id, req.body || {}, req.admin, req);
  return send(res, { client: safeClient(result.client), issued_secret: result.issued_secret }, 201);
});
export const transitionPartnerClient = run(async (req, res) => send(res, safeClient(await lifecycle.transitionClient(req.params.clientId, req.params.action, req.admin, req, req.body?.reason))));
export const listPartnerCredentials = run(async (req, res) => {
  const client = await partnerIdentityRegistryRepository.findClientByClientId(req.params.clientId);
  if (!client) return res.status(404).json({ success: false, message: 'Partner client was not found.', error_code: 'CLIENT_NOT_FOUND' });
  const rows = await partnerIdentityRegistryRepository.listCredentialVersions(client.client_id);
  return send(res, rows.map((row) => lifecycle.toCredentialMetadata(row)));
});
export const rotatePartnerCredential = run(async (req, res) => send(res, await lifecycle.rotateCredential(req.params.clientId, req.body || {}, req.admin, req), 201));
export const revokePartnerCredential = run(async (req, res) => send(res, await lifecycle.revokeCredential(req.params.clientId, req.params.versionId, req.admin, req, req.body?.reason)));
export const setPartnerAttachmentEntitlements = run(async (req, res) => send(res, await lifecycle.setAttachmentEntitlements(req.params.id, req.body?.entitlements, req.admin, req)));

const requireMerchantOwner = (req, res) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  if (req.user?.is_master_admin === true || role === 'admin') return true;
  res.status(403).json({ success: false, message: 'Tenant owner or admin authority is required.', error_code: 'TENANT_OWNER_REQUIRED' });
  return false;
};

export const listMerchantAttachments = run(async (req, res) => {
  if (!requireMerchantOwner(req, res)) return;
  return send(res, await partnerIdentityRegistryRepository.listAttachmentsForTenant(req.tenant.id));
});
export const consentPartnerAttachment = run(async (req, res) => {
  if (!requireMerchantOwner(req, res)) return;
  const body = req.body || {};
  if (Object.hasOwn(body, 'entitlements') || Object.hasOwn(body, 'location_authority') || Object.hasOwn(body, 'app_id')) return res.status(400).json({ success: false, message: 'Consent cannot set entitlements, engine authority, or App identity.', error_code: 'INVALID_ATTACHMENT' });
  const attachment = await lifecycle.consentAttachment({ clientId: body.client_id, tenantId: req.tenant.id, locationIds: body.location_ids, scopes: body.scopes, user: req.user, request: req, reason: body.reason });
  return send(res, attachment, 201);
});
export const updateMerchantAttachment = run(async (req, res) => {
  if (!requireMerchantOwner(req, res)) return;
  const action = req.params.action;
  const body = req.body || {};
  if (Object.hasOwn(body, 'entitlements') || Object.hasOwn(body, 'location_authority') || Object.hasOwn(body, 'app_id')) return res.status(400).json({ success: false, message: 'Merchant attachment changes cannot set entitlements, engine authority, or App identity.', error_code: 'INVALID_ATTACHMENT' });
  return send(res, await lifecycle.updateMerchantAttachment({ id: req.params.id, tenantId: req.tenant.id, action, scopes: body.scopes, user: req.user, request: req, reason: body.reason }));
});
