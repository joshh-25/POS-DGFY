import { Op } from 'sequelize';
import crypto from 'crypto';
import dbStore from '../utils/dbStore.js';
import { hashPassword, comparePassword, generateToken, generateRefreshToken } from './authService.js';
import * as landlordService from './landlordService.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../config/permissions.js';
import { ROLE_HIERARCHY, USER_ROLES, isAdminLikeRole } from '../config/userRoles.js';
import * as emailService from './emailService.js';
import { buildVisibleWhere, notFoundError } from '../utils/softDeletePolicy.js';
import { onboardingRepository } from '../modules/onboarding/repositories/onboardingRepository.js';
import logger from '../config/logger.js';

const normalizePermissionArray = (rawPermissions) => {
  let normalized = rawPermissions;

  if (typeof normalized === 'string') {
    try {
      normalized = JSON.parse(normalized);
    } catch {
      normalized = [];
    }
  }

  if (!Array.isArray(normalized)) {
    return [];
  }

  return Array.from(
    new Set(
      normalized
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
    )
  );
};

const resolveEffectivePermissions = (user) => {
  const parsedPermissions = normalizePermissionArray(user?.permissions);
  if (parsedPermissions.length > 0) {
    return parsedPermissions;
  }

  const normalizedRole = String(user?.role || '').trim().toLowerCase();
  const defaults = DEFAULT_ROLE_PERMISSIONS[normalizedRole];
  return Array.isArray(defaults) ? [...defaults] : [];
};

const hasPermission = (user, permission) => {
  const effectivePermissions = resolveEffectivePermissions(user);
  return effectivePermissions.includes(permission);
};

const REUSABLE_INVITATION_STATUSES = new Set(['cancelled', 'expired']);
const RECOVERABLE_INVITATION_STATUSES = new Set(['pending', 'cancelled', 'expired']);

const isReusableInvitationRow = (user) => (
  user &&
  !user.is_active &&
  REUSABLE_INVITATION_STATUSES.has(String(user.invitation_status || '').toLowerCase())
);

const isInvitationLifecycleRow = (user) => (
  user &&
  RECOVERABLE_INVITATION_STATUSES.has(String(user.invitation_status || '').toLowerCase())
);

const assertAcceptedUserEditable = (user, action) => {
  if (isInvitationLifecycleRow(user)) {
    throw createError(`Cannot ${action} until the invitation is accepted`, 409);
  }
};

const findVisibleUserById = async (User, userId, queryOptions = {}) => {
  const { where = {}, ...rest } = queryOptions;
  return User.findOne({
    ...rest,
    where: buildVisibleWhere({ ...where, user_id: userId })
  });
};

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

/**
 * Get current user profile by user ID
 * @param {number} userId - User ID from authenticated request
 * @returns {Promise<Object>} User profile data
 */
export const getCurrentUser = async (userId) => {
  const User = dbStore.get('User');
  const user = await findVisibleUserById(User, userId, {
    attributes: ['user_id', 'username', 'email', 'role', 'is_active', 'last_login', 'created_at', 'permissions', 'is_master_admin']
  });

  if (!user) {
    throw notFoundError('User not found');
  }

  const { tenantPlan, tenantSubscriptionStatus, tenantGracePeriodEnd, tenantPaymentMethod } = dbStore.getStore() || {};
  let onboarding = null;
  if (user.is_master_admin === true) {
    try {
      onboarding = await onboardingRepository.getStatus({
        storeNameBaseline: dbStore.getStore()?.tenantName || ''
      });
    } catch (error) {
      logger.warn('[UserService] Failed to load onboarding status for current user profile', {
        user_id: user.user_id || null,
        tenant_id: dbStore.getStore()?.tenantId || null,
        error: error.message
      });
      onboarding = null;
    }
  }

  return {
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    last_login: user.last_login,
    created_at: user.created_at,
    permissions: resolveEffectivePermissions(user),
    is_master_admin: user.is_master_admin,
    company: {
      plan: tenantPlan || 'standard',
      subscription_status: tenantSubscriptionStatus || 'active',
      grace_period_end: tenantGracePeriodEnd || null,
      payment_method: tenantPaymentMethod || 'manual'
    },
    onboarding
  };
};

/**
 * Update user profile (username, email)
 * @param {number} userId - User ID from authenticated request
 * @param {Object} updateData - Data to update { username, email }
 * @returns {Promise<Object>} Updated user data with new token if needed
 */
export const updateUserProfile = async (userId, updateData) => {
  const User = dbStore.get('User');
  const user = await findVisibleUserById(User, userId);

  if (!user) {
    throw notFoundError('User not found');
  }

  // Prevent role and status changes through profile update
  delete updateData.role;
  delete updateData.is_active;
  delete updateData.password_hash;

  // Check email/username uniqueness if being updated
  if (updateData.email || updateData.username) {
    const whereClause = [];

    if (updateData.email) {
      whereClause.push({ email: updateData.email });
    }
    if (updateData.username) {
      whereClause.push({ username: updateData.username });
    }

    const existingUser = await User.findOne({
      where: {
        [Op.and]: [
          { [Op.or]: whereClause },
          { user_id: { [Op.ne]: userId } }
        ]
      }
    });

    if (existingUser) {
      if (existingUser.email === updateData.email) {
        const error = new Error('Email already in use by another user');
        error.statusCode = 409;
        throw error;
      }
      if (existingUser.username === updateData.username) {
        const error = new Error('Username already in use by another user');
        error.statusCode = 409;
        throw error;
      }
    }
  }

  // Capture old email before update for mapping update
  const oldEmail = user.email;

  // Update user
  await user.update(updateData);

  // If email changed, update the email-tenant mapping
  if (updateData.email && updateData.email !== oldEmail) {
    const store = dbStore.getStore();
    const tenantId = store?.tenantId;
    if (tenantId) {
      try {
        await landlordService.updateEmailTenantMapping(oldEmail, updateData.email, tenantId);
      } catch (mappingError) {
        // Log but don't fail the profile update
        console.warn('Failed to update email-tenant mapping:', mappingError.message);
      }
    }
  }

  // Generate new token if username or email changed (token payload includes these)
  let newToken = null;
  if (updateData.username || updateData.email) {
    newToken = generateToken(user);
  }

  return {
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    role: user.role,
    token: newToken
  };
};

