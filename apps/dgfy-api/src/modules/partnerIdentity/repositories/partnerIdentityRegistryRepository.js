import { OidcClient, PartnerApp } from '../../../models/index.js';

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};

const normalizeClient = (row) => row ? {
  ...row.get({ plain: true }),
  redirect_uris: parseJsonArray(row.redirect_uris),
  post_logout_redirect_uris: parseJsonArray(row.post_logout_redirect_uris),
  allowed_scopes: parseJsonArray(row.allowed_scopes)
} : null;

export const partnerIdentityRegistryRepository = {
  async findClientByClientId(clientId) {
    const row = await OidcClient.findOne({ where: { client_id: clientId } });
    const client = normalizeClient(row);
    if (!client) return null;
    client.app = await this.findAppById(client.app_id);
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
  async listClientsForApp(appId) {
    const rows = await OidcClient.findAll({ where: { app_id: appId }, order: [['client_id', 'ASC']] });
    return rows.map(normalizeClient);
  },
  async listActiveClients() {
    const rows = await OidcClient.findAll({ where: { status: 'active' }, order: [['client_id', 'ASC']] });
    return Promise.all(rows.map(async (row) => {
      const client = normalizeClient(row);
      client.app = await this.findAppById(client.app_id);
      return client;
    }));
  }
};
