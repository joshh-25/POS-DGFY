import express from 'express';
import { authenticateAdmin } from '../middleware/auth.js';
import {
    listAdminRegistrationIndustries,
    createRegistrationIndustry,
    updateRegistrationIndustry,
    setRegistrationIndustryVisibility,
    listRegistrationIndustryVisibilityAuditLogs
} from '../modules/registration/controllers/adminRegistrationIndustryHandlers.js';
import {
    validateCreateRegistrationIndustry,
    validateUpdateRegistrationIndustry,
    validateSetRegistrationIndustryVisibility,
    validateRegistrationIndustryAuditLogQuery
} from '../validators/adminRegistrationIndustryValidator.js';

const router = express.Router();

// Platform-admin curation surface for the registration Industry catalog
// (issue #178 Phase 39 visibility-only; full CRUD as of issue #316) - a
// distinct resource from adminTemplates.js: keyed by industry key, not
// template id, since some industries have no template row at all. Same
// authenticateAdmin gate; every write is audited. No DELETE route exists
// (matching adminTemplates.js) - hidden is the removal mechanism.
router.get('/', authenticateAdmin, listAdminRegistrationIndustries);
router.post('/', authenticateAdmin, validateCreateRegistrationIndustry, createRegistrationIndustry);
router.patch('/:industryKey', authenticateAdmin, validateUpdateRegistrationIndustry, updateRegistrationIndustry);
router.patch('/:industryKey/visibility', authenticateAdmin, validateSetRegistrationIndustryVisibility, setRegistrationIndustryVisibility);
router.get('/:industryKey/audit-logs', authenticateAdmin, validateRegistrationIndustryAuditLogQuery, listRegistrationIndustryVisibilityAuditLogs);

export default router;
