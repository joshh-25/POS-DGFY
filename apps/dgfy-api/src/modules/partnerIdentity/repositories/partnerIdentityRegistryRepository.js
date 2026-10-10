import { OidcClient, PartnerApp, PartnerClientCredential, PartnerAttachment } from '../../../models/index.js';

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};

const normalizeClient = (row) => row ? {
  ...row.get({ plain: true }),
  redirect_uris: parseJsonArray(row.redirect_uris),
  post_logout_redirect_uris: parseJsonArray(row.post_logout_redirect_uris),
  allowed_origins: parseJsonArray(row.allowed_origins),
  allowed_scopes: parseJsonArray(row.allowed_scopes)
} : null;

export const partnerIdentityRegistryRepository = {
  async findClientByClientId(clientId) {
    const row = await OidcClient.findOne({ where: { client_id: clientId } });
    const client = normalizeClient(row);
    if (!client) return null;
    client.app = await this.findAppById(client.app_id);
    const now = new Date();
    const allVersions = await PartnerClientCredential.findAll({ where: { client_id: client.client_id } });
    client.has_credential_versions = allVersions.length > 0;
    client.credentials_all_versions = allVersions.map((credential) => credential.get({ plain: true }));
    client.credentials = allVersions
      .map((credential) => credential.get({ plain: true }))
      .filter((credential) => credential.status === 'active'
        || (credential.status === 'overlap' && credential.overlap_expires_at && new Date(credential.overlap_expires_at) > now));
    return client;
  },
  async findAppById(id) {
    const row = await PartnerApp.findByPk(id);
    return row?.get({ plain: true }) || null;
  },
  async findAppBySlug(appSlug) {
    const row = await PartnerApp.findOne({ where: { app_slug: appSlug } });
    return row?.get({ plain: true }) || null;
  },
  async listApps() {
    return (await PartnerApp.findAll({ order: [['created_at', 'DESC']] })).map((row) => row.get({ plain: true }));
  },
  async listClientsForApp(appId) {
    const rows = await OidcClient.findAll({ where: { app_id: appId }, order: [['client_id', 'ASC']] });
    return rows.map(normalizeClient);
  },
  async listAllClients() {
    return (await OidcClient.findAll({ order: [['client_id', 'ASC']] })).map(normalizeClient);
  },
  async listActiveBrowserClients() {
    const rows = await OidcClient.findAll({ where: { status: 'active', client_type: 'browser' }, order: [['client_id', 'ASC']] });
    return Promise.all(rows.map(async (row) => {
      const client = normalizeClient(row);
      client.app = await this.findAppById(client.app_id);
      return client;
    }));
  },
  async listActiveClients() {
    const rows = await OidcClient.findAll({ where: { status: 'active' }, order: [['client_id', 'ASC']] });
    return Promise.all(rows.map(async (row) => {
      const client = normalizeClient(row);
      client.app = await this.findAppById(client.app_id);
      return client;
    }));
  },
  async findAttachmentById(id, options = {}) {
    return (await PartnerAttachment.findByPk(id, options))?.get({ plain: true }) || null;
  },
  async listAttachmentsForTenant(tenantId) {
    return (await PartnerAttachment.findAll({ where: { tenant_id: String(tenantId) }, order: [['created_at', 'DESC']] })).map((row) => row.get({ plain: true }));
  },
  async findActiveAttachments(clientId, tenantId = null) {
    const where = { client_id: clientId, status: 'active' };
    if (tenantId != null) where.tenant_id = String(tenantId);
    return (await PartnerAttachment.findAll({ where })).map((row) => row.get({ plain: true }));
  },
  async findAttachmentsForClient(clientId) {
    return (await PartnerAttachment.findAll({ where: { client_id: clientId } })).map((row) => row.get({ plain: true }));
  },
  async findAttachmentsForClientTenant(clientId, tenantId) {
    return (await PartnerAttachment.findAll({ where: { client_id: clientId, tenant_id: String(tenantId) } })).map((row) => row.get({ plain: true }));
  },
  async listCredentialVersions(clientId) {
    const rows = await PartnerClientCredential.findAll({ where: { client_id: clientId }, order: [['version', 'DESC']] });
    return rows.map((row) => row.get({ plain: true }));
  }
};
