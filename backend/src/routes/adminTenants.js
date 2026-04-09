import express from 'express';
import {
    registerCompanyRequest,
    listTenants,
    approveTenant,
    rejectTenant,
    provisionNewTenant,
    getPricingSettings,
    updatePricingSettings,
    updateTenant,
    deleteTenant,
    setupPayPalRecurring,
    adminChangePlan,
    adminReactivateTenant,
    adminListComplianceArtifacts,
    adminListCompliancePeripherals,
    adminGetComplianceChecklist,
    adminListComplianceAuditLogs,
    adminListComplianceSecurityIncidents,
    adminUpdateComplianceArtifactVerification,
    adminUpdateCompliancePeripheralVerification,
    adminAcknowledgeComplianceSecurityIncident,
    adminResolveComplianceSecurityIncident,
    resubmitRegistration
} from '../controllers/adminTenantController.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { tenantRegistrationLimiter } from '../middleware/rateLimiter.js';
import {
    validateComplianceArtifactIdParam,
    validateCompliancePeripheralIdParam,
    validateComplianceVerificationAction,
    validateComplianceChecklistQuery,
    validateComplianceAuditLogQuery,
    validateComplianceSecurityIncidentQuery,
    validateComplianceSecurityIncidentParam,
    validateComplianceSecurityIncidentAction
} from '../validators/complianceValidator.js';

const router = express.Router();

// PUBLIC: Submit company registration request (no auth required)
router.post('/register', tenantRegistrationLimiter, registerCompanyRequest);

// PUBLIC: Re-submit a rejected registration (x-company-token only, no JWT)
router.post('/resubmit', tenantRegistrationLimiter, resubmitRegistration);

// ADMIN: List all tenants (requires admin auth)
router.get('/', authenticateAdmin, listTenants);

// ADMIN: Pricing Settings
router.get('/pricing', authenticateAdmin, getPricingSettings);
router.put('/pricing', authenticateAdmin, updatePricingSettings);

// ADMIN: Approve a pending tenant (triggers provisioning)
router.post('/:id/approve', authenticateAdmin, approveTenant);

// ADMIN: Reject a pending tenant
router.post('/:id/reject', authenticateAdmin, rejectTenant);

// ADMIN: Setup PayPal recurring billing for a manual tenant
router.post('/:id/setup-paypal-recurring', authenticateAdmin, setupPayPalRecurring);

// ADMIN: Change tenant plan (immediate override)
router.post('/:id/change-plan', authenticateAdmin, adminChangePlan);

// ADMIN: Reactivate an inactive tenant
router.post('/:id/reactivate', authenticateAdmin, adminReactivateTenant);

// ADMIN: Compliance review reads (platform admin)
router.get('/:id/compliance/artifacts', authenticateAdmin, adminListComplianceArtifacts);
router.get('/:id/compliance/peripherals', authenticateAdmin, adminListCompliancePeripherals);
router.get('/:id/compliance/checklist', authenticateAdmin, validateComplianceChecklistQuery, adminGetComplianceChecklist);
router.get('/:id/compliance/audit-logs', authenticateAdmin, validateComplianceAuditLogQuery, adminListComplianceAuditLogs);
router.get('/:id/compliance/security-incidents', authenticateAdmin, validateComplianceSecurityIncidentQuery, adminListComplianceSecurityIncidents);
router.post('/:id/compliance/security-incidents/:incident_id/acknowledge', authenticateAdmin, validateComplianceSecurityIncidentParam, validateComplianceSecurityIncidentAction, adminAcknowledgeComplianceSecurityIncident);
router.post('/:id/compliance/security-incidents/:incident_id/resolve', authenticateAdmin, validateComplianceSecurityIncidentParam, validateComplianceSecurityIncidentAction, adminResolveComplianceSecurityIncident);

// ADMIN: Compliance verification operations (platform admin)
router.post('/:id/compliance/artifacts/:artifact_id/verification', authenticateAdmin, validateComplianceArtifactIdParam, validateComplianceVerificationAction, adminUpdateComplianceArtifactVerification);
router.post('/:id/compliance/peripherals/:peripheral_id/verification', authenticateAdmin, validateCompliancePeripheralIdParam, validateComplianceVerificationAction, adminUpdateCompliancePeripheralVerification);

// ADMIN: Update tenant details (status, plan)
router.put('/:id', authenticateAdmin, updateTenant);

// ADMIN: Permanently delete tenant
router.delete('/:id', authenticateAdmin, deleteTenant);

// ADMIN: Direct provisioning (legacy, kept for backward compatibility)
router.post('/provision', authenticateAdmin, provisionNewTenant);

export default router;
