import express from 'express';
import * as userController from '../controllers/userController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateUpdateProfile,
  validateChangePassword,
  validateUpdateUserRole,
  validateUpdateUserStatus
} from '../validators/userValidator.js';

const router = express.Router();

// Current user endpoints (authenticated users only)
router.get('/me', authenticate, userController.getCurrentUser);
router.put('/me', authenticate, validateUpdateProfile, userController.updateProfile);
router.put('/me/password', authenticate, validateChangePassword, userController.changePassword);

// Admin-only user management endpoints
router.get('/', authenticate, authorize('admin', 'manager'), userController.getAllUsers); // Allow manager to view list? Or stick to admin? Old code said admin.
router.put('/:user_id/role', authenticate, authorize('admin'), validateUpdateUserRole, userController.updateUserRole);
router.put('/:user_id/status', authenticate, authorize('admin'), validateUpdateUserStatus, userController.updateUserStatus);
router.put('/:user_id/permissions', authenticate, authorize('admin'), userController.updateUserPermissions); // Allow admin (who will be checked for Master status in service) or use explicit permission?
// Better to strictly require admin here as entry gate, logic inside handles Master check.

// Invite new user (admin only)
router.post('/invite', authenticate, authorize('admin'), userController.inviteUser);

// Remove user from company (soft delete with hierarchical access control)
router.delete('/:user_id', authenticate, authorize('admin', 'manager'), userController.removeUserFromCompany);

export default router;
