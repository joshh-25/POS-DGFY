import crypto from 'crypto';
import { Op } from 'sequelize';
import {
  PlatformAdminAuditLog,
  PlatformAdminPermission,
  PlatformAdminSession,
  PlatformAdminUser,
  sequelize
} from '../../../models/index.js';

const normalizeUsername = (value) => String(value || '').trim().toLowerCase();
const hashSafeMetadata = (value) => value ? crypto.createHash('sha256').update(String(value)).digest('hex') : null;

const publicUser = (user, permissions = []) => ({
  id: user.id,
  username: user.username,
  is_master: Boolean(user.is_master),
  status: user.status,
  temporary_password_active: Boolean(user.temporary_password_active),
  permissions
});

export const createPlatformAdminRepository = () => ({
  transaction: (callback) => sequelize.transaction(callback),
  async ensureBootstrapMaster({ username, passwordHash }) {
    const normalized = normalizeUsername(username);
    const [user] = await PlatformAdminUser.findOrCreate({
      where: { username_normalized: normalized },
      defaults: {
        username: String(username).trim(), username_normalized: normalized, password_hash: passwordHash,
        is_master: true, auth_source: 'bootstrap_env', status: 'active'
      }
    });
    if (!user.is_master || user.auth_source !== 'bootstrap_env') {
      const error = new Error('Configured bootstrap Platform Master Admin username is reserved');
      error.code = 'PLATFORM_ADMIN_BOOTSTRAP_USERNAME_CONFLICT';
      throw error;
    }
    if (user.password_hash !== passwordHash) await user.update({ password_hash: passwordHash, auth_version: user.auth_version + 1 });
    return user.reload();
  },
  findActiveByUsername(username) {
    return PlatformAdminUser.findOne({ where: { username_normalized: normalizeUsername(username), status: 'active' } });
  },
  async createSession({ user, sourceIp, userAgent }) {
    const now = new Date();
    return PlatformAdminSession.create({
      admin_user_id: user.id, auth_version: user.auth_version, issued_at: now,
      expires_at: new Date(now.getTime() + 8 * 60 * 60 * 1000),
      ip_hash: hashSafeMetadata(sourceIp), user_agent_hash: hashSafeMetadata(userAgent)
    });
  },
  async resolveSessionAuthority({ adminId, sessionId, authVersion }) {
    const session = await PlatformAdminSession.findOne({
      where: { id: sessionId, admin_user_id: adminId, auth_version: authVersion, revoked_at: null, expires_at: { [Op.gt]: new Date() } },
      include: [{ model: PlatformAdminUser, as: 'adminUser', required: true, where: { status: 'active' } }]
    });
    if (!session || session.adminUser.auth_version !== Number(authVersion)) return null;
    const permissions = session.adminUser.is_master ? [] : await PlatformAdminPermission.findAll({ where: { admin_user_id: adminId }, attributes: ['permission_key'] });
    return { user: session.adminUser, session, permissions: permissions.map((item) => item.permission_key) };
  },
  async listPermissionKeys(adminUserId) {
    const grants = await PlatformAdminPermission.findAll({ where: { admin_user_id: adminUserId }, attributes: ['permission_key'] });
    return grants.map((item) => item.permission_key);
  },
  async revokeSession(sessionId, reason) {
    await PlatformAdminSession.update({ revoked_at: new Date(), revoked_reason: reason }, { where: { id: sessionId, revoked_at: null } });
  },
  async revokeUserSessions(adminUserId, reason, transaction = undefined) {
    await PlatformAdminSession.update({ revoked_at: new Date(), revoked_reason: reason }, { where: { admin_user_id: adminUserId, revoked_at: null }, transaction });
  },
  async changePassword({ user, passwordHash, temporaryPasswordActive, transaction }) {
    await user.update({ password_hash: passwordHash, temporary_password_active: temporaryPasswordActive, password_changed_at: new Date(), auth_version: user.auth_version + 1 }, { transaction });
    await this.revokeUserSessions(user.id, 'password_changed', transaction);
    return user.reload({ transaction });
  },
  async listUsers() {
    const users = await PlatformAdminUser.findAll({ where: { status: { [Op.ne]: 'deleted' } }, order: [['created_at', 'DESC']] });
    const grants = await PlatformAdminPermission.findAll({ attributes: ['admin_user_id', 'permission_key'] });
    const grouped = new Map();
    grants.forEach((grant) => grouped.set(grant.admin_user_id, [...(grouped.get(grant.admin_user_id) || []), grant.permission_key]));
    return users.map((user) => publicUser(user, grouped.get(user.id) || []));
  },
  countActiveDefaultPasswordUsers() {
    return PlatformAdminUser.count({ where: { status: 'active', is_master: false, temporary_password_active: true } });
  },
  findUserById(id, options = {}) { return PlatformAdminUser.findByPk(id, options); },
  findUserByUsername(username) { return PlatformAdminUser.findOne({ where: { username_normalized: normalizeUsername(username) } }); },
  async createDelegatedUser({ username, passwordHash, temporaryPasswordActive, permissions, actor }) {
    return this.transaction(async (transaction) => {
      const normalized = normalizeUsername(username);
      const user = await PlatformAdminUser.create({
        username: String(username).trim(), username_normalized: normalized, password_hash: passwordHash,
        is_master: false, auth_source: 'database', status: 'active',
        temporary_password_active: temporaryPasswordActive, created_by_admin_id: actor.id
      }, { transaction });
      await PlatformAdminPermission.bulkCreate(permissions.map((permission_key) => ({ admin_user_id: user.id, permission_key })), { transaction });
      await this.audit({ actor_admin_id: actor.id, actor_username_snapshot: actor.username, target_admin_id: user.id, target_username_snapshot: user.username, action: 'platform_admin_created', after_snapshot: { permissions, temporary_password_active: temporaryPasswordActive } }, transaction);
      return publicUser(user, permissions);
    });
  },
  async replacePermissions({ user, permissions, actor }) {
    return this.transaction(async (transaction) => {
      const before = await PlatformAdminPermission.findAll({ where: { admin_user_id: user.id }, attributes: ['permission_key'], transaction });
      await PlatformAdminPermission.destroy({ where: { admin_user_id: user.id }, transaction });
      await PlatformAdminPermission.bulkCreate(permissions.map((permission_key) => ({ admin_user_id: user.id, permission_key })), { transaction });
      await user.update({ auth_version: user.auth_version + 1 }, { transaction });
      await this.revokeUserSessions(user.id, 'permissions_changed', transaction);
      await this.audit({ actor_admin_id: actor.id, actor_username_snapshot: actor.username, target_admin_id: user.id, target_username_snapshot: user.username, action: 'platform_admin_permissions_changed', before_snapshot: { permissions: before.map((item) => item.permission_key) }, after_snapshot: { permissions } }, transaction);
      return publicUser(user, permissions);
    });
  },
  async setStatus({ user, status, actor, reason }) {
    return this.transaction(async (transaction) => {
      const now = new Date();
      const patch = status === 'suspended'
        ? { status, suspended_at: now, suspended_by_admin_id: actor.id, suspension_reason: reason, auth_version: user.auth_version + 1 }
        : { status, suspended_at: null, suspended_by_admin_id: null, suspension_reason: null, auth_version: user.auth_version + 1 };
      await user.update(patch, { transaction });
      if (status !== 'active') await this.revokeUserSessions(user.id, `status_${status}`, transaction);
      await this.audit({ actor_admin_id: actor.id, actor_username_snapshot: actor.username, target_admin_id: user.id, target_username_snapshot: user.username, action: `platform_admin_${status}`, reason }, transaction);
      return publicUser(user);
    });
  },
  async softDelete({ user, actor, reason }) {
    return this.transaction(async (transaction) => {
      await user.update({ status: 'deleted', deleted_at: new Date(), deleted_by_admin_id: actor.id, deletion_reason: reason, auth_version: user.auth_version + 1 }, { transaction });
      await this.revokeUserSessions(user.id, 'deleted', transaction);
      await this.audit({ actor_admin_id: actor.id, actor_username_snapshot: actor.username, target_admin_id: user.id, target_username_snapshot: user.username, action: 'platform_admin_deleted', reason }, transaction);
      return publicUser(user);
    });
  },
  publicUser,
  async audit(entry, transaction = undefined) { await PlatformAdminAuditLog.create(entry, { transaction }); }
});