/**
 * Change user password
 * @param {number} userId - User ID from authenticated request
 * @param {string} currentPassword - Current password for verification
 * @param {string} newPassword - New password to set
 * @returns {Promise<void>}
 */
export const changePassword = async (userId, currentPassword, newPassword) => {
  const User = dbStore.get('User');
  const user = await findVisibleUserById(User, userId);

  if (!user) {
    throw notFoundError('User not found');
  }

  // Verify current password
  const isValid = await comparePassword(currentPassword, user.password_hash);
  if (!isValid) {
    const error = new Error('Current password is incorrect');
    error.statusCode = 401;
    throw error;
  }

  // Hash and save new password
  const password_hash = await hashPassword(newPassword);
  await user.update({ password_hash });
};

/**
 * Get all users (admin only)
 * Excludes users who have been removed from the company (soft-deleted)
 * @returns {Promise<Array>} List of all active users
 */
export const getAllUsers = async (options = {}) => {
  const User = dbStore.get('User');
  const includeInvitations = options?.includeInvitations === true;
  const users = await User.findAll({
    attributes: [
      'user_id',
      'username',
      'email',
      'role',
      'is_active',
      'last_login',
      'created_at',
      'permissions',
      'is_master_admin',
      'invitation_status',
      'invitation_expires_at',
      'invitation_delivery_status',
      'invitation_delivery_error',
      'invitation_last_sent_at',
      'invited_by'
    ],
    where: buildVisibleWhere(includeInvitations ? {} : {
      [Op.or]: [
        { invitation_status: null },
        { invitation_status: 'accepted' }
      ]
    }),
    order: [['created_at', 'DESC']]
  });

  return users.map(user => ({
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    last_login: user.last_login,
    created_at: user.created_at,
    permissions: resolveEffectivePermissions(user),
    is_master_admin: user.is_master_admin,
    invitation_status: user.invitation_status || null,
    invitation_expires_at: user.invitation_expires_at || null,
    invitation_delivery_status: user.invitation_delivery_status || null,
    invitation_delivery_error: user.invitation_delivery_error || null,
    invitation_last_sent_at: user.invitation_last_sent_at || null,
    invited_by: user.invited_by || null
  }));
};

/**
 * Update user role (admin only)
 * @param {number} adminUserId - ID of admin performing the action
 * @param {number} targetUserId - ID of user to update
 * @param {Object} roleData - { role: 'admin' | 'manager' | 'staff' | 'cashier' | 'po' | 'do' | 'jo' }
 * @returns {Promise<Object>} Updated user data
 */
export const updateUserRole = async (adminUserId, targetUserId, roleData) => {
  // Prevent admin from changing their own role
  if (adminUserId === parseInt(targetUserId)) {
    const error = new Error('Cannot change your own role');
    error.statusCode = 403;
    throw error;
  }

  const User = dbStore.get('User');
  const targetUser = await findVisibleUserById(User, targetUserId);

  if (!targetUser) {
    throw notFoundError('Target user not found');
  }

  const adminUser = await findVisibleUserById(User, adminUserId);
  if (!adminUser) {
    throw notFoundError('Admin user not found');
  }

  // Check admin has users:manage permission (unless Master Admin)
  if (!adminUser.is_master_admin && !hasPermission(adminUser, 'users:manage')) {
    throw createError('Missing users:manage permission', 403);
  }

  assertAcceptedUserEditable(targetUser, 'change role');

  // Get default permissions for the new role
  const normalizedRole = roleData.role?.toLowerCase();
  if (!USER_ROLES.includes(normalizedRole)) {
    const error = new Error(`Invalid role: ${roleData.role}`);
    error.statusCode = 422;
    throw error;
  }

  validateAdminHierarchy(adminUser, targetUser, 'modify role for', normalizedRole);
  const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[normalizedRole] || [];

  // Build update data
  const updateData = {
    role: normalizedRole,
    permissions: defaultPermissions
  };

  // Reset master admin flag if demoting from admin
  if (!isAdminLikeRole(normalizedRole)) {
    updateData.is_master_admin = false;
  }

  await targetUser.update(updateData);

  // Reload to get the updated values
  await targetUser.reload();

  return {
    user_id: targetUser.user_id,
    username: targetUser.username,
    email: targetUser.email,
    role: targetUser.role,
    is_active: targetUser.is_active,
    permissions: targetUser.permissions,
    is_master_admin: targetUser.is_master_admin
  };
};

/**
 * Toggle user active status (admin only)
 * @param {number} adminUserId - ID of admin performing the action
 * @param {number} targetUserId - ID of user to update
 * @param {boolean} isActive - Active status to set
 * @returns {Promise<Object>} Updated user data
 */
export const toggleUserStatus = async (adminUserId, targetUserId, isActive) => {
  // Prevent admin from deactivating themselves
  if (adminUserId === parseInt(targetUserId)) {
    const error = new Error('Cannot change your own account status');
    error.statusCode = 403;
    throw error;
  }

  const User = dbStore.get('User');
  const [adminUser, targetUser] = await Promise.all([
    findVisibleUserById(User, adminUserId),
    findVisibleUserById(User, targetUserId)
  ]);

  if (!adminUser) {
    throw notFoundError('Admin user not found');
  }

  if (!targetUser) {
    throw notFoundError('Target user not found');
  }

  // Check admin has users:manage permission (unless Master Admin)
  if (!adminUser.is_master_admin && !hasPermission(adminUser, 'users:manage')) {
    throw createError('Missing users:manage permission', 403);
  }

  assertAcceptedUserEditable(targetUser, 'change status');

  validateAdminHierarchy(adminUser, targetUser, 'change status for');

  await targetUser.update({ is_active: isActive });

  // Update email-tenant mapping based on active status
  const store = dbStore.getStore();
  const tenantId = store?.tenantId;
  if (tenantId) {
    try {
      if (isActive) {
        // Reactivating user - add mapping back
        await landlordService.addEmailTenantMapping(targetUser.email, tenantId);
      } else {
        // Deactivating user - remove mapping so they can't log in without token
        await landlordService.removeEmailTenantMapping(targetUser.email, tenantId);
      }
    } catch (mappingError) {
      // Log but don't fail the status update
      console.warn('Failed to update email-tenant mapping:', mappingError.message);
    }
  }

  return {
    user_id: targetUser.user_id,
    username: targetUser.username,
    email: targetUser.email,
    role: targetUser.role,
    is_active: targetUser.is_active
  };
};

