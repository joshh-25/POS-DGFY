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
router.get('/', authenticate, authorize('admin'), userController.getAllUsers);
router.put('/:user_id/role', authenticate, authorize('admin'), validateUpdateUserRole, userController.updateUserRole);
router.put('/:user_id/status', authenticate, authorize('admin'), validateUpdateUserStatus, userController.updateUserStatus);

export default router;
