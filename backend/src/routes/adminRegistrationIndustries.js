import express from 'express';
import { authenticateAdmin } from '../middleware/auth.js';
import {
    listAdminRegistrationIndustries,
    setRegistrationIndustryVisibility,
    listRegistrationIndustryVisibilityAuditLogs
} from '../modules/registration/controllers/adminRegistrationIndustryHandlers.js';
import {
    validateSetRegistrationIndustryVisibility,
    validateRegistrationIndustryAuditLogQuery
} from '../validators/adminRegistrationIndustryValidator.js';

const router = express.Router();

// Platform-admin curation surface for registration Industry visibility
// (issue #178 Phase 39) - a distinct resource from adminTemplates.js: keyed
// by industry key, not template id, since four industries have no template
// row at all. Same authenticateAdmin gate; every write is audited.
router.get('/', authenticateAdmin, listAdminRegistrationIndustries);
router.patch('/:industryKey/visibility', authenticateAdmin, validateSetRegistrationIndustryVisibility, setRegistrationIndustryVisibility);
router.get('/:industryKey/audit-logs', authenticateAdmin, validateRegistrationIndustryAuditLogQuery, listRegistrationIndustryVisibilityAuditLogs);

export default router;