/**
 * Remove user from company (soft delete with hierarchical access control)
 * @param {number} adminUserId - ID of admin performing the action
 * @param {number} targetUserId - ID of user to remove
 * @returns {Promise<Object>} Removed user data
 */
export const removeUserFromCompany = async (adminUserId, targetUserId) => {
  // Prevent self-removal
  if (adminUserId === parseInt(targetUserId)) {
    const error = new Error('Cannot remove yourself from the company');
    error.statusCode = 400;
    throw error;
  }

  const User = dbStore.get('User');

  // Get both users
  const [adminUser, targetUser] = await Promise.all([
    findVisibleUserById(User, adminUserId),
    findVisibleUserById(User, targetUserId)
  ]);

  if (!adminUser) {
    throw notFoundError('Admin user not found');
  }

  if (!targetUser) {
    throw notFoundError('Target user not found');
  }

  // Master Admin is always protected
  if (targetUser.is_master_admin) {
    const error = new Error('Master Admin cannot be removed from the company');
    error.statusCode = 403;
    throw error;
  }

  // Hierarchical access control check
  const adminRank = adminUser.is_master_admin ? 99 : (ROLE_HIERARCHY[adminUser.role] || 0);
  const targetRank = ROLE_HIERARCHY[targetUser.role] || 0;

  if (adminRank <= targetRank) {
    const error = new Error(`You don't have permission to remove a ${targetUser.role} user`);
    error.statusCode = 403;
    throw error;
  }

  // Perform soft delete
  await targetUser.update({
    deleted_at: new Date(),
    deleted_by: adminUserId,
    is_active: false
  });

  // Remove email-tenant mapping
  const store = dbStore.getStore();
  const tenantId = store?.tenantId;
  if (tenantId) {
    try {
      await landlordService.removeEmailTenantMapping(targetUser.email, tenantId);
    } catch (mappingError) {
      console.warn('Failed to remove email-tenant mapping:', mappingError.message);
    }
  }

  return {
    user_id: targetUser.user_id,
    username: targetUser.username,
    email: targetUser.email,
    role: targetUser.role,
    removed_at: targetUser.deleted_at
  };
};

/**
 * Update user permissions (Master Admin only)
 * @param {number} adminUserId - ID of admin performing action
 * @param {number} targetUserId - ID of user to update
 * @param {Array} permissions - List of permission strings
 * @param {boolean} isMaster - Grant Master Admin access (dangerous)
 */
export const updateUserPermissions = async (adminUserId, targetUserId, permissions, isMaster) => {
  // Check if admin is authorized (double check happened in controller, but safe to check here)
  const User = dbStore.get('User');
  const adminUser = await findVisibleUserById(User, adminUserId);
  if (!adminUser || !adminUser.is_master_admin) {
    const error = new Error('Only Master Admins can manage permissions');
    error.statusCode = 403;
    throw error;
  }

  const targetUser = await findVisibleUserById(User, targetUserId);
  if (!targetUser) {
    throw notFoundError('Target user not found');
  }

  assertAcceptedUserEditable(targetUser, 'change permissions');

  // Prevent revoking your own master admin status if you are the one doing it
  if (adminUserId === parseInt(targetUserId) && isMaster === false) {
    // Optional safety check: allow it for now, but UI should warn
  }

  const updateData = { permissions };
  if (typeof isMaster === 'boolean') {
    updateData.is_master_admin = isMaster;
  }

  await targetUser.update(updateData);

  return {
    user_id: targetUser.user_id,
    permissions: targetUser.permissions,
    is_master_admin: targetUser.is_master_admin
  };
};

export const getUserLocationGrants = async (adminUserId, targetUserId, options = {}) => {
  const User = dbStore.get('User');
  const UserLocationGrant = dbStore.get('UserLocationGrant');
  const TenantLocation = dbStore.get('TenantLocation');
  if (!UserLocationGrant || !TenantLocation) {
    throw createError('Location grant models are unavailable in this tenant context', 500);
  }

  const normalizedAdminUserId = parsePositiveInt(adminUserId);
  const normalizedTargetUserId = parsePositiveInt(targetUserId);
  if (!normalizedAdminUserId || !normalizedTargetUserId) {
    throw createError('adminUserId and targetUserId must be positive integers', 400);
  }

  const [adminUser, targetUser] = await Promise.all([
    findVisibleUserById(User, normalizedAdminUserId),
    findVisibleUserById(User, normalizedTargetUserId)
  ]);

  if (!adminUser) {
    throw notFoundError('Admin user not found');
  }
  if (!targetUser) {
    throw notFoundError('Target user not found');
  }

  if (!adminUser.is_master_admin && !hasPermission(adminUser, 'users:manage')) {
    throw createError('Missing users:manage permission', 403);
  }

  validateAdminHierarchy(adminUser, targetUser, 'view location grants for');

  const includeInactiveLocations = options?.includeInactiveLocations === true;
  const locationWhere = includeInactiveLocations ? {} : { is_active: true };

  const [locations, grants] = await Promise.all([
    TenantLocation.findAll({
      where: locationWhere,
      attributes: ['location_id', 'name', 'is_active', 'is_open', 'is_primary_storefront'],
      order: [
        ['is_primary_storefront', 'DESC'],
        ['is_open', 'DESC'],
        ['updated_at', 'DESC'],
        ['location_id', 'DESC']
      ]
    }),
    UserLocationGrant.findAll({
      where: { user_id: normalizedTargetUserId },
      attributes: ['location_id']
    })
  ]);

  const grantedLocationIds = Array.from(new Set(grants.map((row) => Number(row.location_id))));
  const grantedIdSet = new Set(grantedLocationIds);
  const locationsWithGrantFlag = locations.map((location) => ({
    ...location.toJSON(),
    granted: grantedIdSet.has(Number(location.location_id))
  }));

  return {
    user_id: targetUser.user_id,
    username: targetUser.username,
    include_inactive_locations: includeInactiveLocations,
    granted_location_ids: grantedLocationIds,
    locations: locationsWithGrantFlag
  };
};

