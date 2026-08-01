import express from 'express';
import { authenticateAdmin, requirePlatformMaster } from '../middleware/auth.js';
import {
  createPlatformAdmin,
  deletePlatformAdmin,
  listPlatformAdmins,
  platformAdminReadiness,
  reactivatePlatformAdmin,
  resetPlatformAdminPassword,
  suspendPlatformAdmin,
  updatePlatformAdminPermissions
} from '../modules/platformAdmin/controllers/platformAdminUserHandlers.js';

const router = express.Router();
router.use(authenticateAdmin, requirePlatformMaster);
router.get('/', listPlatformAdmins);
router.get('/readiness', platformAdminReadiness);
router.post('/', createPlatformAdmin);
router.patch('/:adminId/permissions', updatePlatformAdminPermissions);
router.post('/:adminId/suspend', suspendPlatformAdmin);
router.post('/:adminId/reactivate', reactivatePlatformAdmin);
router.post('/:adminId/reset-password', resetPlatformAdminPassword);
router.delete('/:adminId', deletePlatformAdmin);
export default router;
