import { Op } from 'sequelize';
import User from '../models/User.js';
import { hashPassword, comparePassword, generateToken } from './authService.js';

/**
 * Get current user profile by user ID
 * @param {number} userId - User ID from authenticated request
 * @returns {Promise<Object>} User profile data
 */
export const getCurrentUser = async (userId) => {
  const user = await User.findByPk(userId, {
    attributes: ['user_id', 'username', 'email', 'role', 'is_active', 'last_login', 'created_at']
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
    created_at: user.created_at
  };
};

/**
 * Update user profile (username, email)
 * @param {number} userId - User ID from authenticated request
 * @param {Object} updateData - Data to update { username, email }
 * @returns {Promise<Object>} Updated user data with new token if needed
 */
export const updateUserProfile = async (userId, updateData) => {
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

  // Update user
  await user.update(updateData);

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
 * @returns {Promise<Array>} List of all users
 */
export const getAllUsers = async () => {
  const users = await User.findAll({
    attributes: ['user_id', 'username', 'email', 'role', 'is_active', 'last_login', 'created_at'],
    order: [['created_at', 'DESC']]
  });

  return users.map(user => ({
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    last_login: user.last_login,
    created_at: user.created_at
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

  const targetUser = await User.findByPk(targetUserId);

  if (!targetUser) {
    const error = new Error('Target user not found');
    error.statusCode = 404;
    throw error;
  }

  await targetUser.update({ role: roleData.role });

  return {
    user_id: targetUser.user_id,
    username: targetUser.username,
    email: targetUser.email,
    role: targetUser.role,
    is_active: targetUser.is_active
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

  const targetUser = await User.findByPk(targetUserId);

  if (!targetUser) {
    const error = new Error('Target user not found');
    error.statusCode = 404;
    throw error;
  }

  await targetUser.update({ is_active: isActive });

  return {
    user_id: targetUser.user_id,
    username: targetUser.username,
    email: targetUser.email,
    role: targetUser.role,
    is_active: targetUser.is_active
  };
};