export const updateUserLocationGrants = async (adminUserId, targetUserId, locationIds = []) => {
  const User = dbStore.get('User');
  const UserLocationGrant = dbStore.get('UserLocationGrant');
  const TenantLocation = dbStore.get('TenantLocation');
  if (!UserLocationGrant || !TenantLocation) {
    throw createError('Location grant models are unavailable in this tenant context', 500);
  }

  const normalizedAdminUserId = parsePositiveInt(adminUserId);
  const normalizedTargetUserId = parsePositiveInt(targetUserId);
  if (!normalizedAdminUserId || !normalizedTargetUserId) {
    throw createError('adminUserId and targetUserId must be positive integers', 400);
  }

  const normalizedLocationIds = normalizeLocationIds(locationIds);

  const [adminUser, targetUser] = await Promise.all([
    findVisibleUserById(User, normalizedAdminUserId),
    findVisibleUserById(User, normalizedTargetUserId)
  ]);

  if (!adminUser) {
    throw notFoundError('Admin user not found');
  }
  if (!targetUser) {
    throw notFoundError('Target user not found');
  }

  if (!adminUser.is_master_admin && !hasPermission(adminUser, 'users:manage')) {
    throw createError('Missing users:manage permission', 403);
  }

  assertAcceptedUserEditable(targetUser, 'change location scope');

  validateAdminHierarchy(adminUser, targetUser, 'modify location grants for');

  await validateActiveLocationIds(normalizedLocationIds);

  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();
  try {
    await replaceUserLocationGrants(
      normalizedTargetUserId,
      normalizedLocationIds,
      transaction,
      normalizedAdminUserId
    );

    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }

  return getUserLocationGrants(normalizedAdminUserId, normalizedTargetUserId);
};

// ============== INVITATION SYSTEM ==============

/**
 * Generate a secure invitation token
 * @returns {string} 64-character hex token
 */
const generateInvitationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const hashInvitationToken = (token) => landlordService.hashInvitationToken(token);

const buildInviteAcceptanceUrl = ({ token }) => {
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const params = new URLSearchParams({ token });
  return `${appUrl}/accept-invite?${params.toString()}`;
};

const resolveInviteDelivery = async ({ email, inviterName, role, invitationToken, tenantName }) => {
  if (!emailService.isEmailConfigured()) {
    return {
      emailSent: false,
      deliveryStatus: 'not_configured',
      deliveryError: 'Email service is not configured'
    };
  }

  try {
    await emailService.sendInvitationEmail({
      email,
      inviterName,
      role,
      invitationToken,
      tenantName
    });
    return {
      emailSent: true,
      deliveryStatus: 'sent',
      deliveryError: null
    };
  } catch (emailError) {
    console.warn('Failed to send invitation email:', emailError.message);
    return {
      emailSent: false,
      deliveryStatus: 'failed',
      deliveryError: emailError.message || 'Email delivery failed'
    };
  }
};

/**
 * Helper function to create standardized errors
 */
const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeLocationIds = (locationIds = []) => {
  if (!Array.isArray(locationIds)) {
    throw createError('locationIds must be an array', 400);
  }

  const normalizedLocationIds = Array.from(
    new Set(locationIds.map((value) => parsePositiveInt(value)))
  );
  if (normalizedLocationIds.some((value) => !value)) {
    throw createError('locationIds must only include positive integers', 400);
  }
  return normalizedLocationIds;
};

const validateActiveLocationIds = async (locationIds = []) => {
  const normalizedLocationIds = normalizeLocationIds(locationIds);
  if (normalizedLocationIds.length === 0) return normalizedLocationIds;

  const TenantLocation = dbStore.get('TenantLocation');
  if (!TenantLocation) {
    throw createError('Location models are unavailable in this tenant context', 500);
  }

  const activeLocations = await TenantLocation.findAll({
    where: { is_active: true },
    attributes: ['location_id']
  });
  const activeLocationIdSet = new Set(activeLocations.map((location) => Number(location.location_id)));
  const invalidLocationIds = normalizedLocationIds.filter((locationId) => !activeLocationIdSet.has(Number(locationId)));
  if (invalidLocationIds.length > 0) {
    throw createError(`Invalid or inactive location ids: ${invalidLocationIds.join(', ')}`, 422);
  }

  return normalizedLocationIds;
};

const replaceUserLocationGrants = async (userId, locationIds = [], transaction = null, createdBy = null) => {
  const UserLocationGrant = dbStore.get('UserLocationGrant');
  if (!UserLocationGrant) {
    throw createError('Location grant models are unavailable in this tenant context', 500);
  }

  await UserLocationGrant.destroy({
    where: { user_id: userId },
    ...(transaction ? { transaction } : {})
  });

  if (locationIds.length > 0) {
    await UserLocationGrant.bulkCreate(
      locationIds.map((locationId) => ({
        user_id: userId,
        location_id: Number(locationId),
        ...(createdBy ? { created_by: createdBy } : {})
      })),
      transaction ? { transaction } : {}
    );
  }
};

const writeInvitationRegistryOrThrow = async ({
  tenantId,
  tenantUserId,
  email,
  role,
  token,
  status = 'pending',
  deliveryStatus = 'not_configured',
  deliveryError = null,
  invitedByUserId,
  invitedByName,
  expiresAt,
  lastSentAt = null
}) => {
  const normalizedTenantId = String(tenantId || '').trim();
  if (!normalizedTenantId || normalizedTenantId === 'default') {
    return null;
  }

  try {
    return await landlordService.upsertUserInvitationRegistry({
      tenantId: normalizedTenantId,
      tenantUserId,
      email,
      role,
      token,
      status,
      deliveryStatus,
      deliveryError,
      invitedByUserId,
      invitedByName,
      expiresAt,
      lastSentAt
    });
  } catch (registryError) {
    logger.error('[UserService] Failed to write user invitation registry', {
      tenantId: normalizedTenantId,
      user_id: tenantUserId,
      error: registryError.message
    });
    throw createError('Could not create a usable invitation link. Please try again.', 500);
  }
};

