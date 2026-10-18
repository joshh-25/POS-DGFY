import express from 'express';
import { authenticateAdmin, requireAdminPermission } from '../middleware/auth.js';
import { adminPushTestSendLimiter } from '../middleware/rateLimiter.js';
import { PLATFORM_ADMIN_PERMISSION_KEYS } from '../modules/platformAdmin/constants/permissions.js';
import {
  createPushEnrollmentCode,
  getPushDiagnosticsOverview,
  listPushAttempts,
  listPushDiagnosticDevices,
  listPushRegistrations,
  revokePushDiagnosticDevice,
  sendPushDiagnosticTest
} from '../modules/pushDiagnostics/controllers/pushDiagnosticsHandlers.js';

const router = express.Router();

// resolvePlatformAdminRoutePolicy already enforces the page grant inside authenticateAdmin; the
// explicit guard keeps this router safe even if it is ever mounted behind a different prefix.
router.use(authenticateAdmin, requireAdminPermission(PLATFORM_ADMIN_PERMISSION_KEYS.PUSH_DIAGNOSTICS));

router.get('/overview', getPushDiagnosticsOverview);
router.get('/registrations', listPushRegistrations);
router.get('/attempts', listPushAttempts);
router.get('/diagnostic-devices', listPushDiagnosticDevices);
router.post('/enrollment-codes', createPushEnrollmentCode);
router.delete('/diagnostic-devices/:id', revokePushDiagnosticDevice);
router.post('/diagnostic-devices/:id/test-send', adminPushTestSendLimiter, sendPushDiagnosticTest);

export default router;
