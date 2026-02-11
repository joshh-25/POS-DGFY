import * as userService from '../services/userService.js';

/**
 * Get current authenticated user's profile
 */
export const getCurrentUser = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    let user = await userService.getCurrentUser(userId);

    // If user is a Sequelize instance, convert to JSON
    if (user && typeof user.toJSON === 'function') {
      user = user.toJSON();
    }

    // Add company/tenant info from request context (set by tenantHandler)
    if (req.tenant) {
      user.company = {
        id: req.tenant.id,
        name: req.tenant.name,
        plan: req.tenant.plan,
        subscription_status: req.tenant.subscription_status,
        current_period_end: req.tenant.current_period_end
      };
    }

    res.status(200).json({
      success: true,
      data: user,
      message: 'User profile retrieved successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update current user's profile (username, email)
 */
export const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const updateData = req.validatedData;

    const result = await userService.updateUserProfile(userId, updateData);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Profile updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Map specific errors to appropriate status codes
    if (error.message.includes('already in use')) {
      error.statusCode = 409;
    }
    next(error);
  }
};

/**
 * Change current user's password
 */
export const changePassword = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const { currentPassword, newPassword } = req.validatedData;

    await userService.changePassword(userId, currentPassword, newPassword);

    res.status(200).json({
      success: true,
      data: null,
      message: 'Password changed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Map password verification errors
    if (error.message.includes('incorrect')) {
      error.statusCode = 401;
    }
    next(error);
  }
};

/**
 * Get all users (admin only)
 */
export const getAllUsers = async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();

    res.status(200).json({
      success: true,
      data: users,
      message: 'Users retrieved successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user role (admin only)
 */
export const updateUserRole = async (req, res, next) => {
  try {
    const adminUserId = req.user.user_id;
    const targetUserId = req.params.user_id;
    const roleData = req.validatedData;

    const result = await userService.updateUserRole(adminUserId, targetUserId, roleData);

    res.status(200).json({
      success: true,
      data: result,
      message: 'User role updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user active status (admin only)
 */
export const updateUserStatus = async (req, res, next) => {
  try {
    const adminUserId = req.user.user_id;
    const targetUserId = req.params.user_id;
    const { is_active } = req.validatedData;

    const result = await userService.toggleUserStatus(adminUserId, targetUserId, is_active);

    res.status(200).json({
      success: true,
      data: result,
      message: `User ${is_active ? 'activated' : 'deactivated'} successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user permissions (Master Admin only)
 */
export const updateUserPermissions = async (req, res, next) => {
  try {
    const adminUserId = req.user.user_id;
    const targetUserId = req.params.user_id;
    const { permissions, is_master_admin } = req.body;

    // permissions should be an array of strings
    if (permissions && !Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: 'Permissions must be an array of strings'
      });
    }

    const result = await userService.updateUserPermissions(adminUserId, targetUserId, permissions, is_master_admin);

    res.status(200).json({
      success: true,
      data: result,
      message: 'User permissions updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Invite a new user (admin only)
 */
export const inviteUser = async (req, res, next) => {
  try {
    const adminUserId = req.user.user_id;
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({
        success: false,
        message: 'Email and role are required'
      });
    }

    const result = await userService.createUserInvitation(adminUserId, { email, role });

    res.status(201).json({
      success: true,
      data: result,
      message: 'User invitation created successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove user from company (soft delete with hierarchical access control)
 */
export const removeUserFromCompany = async (req, res, next) => {
  try {
    const adminUserId = req.user.user_id;
    const targetUserId = req.params.user_id;

    const result = await userService.removeUserFromCompany(adminUserId, targetUserId);

    res.status(200).json({
      success: true,
      data: result,
      message: 'User has been removed from the company',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};