/**
 * Validate admin hierarchy for user management operations
 * @param {Object} adminUser - Admin performing the action
 * @param {Object} targetUser - Target user being modified (null for new invitations)
 * @param {string} action - Action being performed (for error messages)
 * @param {string} targetRole - Target role (for invitations)
 * @throws {Error} If hierarchy validation fails
 */
const validateAdminHierarchy = (adminUser, targetUser, action, targetRole = null) => {
  // Master Admin can do anything
  if (adminUser.is_master_admin) return true;

  // For new invitations, check if trying to invite an admin
  if (!targetUser && isAdminLikeRole(targetRole)) {
    throw createError('Only Master Admin can invite Admin users', 403);
  }

  // For role updates, regular admins cannot grant admin role
  if (targetRole && isAdminLikeRole(targetRole)) {
    throw createError(`Only Master Admin can ${action} to Admin role`, 403);
  }

  // For existing users:
  if (targetUser) {
    // Cannot modify Master Admins
    if (targetUser.is_master_admin) {
      throw createError(`Only Master Admin can ${action} Master Admin accounts`, 403);
    }

    // Cannot modify other Admins
    if (isAdminLikeRole(targetUser.role)) {
      throw createError(`Only Master Admin can ${action} Admin accounts`, 403);
    }
  }

  return true;
};

/**
 * Create a user invitation and send email
 * @param {number} adminUserId - ID of admin creating the invitation
 * @param {Object} invitationData - { email, role }
 * @returns {Promise<Object>} Invitation result
 */
export const createUserInvitation = async (adminUserId, invitationData) => {
  const {
    email: rawEmail,
    role: rawRole,
    location_ids: locationIds = [],
    delivery_mode: deliveryMode = 'email'
  } = invitationData;
  const email = String(rawEmail || '').trim().toLowerCase();
  const role = rawRole?.toLowerCase() || 'staff';
  const normalizedDeliveryMode = ['email', 'manual'].includes(deliveryMode) ? deliveryMode : 'email';
  if (!USER_ROLES.includes(role)) {
    throw createError(`Invalid role: ${rawRole}`, 422);
  }

  const User = dbStore.get('User');

  // Get admin user details
  const adminUser = await findVisibleUserById(User, adminUserId);
  if (!adminUser) {
    throw notFoundError('Admin user not found');
  }

  // Check admin has users:manage permission (unless Master Admin)
  if (!adminUser.is_master_admin && !hasPermission(adminUser, 'users:manage')) {
    throw createError('Missing users:manage permission', 403);
  }

  // Validate hierarchy (regular admin can't invite admin users)
  validateAdminHierarchy(adminUser, null, 'invite', role);

  // Check if email already exists
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser && !existingUser.deleted_at && !isReusableInvitationRow(existingUser)) {
    if (existingUser.invitation_status === 'pending') {
      throw createError('An invitation has already been sent to this email', 409);
    }
    throw createError('A user with this email already exists', 409);
  }

  const normalizedLocationIds = await validateActiveLocationIds(locationIds);

  // Generate invitation token
  const invitationToken = generateInvitationToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Get default permissions for role
  const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[role] || [];

  const tokenHash = hashInvitationToken(invitationToken);
  const inviteCore = {
    username: `pending_${Date.now()}`, // Temporary, will be updated on accept
    email,
    password_hash: 'PENDING_INVITATION', // Placeholder, will be set on accept
    role,
    permissions: defaultPermissions,
    is_active: false,
    invitation_token: tokenHash,
    invitation_expires_at: expiresAt,
    invited_by: adminUserId,
    invitation_status: 'pending',
    invitation_delivery_status: normalizedDeliveryMode === 'manual' ? 'manual_link' : 'not_configured',
    invitation_delivery_error: null,
    invitation_last_sent_at: null,
    invitation_accepted_at: null,
    invitation_cancelled_at: null,
    invitation_cancelled_by: null,
    deleted_at: null,
    deleted_by: null
  };

  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();
  let newUser;
  try {
    if (existingUser?.deleted_at || isReusableInvitationRow(existingUser)) {
      await existingUser.update(inviteCore, { transaction });
      newUser = existingUser;
    } else {
      newUser = await User.create(inviteCore, { transaction });
    }
    await replaceUserLocationGrants(newUser.user_id, normalizedLocationIds, transaction, adminUserId);
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }

  // Get tenant name for email
  const store = dbStore.getStore();
  const tenantName = store?.tenantName || 'SKUpervisor';
  const tenantId = String(store?.tenantId || '').trim() || null;

  try {
    await writeInvitationRegistryOrThrow({
      tenantId,
      tenantUserId: newUser.user_id,
      email,
      role,
      token: invitationToken,
      status: 'pending',
      deliveryStatus: normalizedDeliveryMode === 'manual' ? 'manual_link' : 'not_configured',
      invitedByUserId: adminUserId,
      invitedByName: adminUser.username,
      expiresAt
    });
  } catch (error) {
    const cancelledAt = new Date();
    await newUser.update({
      invitation_token: null,
      invitation_status: 'cancelled',
      invitation_delivery_status: 'failed',
      invitation_delivery_error: error.message,
      invitation_cancelled_at: cancelledAt,
      invitation_cancelled_by: adminUserId
    }).catch(() => {});
    throw error;
  }

  const delivery = normalizedDeliveryMode === 'manual'
    ? { emailSent: false, deliveryStatus: 'manual_link', deliveryError: null }
    : await resolveInviteDelivery({
      email,
      inviterName: adminUser.username,
      role,
      invitationToken,
      tenantName
    });

  const lastSentAt = delivery.emailSent ? new Date() : null;
  await newUser.update({
    invitation_delivery_status: delivery.deliveryStatus,
    invitation_delivery_error: delivery.deliveryError,
    invitation_last_sent_at: lastSentAt
  });

  if (tenantId && tenantId !== 'default') {
    await landlordService.updateInvitationRegistryByTenantUser({
      tenantId,
      tenantUserId: newUser.user_id,
      updates: {
        delivery_status: delivery.deliveryStatus,
        delivery_error: delivery.deliveryError,
        last_sent_at: lastSentAt
      }
    }).catch((registryError) => {
      logger.warn('[UserService] Failed to update invitation delivery status in registry', {
        tenantId,
        user_id: newUser.user_id,
        error: registryError.message
      });
    });
  }

  return {
    user_id: newUser.user_id,
    email: newUser.email,
    role: newUser.role,
    invitation_status: 'pending',
    expires_at: expiresAt,
    email_sent: delivery.emailSent,
    delivery_status: delivery.deliveryStatus,
    delivery_error: delivery.deliveryError,
    invitation_url: !delivery.emailSent ? buildInviteAcceptanceUrl({ token: invitationToken }) : undefined,
    invitation_token: !delivery.emailSent ? invitationToken : undefined
  };
};

