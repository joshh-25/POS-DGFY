import express from 'express';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import * as handlers from '../modules/staff/controllers/staffHandlers.js';
import {
  validateStaffRoleBody,
  validateStaffRoleStatus,
  validateStaffRoleId,
  validateStaffUserId,
  validateStaffRoleAssignment,
  validateStaffRoleQuery
} from '../validators/staffRoleValidator.js';

const router = express.Router();
const manage = [authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS)];
router.get('/', authenticate, checkPermission(PERMISSIONS.SYSTEM.actions.MANAGE_USERS), validateStaffRoleQuery, handlers.listStaffRoles);
router.post('/', ...manage, validateStaffRoleBody, handlers.createStaffRole);
router.get('/:staffRoleId', ...manage, validateStaffRoleId, handlers.getStaffRole);
router.put('/:staffRoleId', ...manage, validateStaffRoleId, validateStaffRoleBody, handlers.updateStaffRole);
router.put('/:staffRoleId/status', ...manage, validateStaffRoleId, validateStaffRoleStatus, handlers.setStaffRoleStatus);
router.put('/users/:userId', ...manage, validateStaffUserId, validateStaffRoleAssignment, handlers.assignStaffRole);

export default router;
