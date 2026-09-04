import express from 'express';
import { authenticate, requireTenantAdminRole } from '../middleware/auth.js';
import { validateAuditQuery } from '../validators/auditValidator.js';
import * as auditController from '../modules/audit/controllers/auditHandlers.js';

const router = express.Router();

router.use(authenticate);
router.get(
    '/',
    requireTenantAdminRole,
    validateAuditQuery,
    auditController.listAuditLogs
);

export default router;