/**
 * Accept an invitation and create the user account
 * @param {string} token - Invitation token
 * @param {Object} userData - { username, password }
 * @returns {Promise<Object>} User data with JWT token
 */
export const acceptInvitation = async (token, userData) => {
  const { username, password } = userData;

  const User = dbStore.get('User');
  const tokenHash = hashInvitationToken(token);

  // Find user by invitation token
  const user = await User.findOne({
    where: {
      [Op.or]: [
        { invitation_token: tokenHash },
        { invitation_token: token }
      ],
      invitation_status: 'pending'
    }
  });

  if (!user) {
    throw createError('Invalid or expired invitation token', 400);
  }

  // Check if invitation has expired
  if (new Date() > new Date(user.invitation_expires_at)) {
    await user.update({ invitation_status: 'expired' });
    const tenantId = dbStore.getStore()?.tenantId;
    if (tenantId) {
      await landlordService.updateInvitationRegistryByTenantUser({
        tenantId,
        tenantUserId: user.user_id,
        updates: { status: 'expired' }
      }).catch(() => {});
    }
    throw createError('Invitation has expired. Please request a new invitation.', 400);
  }

  // Check username uniqueness
  const existingUsername = await User.findOne({
    where: {
      username,
      user_id: { [Op.ne]: user.user_id }
    }
  });

  if (existingUsername) {
    throw createError('Username is already taken', 409);
  }

  // Hash password
  const password_hash = await hashPassword(password);

  // Update user record
  await user.update({
    username,
    password_hash,
    is_active: true,
    invitation_token: null,
    invitation_status: 'accepted',
    invitation_accepted_at: new Date()
  });

  // Add email-tenant mapping
  const store = dbStore.getStore();
  const tenantId = store?.tenantId;
  if (tenantId) {
    try {
      await landlordService.addEmailTenantMapping(user.email, tenantId);
    } catch (mappingError) {
      console.warn('Failed to add email-tenant mapping:', mappingError.message);
    }
    await landlordService.updateInvitationRegistryByTenantUser({
      tenantId,
      tenantUserId: user.user_id,
      updates: {
        status: 'accepted',
        accepted_at: new Date()
      }
    }).catch(() => {});
  }

  if (emailService.isEmailConfigured()) {
    emailService.sendWelcomeEmail({
      email: user.email,
      username: user.username,
      role: user.role,
      tenantName: dbStore.getStore()?.tenantName || 'SKUpervisor'
    }).catch((error) => logger.warn('[UserService] Failed to send welcome email', {
      user_id: user.user_id,
      error: error.message
    }));
  }

  const tokenTenantId = String(tenantId || '').trim();
  const authToken = generateToken(user, { tenantId: tokenTenantId });
  const refreshToken = generateRefreshToken(user, { tenantId: tokenTenantId });

  return {
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    is_master_admin: user.is_master_admin,
    token: authToken,
    refreshToken,
    expiresIn: 24 * 60 * 60,
    company: {
      id: tenantId || null,
      name: dbStore.getStore()?.tenantName || null,
      token: dbStore.getStore()?.tenantToken || null
    }
  };
};

/**
 * Validate an invitation token (for frontend pre-check)
 * @param {string} token - Invitation token
 * @returns {Promise<Object>} Invitation details
 */
export const validateInvitationToken = async (token) => {
  const User = dbStore.get('User');
  const tokenHash = hashInvitationToken(token);

  const user = await User.findOne({
    where: {
      [Op.or]: [
        { invitation_token: tokenHash },
        { invitation_token: token }
      ],
      invitation_status: 'pending'
    },
    attributes: ['user_id', 'email', 'role', 'invitation_expires_at', 'invited_by']
  });

  if (!user) {
    throw createError('Invalid invitation token', 400);
  }

  if (new Date() > new Date(user.invitation_expires_at)) {
    await user.update({ invitation_status: 'expired' });
    const tenantId = dbStore.getStore()?.tenantId;
    if (tenantId) {
      await landlordService.updateInvitationRegistryByTenantUser({
        tenantId,
        tenantUserId: user.user_id,
        updates: { status: 'expired' }
      }).catch(() => {});
    }
    throw createError('Invitation has expired', 400);
  }

  const registryInvitation = await landlordService.findInvitationByToken(token, { status: 'pending' }).catch(() => null);
  let inviterName = registryInvitation?.invited_by_name || null;
  if (!inviterName && user.invited_by) {
    const inviter = await User.findByPk(user.invited_by, { attributes: ['username'] }).catch(() => null);
    inviterName = inviter?.username || null;
  }

  return {
    email: user.email,
    role: user.role,
    expires_at: user.invitation_expires_at,
    tenantName: dbStore.getStore()?.tenantName || null,
    inviter_user_id: user.invited_by || null,
    inviter_name: inviterName
  };
};

