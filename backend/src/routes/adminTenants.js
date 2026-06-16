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
    updateTenantCapabilities,
    listTenantCapabilityAuditLogs,
    getTenantPosMetadata,
    listTenantPosMetadataAuditLogs,
    updateTenantPosMetadata,
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
    adminUpdateComplianceFinalReviewDocumentReview,
    adminAcknowledgeComplianceSecurityIncident,
    adminResolveComplianceSecurityIncident,
    adminSelectComplianceMode,
    adminUpgradeComplianceMode,
    adminForceNonCompliant,
    resubmitRegistration
} from '../controllers/adminTenantController.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { authenticateDgfyAccount } from '../middleware/dgfyAuth.js';
import { tenantRegistrationLimiter } from '../middleware/rateLimiter.js';
import {
    validateComplianceArtifactIdParam,
    validateCompliancePeripheralIdParam,
    validateComplianceVerificationAction,
    validateComplianceChecklistQuery,
    validateComplianceAuditLogQuery,
    validateComplianceSecurityIncidentQuery,
    validateComplianceSecurityIncidentParam,
    validateComplianceSecurityIncidentAction,
    validateAdminComplianceModeChoice,
    validateAdminComplianceModeUpgrade,
    validateComplianceModeDowngrade,
    validateFinalReviewDocumentIdParam,
    validateFinalReviewDocumentReview
} from '../validators/complianceValidator.js';
import {
    validateTenantCapabilityAuditLogQuery,
    validateTenantCapabilityPatch,
    validateTenantPosMetadataPatch
} from '../validators/adminTenantValidator.js';

const router = express.Router();

// PUBLIC ENTRY, DGFY ACCOUNT REQUIRED: Submit company registration request.
router.post('/register', tenantRegistrationLimiter, authenticateDgfyAccount, registerCompanyRequest);

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
router.post('/:id/compliance/mode/select', authenticateAdmin, validateAdminComplianceModeChoice, adminSelectComplianceMode);
router.post('/:id/compliance/mode/upgrade', authenticateAdmin, validateAdminComplianceModeUpgrade, adminUpgradeComplianceMode);
router.post('/:id/force-non-compliant', authenticateAdmin, validateComplianceModeDowngrade, adminForceNonCompliant);

// ADMIN: Compliance verification operations (platform admin)
router.post('/:id/compliance/artifacts/:artifact_id/verification', authenticateAdmin, validateComplianceArtifactIdParam, validateComplianceVerificationAction, adminUpdateComplianceArtifactVerification);
router.post('/:id/compliance/peripherals/:peripheral_id/verification', authenticateAdmin, validateCompliancePeripheralIdParam, validateComplianceVerificationAction, adminUpdateCompliancePeripheralVerification);
router.post('/:id/compliance/final-review/documents/:document_id/review', authenticateAdmin, validateFinalReviewDocumentIdParam, validateFinalReviewDocumentReview, adminUpdateComplianceFinalReviewDocumentReview);

// ADMIN: Update tenant details (status, plan)
router.put('/:id', authenticateAdmin, updateTenant);

// ADMIN: Update tenant product capability switches
router.patch('/:id/capabilities', authenticateAdmin, validateTenantCapabilityPatch, updateTenantCapabilities);
router.get('/:id/capabilities/audit-logs', authenticateAdmin, validateTenantCapabilityAuditLogQuery, listTenantCapabilityAuditLogs);

// ADMIN: Platform-owned DGFY POS software identity and tenant metadata approvals
router.get('/:id/pos-metadata', authenticateAdmin, getTenantPosMetadata);
router.get('/:id/pos-metadata/audit-logs', authenticateAdmin, validateTenantCapabilityAuditLogQuery, listTenantPosMetadataAuditLogs);
router.patch('/:id/pos-metadata', authenticateAdmin, validateTenantPosMetadataPatch, updateTenantPosMetadata);

// ADMIN: Permanently delete tenant
router.delete('/:id', authenticateAdmin, deleteTenant);

// ADMIN: Direct provisioning (legacy, kept for backward compatibility)
router.post('/provision', authenticateAdmin, provisionNewTenant);

export default router;
