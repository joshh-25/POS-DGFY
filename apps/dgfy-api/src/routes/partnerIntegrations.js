import express from 'express';
import { authenticateAdmin, requireAdminPermission } from '../middleware/auth.js';
import { PLATFORM_ADMIN_PERMISSION_KEYS } from '../modules/platformAdmin/constants/permissions.js';
import {
  createPartnerApp, createPartnerClient, listPartnerApps, listPartnerClients,
  listPartnerCredentials, revokePartnerCredential, rotatePartnerCredential,
  setPartnerAttachmentEntitlements, transitionPartnerApp, transitionPartnerClient
} from '../modules/partnerIdentity/controllers/partnerIdentityHandlers.js';

const router = express.Router();
const guard = [authenticateAdmin, requireAdminPermission(PLATFORM_ADMIN_PERMISSION_KEYS.PARTNER_INTEGRATIONS)];
router.get('/apps', ...guard, listPartnerApps);
router.post('/apps', ...guard, createPartnerApp);
router.post('/apps/:id/:action(approve|suspend|unsuspend|retire)', ...guard, transitionPartnerApp);
router.get('/apps/:id/clients', ...guard, listPartnerClients);
router.post('/apps/:id/clients', ...guard, createPartnerClient);
router.post('/clients/:clientId/:action(activate|suspend|unsuspend|revoke)', ...guard, transitionPartnerClient);
router.get('/clients/:clientId/credentials', ...guard, listPartnerCredentials);
router.post('/clients/:clientId/credentials/rotate', ...guard, rotatePartnerCredential);
router.post('/clients/:clientId/credentials/:versionId/revoke', ...guard, revokePartnerCredential);
router.put('/attachments/:id/entitlements', ...guard, setPartnerAttachmentEntitlements);

export default router;