export const resendUserInvitation = async (adminUserId, targetUserId) => {
  const User = dbStore.get('User');
  const [adminUser, inviteUser] = await Promise.all([
    findVisibleUserById(User, adminUserId),
    findVisibleUserById(User, targetUserId)
  ]);

  if (!adminUser) throw notFoundError('Admin user not found');
  if (!inviteUser || !RECOVERABLE_INVITATION_STATUSES.has(String(inviteUser.invitation_status || '').toLowerCase())) {
    throw createError('Recoverable invitation not found', 404);
  }
  if (!adminUser.is_master_admin && !hasPermission(adminUser, 'users:manage')) {
    throw createError('Missing users:manage permission', 403);
  }
  validateAdminHierarchy(adminUser, null, 'resend invitation for', inviteUser.role);

  const invitationToken = generateInvitationToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const tenantName = dbStore.getStore()?.tenantName || 'SKUpervisor';
  const tenantId = dbStore.getStore()?.tenantId;
  const previousInvitationState = {
    invitation_token: inviteUser.invitation_token,
    invitation_expires_at: inviteUser.invitation_expires_at,
    invitation_status: inviteUser.invitation_status,
    invitation_delivery_status: inviteUser.invitation_delivery_status,
    invitation_delivery_error: inviteUser.invitation_delivery_error,
    invitation_last_sent_at: inviteUser.invitation_last_sent_at,
    invitation_cancelled_at: inviteUser.invitation_cancelled_at,
    invitation_cancelled_by: inviteUser.invitation_cancelled_by
  };

  await inviteUser.update({
    invitation_token: hashInvitationToken(invitationToken),
    invitation_expires_at: expiresAt,
    invitation_status: 'pending',
    invitation_delivery_status: 'not_configured',
    invitation_delivery_error: null,
    invitation_last_sent_at: null,
    invitation_cancelled_at: null,
    invitation_cancelled_by: null
  });

  try {
    await writeInvitationRegistryOrThrow({
      tenantId,
      tenantUserId: inviteUser.user_id,
      email: inviteUser.email,
      role: inviteUser.role,
      token: invitationToken,
      status: 'pending',
      deliveryStatus: 'not_configured',
      invitedByUserId: adminUserId,
      invitedByName: adminUser.username,
      expiresAt
    });
  } catch (error) {
    await inviteUser.update(previousInvitationState).catch(() => {});
    throw error;
  }

  const delivery = await resolveInviteDelivery({
    email: inviteUser.email,
    inviterName: adminUser.username,
    role: inviteUser.role,
    invitationToken,
    tenantName
  });
  const lastSentAt = delivery.emailSent ? new Date() : null;

  await inviteUser.update({
    invitation_delivery_status: delivery.deliveryStatus,
    invitation_delivery_error: delivery.deliveryError,
    invitation_last_sent_at: lastSentAt
  });

  if (tenantId && tenantId !== 'default') {
    await landlordService.updateInvitationRegistryByTenantUser({
      tenantId,
      tenantUserId: inviteUser.user_id,
      updates: {
        delivery_status: delivery.deliveryStatus,
        delivery_error: delivery.deliveryError,
        last_sent_at: lastSentAt
      }
    }).catch(() => {});
  }

  return {
    user_id: inviteUser.user_id,
    email: inviteUser.email,
    role: inviteUser.role,
    expires_at: expiresAt,
    email_sent: delivery.emailSent,
    delivery_status: delivery.deliveryStatus,
    delivery_error: delivery.deliveryError,
    invitation_url: !delivery.emailSent ? buildInviteAcceptanceUrl({ token: invitationToken }) : undefined,
    invitation_token: !delivery.emailSent ? invitationToken : undefined
  };
};

export const createInvitationManualLink = async (adminUserId, targetUserId) => {
  const User = dbStore.get('User');
  const [adminUser, inviteUser] = await Promise.all([
    findVisibleUserById(User, adminUserId),
    findVisibleUserById(User, targetUserId)
  ]);

  if (!adminUser) throw notFoundError('Admin user not found');
  if (!inviteUser || !RECOVERABLE_INVITATION_STATUSES.has(String(inviteUser.invitation_status || '').toLowerCase())) {
    throw createError('Recoverable invitation not found', 404);
  }
  if (!adminUser.is_master_admin && !hasPermission(adminUser, 'users:manage')) {
    throw createError('Missing users:manage permission', 403);
  }
  validateAdminHierarchy(adminUser, null, 'create invitation link for', inviteUser.role);

  const invitationToken = generateInvitationToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const previousInvitationState = {
    invitation_token: inviteUser.invitation_token,
    invitation_expires_at: inviteUser.invitation_expires_at,
    invitation_status: inviteUser.invitation_status,
    invitation_delivery_status: inviteUser.invitation_delivery_status,
    invitation_delivery_error: inviteUser.invitation_delivery_error,
    invitation_cancelled_at: inviteUser.invitation_cancelled_at,
    invitation_cancelled_by: inviteUser.invitation_cancelled_by
  };

  await inviteUser.update({
    invitation_token: hashInvitationToken(invitationToken),
    invitation_expires_at: expiresAt,
    invitation_status: 'pending',
    invitation_delivery_status: 'manual_link',
    invitation_delivery_error: null,
    invitation_cancelled_at: null,
    invitation_cancelled_by: null
  });

  const tenantId = dbStore.getStore()?.tenantId;
  try {
    await writeInvitationRegistryOrThrow({
      tenantId,
      tenantUserId: inviteUser.user_id,
      email: inviteUser.email,
      role: inviteUser.role,
      token: invitationToken,
      status: 'pending',
      deliveryStatus: 'manual_link',
      invitedByUserId: adminUserId,
      invitedByName: adminUser.username,
      expiresAt
    });
  } catch (error) {
    await inviteUser.update(previousInvitationState).catch(() => {});
    throw error;
  }

  return {
    user_id: inviteUser.user_id,
    email: inviteUser.email,
    role: inviteUser.role,
    expires_at: expiresAt,
    delivery_status: 'manual_link',
    invitation_url: buildInviteAcceptanceUrl({ token: invitationToken }),
    invitation_token: invitationToken
  };
};

