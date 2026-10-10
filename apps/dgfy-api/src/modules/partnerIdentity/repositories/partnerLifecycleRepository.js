import crypto from 'crypto';
import {
  OidcClient, PartnerApp, PartnerAttachment, PartnerClientCredential,
  PlatformAdminAuditLog, sequelize
} from '../../../models/index.js';
import dbStore from '../../../utils/dbStore.js';

const plain = (row) => row?.get({ plain: true }) || null;
const conflict = () => Object.assign(new Error('Lifecycle transition conflicts with the current state.'), { statusCode: 409, code: 'LIFECYCLE_CONFLICT' });
const translateUniqueFailure = (error) => {
  if (error?.name === 'SequelizeUniqueConstraintError') throw Object.assign(new Error('A partner record with those identifiers already exists.'), { statusCode: 409, code: 'PARTNER_CONFLICT' });
  throw error;
};

const safeRequestMetadata = (metadata = {}) => ({
  request_id: metadata.requestId || null,
  method: metadata.method || null,
  path: metadata.path || null
});

export const partnerLifecycleRepository = {
  async transaction(callback) { return sequelize.transaction(callback); },
  async writeAudit(entry, transaction) {
    await PlatformAdminAuditLog.create({
      actor_admin_id: entry.actorId || null,
      actor_username_snapshot: entry.actorUsername || null,
      action: entry.action,
      reason: entry.reason || null,
      before_snapshot: entry.before || null,
      after_snapshot: entry.after || null,
      request_metadata: safeRequestMetadata(entry.request)
    }, { transaction });
  },
  async createApp(app, audit) {
    try { return await sequelize.transaction(async (transaction) => {
      const created = await PartnerApp.create(app, { transaction });
      await this.writeAudit({ ...audit, action: 'partner.app.registered', after: { app_id: created.id, app_slug: created.app_slug, status: created.status } }, transaction);
      return plain(created);
    }); } catch (error) { return translateUniqueFailure(error); }
  },
  async createClient(client, credential, audit) {
    try { return await sequelize.transaction(async (transaction) => {
      const created = await OidcClient.create(client, { transaction });
      if (credential) {
        await PartnerClientCredential.create({ ...credential, client_id: created.client_id }, { transaction });
        await this.writeAudit({ ...audit, action: 'partner.credential.issued', after: { app_id: created.app_id, client_id: created.client_id, credential_version_id: credential.id, credential_version: credential.version, kind: credential.kind } }, transaction);
      }
      await this.writeAudit({ ...audit, action: 'partner.client.registered', after: { app_id: created.app_id, client_id: created.client_id, status: created.status, credential_version_id: credential?.id || null } }, transaction);
      return plain(created);
    }); } catch (error) { return translateUniqueFailure(error); }
  },
  async transition({ model, id, expected, updates, audit }) {
    return sequelize.transaction(async (transaction) => {
      const row = await model.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row || row.status !== expected) throw conflict();
      const before = { id: row.id, status: row.status };
      const after = { ...before, status: updates.status, ...audit.after };
      await this.writeAudit({ ...audit, before, after }, transaction);
      const [count] = await model.update(updates, { where: { id, status: expected }, transaction });
      if (count !== 1) throw conflict();
      return model.findByPk(id, { transaction }).then(plain);
    });
  },
  transitionApp({ id, expected, updates, audit }) { return this.transition({ model: PartnerApp, id, expected, updates, audit }); },
  transitionClient({ id, expected, updates, audit }) { return this.transition({ model: OidcClient, id, expected, updates, audit }); },
  transitionAttachment({ id, expected, updates, audit }) { return this.transition({ model: PartnerAttachment, id, expected, updates, audit }); },
  async rotateCredential({ client, newCredential, overlapExpiresAt, audit }) {
    return sequelize.transaction(async (transaction) => {
      const lockedClient = await OidcClient.findByPk(client.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!lockedClient || lockedClient.status !== 'active') throw conflict();
      let existing = await PartnerClientCredential.findAll({ where: { client_id: client.client_id, status: 'active' }, transaction, lock: transaction.LOCK.UPDATE });
      let legacy = null;
      if (!existing.length && (lockedClient.secret_hash || lockedClient.public_key_pem)) {
        legacy = {
          id: crypto.randomUUID(), client_id: client.client_id, version: newCredential.version - 1,
          kind: lockedClient.auth_method === 'client_secret_basic' ? 'secret_hash' : 'public_key',
          secret_hash: lockedClient.secret_hash, public_key_pem: lockedClient.public_key_pem, key_id: lockedClient.key_id,
          status: 'overlap', activated_at: lockedClient.secret_rotated_at || lockedClient.created_at,
          overlap_expires_at: overlapExpiresAt, created_by_admin_id: null
        };
      }
      if (!existing.length && !legacy) throw conflict();
      await this.writeAudit({ ...audit, action: 'partner.credential.rotated', before: { client_id: client.client_id, credential_version_ids: existing.map((row) => row.id), legacy_columns_migrated: Boolean(legacy) }, after: { client_id: client.client_id, credential_version_id: newCredential.id, overlap_expires_at: overlapExpiresAt } }, transaction);
      if (legacy) await PartnerClientCredential.create(legacy, { transaction });
      if (existing.length) await PartnerClientCredential.update({ status: 'overlap', overlap_expires_at: overlapExpiresAt }, { where: { id: existing.map((row) => row.id) }, transaction });
      const created = await PartnerClientCredential.create({ ...newCredential, client_id: client.client_id, status: 'active' }, { transaction });
      await lockedClient.update({ secret_rotated_at: new Date() }, { transaction });
      return plain(created);
    });
  },
  async revokeCredential({ client, credential, audit }) {
    return sequelize.transaction(async (transaction) => {
      const row = await PartnerClientCredential.findOne({ where: { id: credential.id, client_id: client.client_id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!row || ['revoked', 'retired'].includes(row.status)) throw conflict();
      await this.writeAudit({ ...audit, action: 'partner.credential.revoked', before: { client_id: client.client_id, credential_version_id: row.id, status: row.status }, after: { client_id: client.client_id, credential_version_id: row.id, status: 'revoked' } }, transaction);
      await row.update({ status: 'revoked', revoked_at: new Date(), overlap_expires_at: null }, { transaction });
      return plain(row);
    });
  },
  async createAttachment(attachment, audit, tenantAudit) {
    await tenantAudit(audit, { attachment });
    try { return await sequelize.transaction(async (transaction) => {
      const created = await PartnerAttachment.create(attachment, { transaction });
      return plain(created);
    }); } catch (error) { return translateUniqueFailure(error); }
  },
  async updateAttachment({ id, expected, updates, audit, tenantAudit }) {
    const existing = await PartnerAttachment.findByPk(id);
    if (!existing || existing.status !== expected) throw conflict();
    if (tenantAudit) await tenantAudit(audit, { before: plain(existing), after: { ...plain(existing), ...updates } });
    return sequelize.transaction(async (transaction) => {
      const row = await PartnerAttachment.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row || row.status !== expected) throw conflict();
      if (audit) await this.writeAudit({ ...audit, before: plain(row), after: { ...plain(row), ...updates } }, transaction);
      const [count] = await PartnerAttachment.update(updates, { where: { id, tenant_id: row.tenant_id, status: expected }, transaction });
      if (count !== 1) throw conflict();
      return plain(await PartnerAttachment.findByPk(id, { transaction }));
    });
  },
  async findActiveTenantLocations(locationIds) {
    const TenantLocation = dbStore.get('TenantLocation');
    if (!TenantLocation?.findAll) throw Object.assign(new Error('Tenant locations are unavailable.'), { statusCode: 503 });
    return TenantLocation.findAll({ where: { location_id: locationIds.map(Number), is_active: true }, attributes: ['location_id'] });
  },
  async writeTenantAudit(audit) {
    const AuditLog = dbStore.get('AuditLog');
    if (!AuditLog?.create) throw Object.assign(new Error('Tenant audit is unavailable.'), { statusCode: 503 });
    await AuditLog.create({ user_id: audit.userId || null, entity_type: 'partner_attachment', entity_id: null, action: 'UPDATE', event_type: audit.eventType, actor_username: audit.username || null, reason: audit.reason || null, request_id: audit.requestId || null, changes: audit.changes || {} });
  }
};
