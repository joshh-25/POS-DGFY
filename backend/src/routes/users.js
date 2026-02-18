import express from 'express';
import * as userController from '../controllers/userController.js';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
  validateUpdateProfile,
  validateChangePassword,
  validateUpdateUserRole,
  validateUpdateUserStatus,
  validateUpdateUserPermissions,
  validateInviteUser
} from '../validators/userValidator.js';

const router = express.Router();

// Current user endpoints (authenticated users only)
router.get('/me', authenticate, userController.getCurrentUser);
router.put('/me', authenticate, validateUpdateProfile, userController.updateProfile);
router.put('/me/password', authenticate, validateChangePassword, userController.changePassword);

// Admin-only user management endpoints
router.get('/', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.VIEW_USERS), userController.getAllUsers);
router.put('/:user_id/role', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateUpdateUserRole, userController.updateUserRole);
router.put('/:user_id/status', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateUpdateUserStatus, userController.updateUserStatus);
router.put('/:user_id/permissions', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateUpdateUserPermissions, userController.updateUserPermissions);
// Better to strictly require admin here as entry gate, logic inside handles Master check.

// Invite new user (admin only)
router.post('/invite', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateInviteUser, userController.inviteUser);

// Remove user from company (soft delete with hierarchical access control)
router.delete('/:user_id', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.DELETE_USERS), userController.removeUserFromCompany);

export default router;