export const cancelUserInvitation = async (adminUserId, targetUserId) => {
  const User = dbStore.get('User');
  const [adminUser, inviteUser] = await Promise.all([
    findVisibleUserById(User, adminUserId),
    findVisibleUserById(User, targetUserId)
  ]);

  if (!adminUser) throw notFoundError('Admin user not found');
  if (!inviteUser || inviteUser.invitation_status !== 'pending') {
    throw createError('Pending invitation not found', 404);
  }
  if (!adminUser.is_master_admin && !hasPermission(adminUser, 'users:manage')) {
    throw createError('Missing users:manage permission', 403);
  }
  validateAdminHierarchy(adminUser, null, 'cancel invitation for', inviteUser.role);

  const cancelledAt = new Date();
  await inviteUser.update({
    invitation_token: null,
    invitation_status: 'cancelled',
    invitation_cancelled_at: cancelledAt,
    invitation_cancelled_by: adminUserId,
    is_active: false
  });

  const tenantId = dbStore.getStore()?.tenantId;
  if (tenantId) {
    await landlordService.updateInvitationRegistryByTenantUser({
      tenantId,
      tenantUserId: inviteUser.user_id,
      updates: {
        status: 'cancelled',
        cancelled_at: cancelledAt,
        cancelled_by_user_id: adminUserId
      }
    }).catch(() => {});
  }

  return {
    user_id: inviteUser.user_id,
    email: inviteUser.email,
    invitation_status: 'cancelled'
  };
};

// ============== AI-SPECIFIC USER MANAGEMENT ==============

/**
 * Update user permissions with full hierarchy and safety checks (for AI)
 * @param {number} adminUserId - ID of admin performing action
 * @param {number} targetUserId - ID of user to update
 * @param {Array} permissions - List of permission strings
 * @returns {Promise<Object>} Updated user data
 */
export const updateUserPermissionsAI = async (adminUserId, targetUserId, permissions) => {
  const User = dbStore.get('User');

  // Block self-modification
  if (adminUserId === parseInt(targetUserId)) {
    throw createError('Cannot modify your own permissions', 403);
  }

  const [adminUser, targetUser] = await Promise.all([
    findVisibleUserById(User, adminUserId),
    findVisibleUserById(User, targetUserId)
  ]);

  if (!adminUser) {
    throw notFoundError('Admin user not found');
  }

  if (!targetUser) {
    throw notFoundError('Target user not found');
  }

  // Check admin has users:manage permission (unless Master Admin)
  if (!adminUser.is_master_admin && !hasPermission(adminUser, 'users:manage')) {
    throw createError('Missing users:manage permission', 403);
  }

  assertAcceptedUserEditable(targetUser, 'change permissions');

  // Validate hierarchy
  validateAdminHierarchy(adminUser, targetUser, 'modify permissions for');

  // Validate permissions array
  if (!Array.isArray(permissions)) {
    throw createError('Permissions must be an array', 400);
  }

  await targetUser.update({ permissions });
  await targetUser.reload();

  return {
    user_id: targetUser.user_id,
    username: targetUser.username,
    email: targetUser.email,
    role: targetUser.role,
    permissions: targetUser.permissions,
    permission_count: targetUser.permissions?.length || 0,
    is_master_admin: targetUser.is_master_admin
  };
};

/**
 * Get users for CSV export (excludes pending invitations)
 * @returns {Promise<Array>} Users formatted for export
 */
export const getUsersForExport = async () => {
  const User = dbStore.get('User');

  const users = await User.findAll({
    attributes: ['user_id', 'username', 'email', 'role', 'is_active', 'permissions', 'is_master_admin', 'created_at', 'last_login'],
    where: buildVisibleWhere({
      [Op.or]: [
        { invitation_status: null },
        { invitation_status: 'accepted' }
      ]
    }),
    order: [['created_at', 'DESC']]
  });

  return users.map(u => ({
    user_id: u.user_id,
    username: u.username,
    email: u.email,
    role: u.role,
    is_active: u.is_active ? 'Yes' : 'No',
    permission_count: resolveEffectivePermissions(u).length,
    is_master_admin: u.is_master_admin ? 'Yes' : 'No',
    created_at: u.created_at ? new Date(u.created_at).toISOString().split('T')[0] : '',
    last_login: u.last_login ? new Date(u.last_login).toISOString().split('T')[0] : 'Never'
  }));
};

/**
 * Import users from CSV data (creates invitations)
 * @param {Array} userData - Array of { email, role }
 * @param {number} adminUserId - ID of admin performing import
 * @returns {Promise<Object>} Import results
 */
export const importUsersFromCSV = async (userData, adminUserId) => {
  const results = {
    invited: [],
    skipped: [],
    errors: []
  };

  for (const row of userData) {
    try {
      // Normalize role
      const role = (row.role || 'staff').toLowerCase().trim();
      if (!USER_ROLES.includes(role)) {
        results.errors.push({
          email: row.email,
          error: `Invalid role: ${row.role}. Must be one of: ${USER_ROLES.join(', ')}.`
        });
        continue;
      }

      const result = await createUserInvitation(adminUserId, {
        email: row.email.trim(),
        role
      });

      results.invited.push({
        email: row.email,
        role,
        email_sent: result.email_sent,
        delivery_status: result.delivery_status,
        delivery_error: result.delivery_error || null,
        invitation_url: result.invitation_url || null
      });
    } catch (error) {
      if (error.statusCode === 409) {
        results.skipped.push({
          email: row.email,
          reason: error.message
        });
      } else if (error.statusCode === 403) {
        results.errors.push({
          email: row.email,
          error: error.message
        });
      } else {
        results.errors.push({
          email: row.email,
          error: error.message || 'Unknown error'
        });
      }
    }
  }

  return results;
};

/**
 * Get user by email (helper for AI tools)
 * @param {string} email
 * @returns {Promise<Object>} User object or null
 */
export const getUserByEmail = async (email) => {
  const User = dbStore.get('User');
  return await User.findOne({
    where: buildVisibleWhere({ email })
  });
};

/**
 * Get user by username (helper for AI tools)
 * @param {string} username
 * @returns {Promise<Object>} User object or null
 */
export const getUserByUsername = async (username) => {
  const User = dbStore.get('User');
  return await User.findOne({
    where: buildVisibleWhere({ username })
  });
};
