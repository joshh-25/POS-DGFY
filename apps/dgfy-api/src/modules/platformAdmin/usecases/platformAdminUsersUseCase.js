import bcrypt from 'bcryptjs';
import { PLATFORM_ADMIN_PERMISSION_VALUES } from '../constants/permissions.js';

const DEFAULT_PASSWORD = '11223344';
const normalizeUsername = (value) => String(value || '').trim();
const normalizePermissions = (value) => [...new Set((Array.isArray(value) ? value : []).filter((permission) => PLATFORM_ADMIN_PERMISSION_VALUES.includes(permission)))];
const securePassword = (value) => String(value || '').length >= 8;

const failure = (status, message) => ({ success: false, status, message });
const forbiddenMaster = (user) => user?.is_master ? failure(422, 'The bootstrap Platform Master Admin is immutable.') : null;

export const buildPlatformAdminUsersUseCase = ({ repository }) => ({
  async list() { return { success: true, data: await repository.listUsers() }; },
  async readiness() {
    const activeDefaultPasswordUsers = await repository.countActiveDefaultPasswordUsers();
    return {
      success: true,
      data: {
        production_secure: activeDefaultPasswordUsers === 0,
        active_default_password_users: activeDefaultPasswordUsers,
        warning: activeDefaultPasswordUsers ? 'Active delegated Platform Admin accounts still use the shared default password. This is not production-secure.' : null
      }
    };
  },
  async create({ actor, body }) {
    const username = normalizeUsername(body?.username);
    const enteredPassword = String(body?.password || '');
    const permissions = normalizePermissions(body?.permissions);
    if (!username || !permissions.length) return failure(422, 'Username and at least one page permission are required.');
    if (username.toLowerCase() === actor.username.toLowerCase()) return failure(409, 'The bootstrap master username is reserved.');
    if (enteredPassword && !securePassword(enteredPassword)) return failure(422, 'Entered Platform Admin passwords must be at least 8 characters.');
    const existing = await repository.findUserByUsername(username);
    if (existing) return failure(409, 'That username is unavailable.');
    const temporaryPasswordActive = !enteredPassword;
    const passwordHash = await bcrypt.hash(enteredPassword || DEFAULT_PASSWORD, 12);
    try {
      return { success: true, status: 201, data: await repository.createDelegatedUser({ username, passwordHash, temporaryPasswordActive, permissions, actor }) };
    } catch (error) {
      if (/unique/i.test(error?.message || '')) return failure(409, 'That username is unavailable.');
      throw error;
    }
  },
  async permissions({ actor, adminId, permissions }) {
    const user = await repository.findUserById(adminId);
    if (!user) return failure(404, 'Platform Admin user not found.');
    if (forbiddenMaster(user)) return forbiddenMaster(user);
    return { success: true, data: await repository.replacePermissions({ user, permissions: normalizePermissions(permissions), actor }) };
  },
  async suspend({ actor, adminId, reason }) {
    const user = await repository.findUserById(adminId);
    if (!user) return failure(404, 'Platform Admin user not found.');
    if (forbiddenMaster(user) || user.id === actor.id) return forbiddenMaster(user) || failure(422, 'You cannot suspend your current account.');
    return { success: true, data: await repository.setStatus({ user, status: 'suspended', actor, reason: String(reason || '').trim() || null }) };
  },
  async reactivate({ actor, adminId }) {
    const user = await repository.findUserById(adminId);
    if (!user) return failure(404, 'Platform Admin user not found.');
    if (forbiddenMaster(user)) return forbiddenMaster(user);
    return { success: true, data: await repository.setStatus({ user, status: 'active', actor }) };
  },
  async resetPassword({ actor, adminId }) {
    const user = await repository.findUserById(adminId);
    if (!user) return failure(404, 'Platform Admin user not found.');
    if (forbiddenMaster(user)) return forbiddenMaster(user);
    return repository.transaction(async (transaction) => {
      const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
      const updated = await repository.changePassword({ user, passwordHash, temporaryPasswordActive: true, transaction });
      await repository.audit({ actor_admin_id: actor.id, actor_username_snapshot: actor.username, target_admin_id: user.id, target_username_snapshot: user.username, action: 'platform_admin_password_reset' }, transaction);
      return { success: true, data: repository.publicUser(updated) };
    });
  },
  async changeOwnPassword({ actor, currentPassword, newPassword, confirmation }) {
    if (actor?.is_master) return failure(422, 'The bootstrap Platform Master Admin password is managed through the environment configuration.');
    if (newPassword !== confirmation) return failure(422, 'New password confirmation does not match.');
    if (!securePassword(newPassword)) return failure(422, 'New Platform Admin passwords must be at least 8 characters.');
    const user = await repository.findUserById(actor.id);
    if (!user || !await bcrypt.compare(String(currentPassword || ''), user.password_hash)) return failure(422, 'Current password is incorrect.');
    return repository.transaction(async (transaction) => {
      const updated = await repository.changePassword({ user, passwordHash: await bcrypt.hash(newPassword, 12), temporaryPasswordActive: false, transaction });
      await repository.audit({ actor_admin_id: actor.id, actor_username_snapshot: actor.username, target_admin_id: actor.id, target_username_snapshot: actor.username, action: 'platform_admin_password_changed' }, transaction);
      return { success: true, data: repository.publicUser(updated) };
    });
  },
  async remove({ actor, adminId, reason }) {
    const user = await repository.findUserById(adminId);
    if (!user) return failure(404, 'Platform Admin user not found.');
    if (forbiddenMaster(user) || user.id === actor.id) return forbiddenMaster(user) || failure(422, 'You cannot delete your current account.');
    return { success: true, data: await repository.softDelete({ user, actor, reason: String(reason || '').trim() || null }) };
  }
});
