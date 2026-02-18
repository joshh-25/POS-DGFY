import { Op } from 'sequelize';
import crypto from 'crypto';
import dbStore from '../utils/dbStore.js';
import { hashPassword, comparePassword, generateToken, generateRefreshToken } from './authService.js';
import * as landlordService from './landlordService.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../config/permissions.js';
import * as emailService from './emailService.js';

/**
 * Get current user profile by user ID
 * @param {number} userId - User ID from authenticated request
 * @returns {Promise<Object>} User profile data
 */
export const getCurrentUser = async (userId) => {
  const User = dbStore.get('User');
  const user = await User.findByPk(userId, {
    attributes: ['user_id', 'username', 'email', 'role', 'is_active', 'last_login', 'created_at', 'permissions', 'is_master_admin']
  });

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    last_login: user.last_login,
    created_at: user.created_at,
    permissions: user.permissions || [],
    is_master_admin: user.is_master_admin
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
  const user = await User.findByPk(userId);

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
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
  const user = await User.findByPk(userId);

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
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
export const getAllUsers = async () => {
  const User = dbStore.get('User');
  const users = await User.findAll({
    attributes: ['user_id', 'username', 'email', 'role', 'is_active', 'last_login', 'created_at', 'permissions', 'is_master_admin'],
    where: {
      deleted_at: null  // Exclude removed users
    },
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
    permissions: user.permissions || [],
    is_master_admin: user.is_master_admin
  }));
};

/**
 * Update user role (admin only)
 * @param {number} adminUserId - ID of admin performing the action
 * @param {number} targetUserId - ID of user to update
 * @param {Object} roleData - { role: 'admin' | 'manager' | 'staff' }
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
  const targetUser = await User.findByPk(targetUserId);

  if (!targetUser) {
    const error = new Error('Target user not found');
    error.statusCode = 404;
    throw error;
  }

  // Get default permissions for the new role
  const normalizedRole = roleData.role?.toLowerCase();
  const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[normalizedRole] || [];

  // Build update data
  const updateData = {
    role: normalizedRole,
    permissions: defaultPermissions
  };

  // Reset master admin flag if demoting from admin
  if (roleData.role !== 'admin') {
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
  const targetUser = await User.findByPk(targetUserId);

  if (!targetUser) {
    const error = new Error('Target user not found');
    error.statusCode = 404;
    throw error;
  }

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

// Role hierarchy for permission checks (higher number = higher rank)
const ROLE_HIERARCHY = { admin: 3, manager: 2, staff: 1 };

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
    User.findByPk(adminUserId),
    User.findByPk(targetUserId)
  ]);

  if (!adminUser) {
    const error = new Error('Admin user not found');
    error.statusCode = 404;
    throw error;
  }

  if (!targetUser) {
    const error = new Error('Target user not found');
    error.statusCode = 404;
    throw error;
  }

  // Check if user is already removed
  if (targetUser.deleted_at) {
    const error = new Error('User has already been removed from the company');
    error.statusCode = 400;
    throw error;
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
  const adminUser = await User.findByPk(adminUserId);
  if (!adminUser || !adminUser.is_master_admin) {
    const error = new Error('Only Master Admins can manage permissions');
    error.statusCode = 403;
    throw error;
  }

  const targetUser = await User.findByPk(targetUserId);
  if (!targetUser) {
    const error = new Error('Target user not found');
    error.statusCode = 404;
    throw error;
  }

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

// ============== INVITATION SYSTEM ==============

/**
 * Generate a secure invitation token
 * @returns {string} 64-character hex token
 */
const generateInvitationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Helper function to create standardized errors
 */
