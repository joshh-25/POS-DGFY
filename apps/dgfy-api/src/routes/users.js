import express from 'express';
import * as userController from '../controllers/userController.js';
import { authenticate, checkPermission, requireTenantCapability } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
  emailOtpLimiter,
} from '../middleware/rateLimiter.js';
import {
  validateUpdateProfile,
  validateChangePassword,
  validateResetLocalCashierPassword,
  validateProvisionCashierFromGmail,
  validateUpdateUserRole,
  validateUpdateUserStatus,
  validateUpdateUserPermissions,
  validateUpdatePosApprovalPin,
  validateUpdatePosDayClosePin,
  validateInviteUser,
  validateUpdateUserLocationGrants,
  validateEmailChangeOtpRequest
} from '../validators/userValidator.js';

const router = express.Router();

// Current user endpoints (authenticated users only)
router.get('/me', authenticate, userController.getCurrentUser);
router.post('/me/email-otp/request', authenticate, emailOtpLimiter, validateEmailChangeOtpRequest, userController.requestEmailChangeOtp);
router.put('/me', authenticate, validateUpdateProfile, userController.updateProfile);
router.put('/me/password', authenticate, validateChangePassword, userController.changePassword);

// Admin-only user management endpoints
router.use(requireTenantCapability('tenant_ims_enabled', 'IMS'));
router.get('/', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.VIEW_USERS), userController.getAllUsers);
router.get('/role-catalog', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.VIEW_USERS), userController.getRoleCatalog);
router.put('/:user_id/role', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateUpdateUserRole, userController.updateUserRole);
router.put('/:user_id/status', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateUpdateUserStatus, userController.updateUserStatus);
router.put('/:user_id/permissions', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateUpdateUserPermissions, userController.updateUserPermissions);
router.put('/:user_id/pos-approval-pin', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateUpdatePosApprovalPin, userController.updatePosApprovalPin);
router.put('/:user_id/pos-day-close-pin', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateUpdatePosDayClosePin, userController.updatePosDayClosePin);
router.put('/:user_id/password', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateResetLocalCashierPassword, userController.resetLocalCashierPassword);
router.post('/cashier-provision', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateProvisionCashierFromGmail, userController.provisionCashierFromGmail);
router.get('/:user_id/location-grants', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), userController.getUserLocationGrants);
router.put('/:user_id/location-grants', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateUpdateUserLocationGrants, userController.updateUserLocationGrants);
// Better to strictly require admin here as entry gate, logic inside handles Master check.

// Invite new user (admin only)
router.post('/invite', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateInviteUser, userController.inviteUser);
router.post('/:user_id/invitation/resend', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), userController.resendUserInvitation);
router.post('/:user_id/invitation/link', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), userController.createInvitationManualLink);
router.delete('/:user_id/invitation', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), userController.cancelUserInvitation);

// Remove user from company (soft delete with hierarchical access control)
router.delete('/:user_id', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.DELETE_USERS), userController.removeUserFromCompany);

export default router;
