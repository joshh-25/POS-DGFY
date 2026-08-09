import express from 'express';
import { authenticateAdmin } from '../middleware/auth.js';
import {
    listTemplates,
    getTemplate,
    listTemplateAuditLogs,
    createDraftTemplate,
    updateTemplateModules,
    publishTemplate,
    deprecateTemplate
} from '../modules/templates/controllers/storeConfigurationTemplateHandlers.js';
import {
    validateCreateDraftTemplate,
    validateUpdateTemplateModules,
    validateTemplateAction,
    validateTemplateListQuery,
    validateTemplateAuditLogQuery
} from '../validators/adminTemplateValidator.js';

const router = express.Router();

// Platform-admin curation surface for the Store Template catalog (issue
// #178 Phase 14, ADR 0056). Same authenticateAdmin gate as adminTenants.js;
// every write is audited (backend/src/modules/templates/README.md).
router.get('/', authenticateAdmin, validateTemplateListQuery, listTemplates);
router.post('/', authenticateAdmin, validateCreateDraftTemplate, createDraftTemplate);
router.get('/:id', authenticateAdmin, getTemplate);
router.get('/:id/audit-logs', authenticateAdmin, validateTemplateAuditLogQuery, listTemplateAuditLogs);
router.patch('/:id/modules', authenticateAdmin, validateUpdateTemplateModules, updateTemplateModules);
router.post('/:id/publish', authenticateAdmin, validateTemplateAction, publishTemplate);
router.post('/:id/deprecate', authenticateAdmin, validateTemplateAction, deprecateTemplate);

export default router;