const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
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
  if (!targetUser && targetRole === 'admin') {
    throw createError('Only Master Admin can invite Admin users', 403);
  }

  // For existing users:
  if (targetUser) {
    // Cannot modify Master Admins
    if (targetUser.is_master_admin) {
      throw createError(`Only Master Admin can ${action} Master Admin accounts`, 403);
    }

    // Cannot modify other Admins
    if (targetUser.role === 'admin') {
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
  const { email, role: rawRole } = invitationData;
  const role = rawRole?.toLowerCase() || 'staff';

  const User = dbStore.get('User');

  // Get admin user details
  const adminUser = await User.findByPk(adminUserId);
  if (!adminUser) {
    throw createError('Admin user not found', 404);
  }

  // Check admin has users:manage permission (unless Master Admin)
  if (!adminUser.is_master_admin && !adminUser.permissions?.includes('users:manage')) {
    throw createError('Missing users:manage permission', 403);
  }

  // Validate hierarchy (regular admin can't invite admin users)
  validateAdminHierarchy(adminUser, null, 'invite', role);

  // Check if email already exists
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    if (existingUser.invitation_status === 'pending') {
      throw createError('An invitation has already been sent to this email', 409);
    }
    throw createError('A user with this email already exists', 409);
  }

  // Generate invitation token
  const invitationToken = generateInvitationToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Get default permissions for role
  const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[role] || [];

  // Create pending user record
  const newUser = await User.create({
    username: `pending_${Date.now()}`, // Temporary, will be updated on accept
    email,
    password_hash: 'PENDING_INVITATION', // Placeholder, will be set on accept
    role,
    permissions: defaultPermissions,
    is_active: false,
    invitation_token: invitationToken,
    invitation_expires_at: expiresAt,
    invited_by: adminUserId,
    invitation_status: 'pending'
  });

  // Get tenant name for email
  const store = dbStore.getStore();
  const tenantName = store?.tenantName || 'SKU Inventory Manager';

  // Send invitation email (if email service is configured)
  let emailSent = false;
  if (emailService.isEmailConfigured()) {
    try {
      await emailService.sendInvitationEmail({
        email,
        inviterName: adminUser.username,
        role,
        invitationToken,
        tenantName
      });
      emailSent = true;
    } catch (emailError) {
      console.warn('Failed to send invitation email:', emailError.message);
      // Don't fail the invitation creation, just note email wasn't sent
    }
  }

  return {
    user_id: newUser.user_id,
    email: newUser.email,
    role: newUser.role,
    invitation_status: 'pending',
    expires_at: expiresAt,
    email_sent: emailSent,
    invitation_token: emailSent ? undefined : invitationToken // Only return token if email failed
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

  // Find user by invitation token
  const user = await User.findOne({
    where: {
      invitation_token: token,
      invitation_status: 'pending'
    }
  });

  if (!user) {
    throw createError('Invalid or expired invitation token', 400);
  }

  // Check if invitation has expired
  if (new Date() > new Date(user.invitation_expires_at)) {
    await user.update({ invitation_status: 'expired' });
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
    invitation_status: 'accepted'
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
  }

  return {
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    is_master_admin: user.is_master_admin
  };
};

/**
 * Validate an invitation token (for frontend pre-check)
 * @param {string} token - Invitation token
 * @returns {Promise<Object>} Invitation details
 */
export const validateInvitationToken = async (token) => {
  const User = dbStore.get('User');

  const user = await User.findOne({
    where: {
      invitation_token: token,
      invitation_status: 'pending'
    },
    attributes: ['email', 'role', 'invitation_expires_at']
  });

  if (!user) {
    throw createError('Invalid invitation token', 400);
  }

  if (new Date() > new Date(user.invitation_expires_at)) {
    throw createError('Invitation has expired', 400);
  }

  return {
    email: user.email,
    role: user.role,
    expires_at: user.invitation_expires_at
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
    User.findByPk(adminUserId),
    User.findByPk(targetUserId)
  ]);

  if (!adminUser) {
    throw createError('Admin user not found', 404);
  }

  if (!targetUser) {
    throw createError('Target user not found', 404);
  }

  // Check admin has users:manage permission (unless Master Admin)
  if (!adminUser.is_master_admin && !adminUser.permissions?.includes('users:manage')) {
    throw createError('Missing users:manage permission', 403);
  }

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
    where: {
      [Op.or]: [
        { invitation_status: null },
        { invitation_status: 'accepted' }
      ]
    },
    order: [['created_at', 'DESC']]
  });

  return users.map(u => ({
    user_id: u.user_id,
    username: u.username,
    email: u.email,
    role: u.role,
    is_active: u.is_active ? 'Yes' : 'No',
    permission_count: u.permissions?.length || 0,
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
      if (!['staff', 'manager', 'admin'].includes(role)) {
        results.errors.push({
          email: row.email,
          error: `Invalid role: ${row.role}. Must be staff, manager, or admin.`
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
        email_sent: result.email_sent
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
    where: { email }
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
    where: { username }
  });
};
