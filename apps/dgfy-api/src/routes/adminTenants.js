import express from 'express';
import {
    registerCompanyRequest,
    listTenants,
    approveTenant,
    retryTenantProvisioning,
    rejectTenant,
    provisionNewTenant,
    getPricingSettings,
    updatePricingSettings,
    updateTenant,
    updateTenantCapabilities,
    applyTemplateToTenant,
    listTenantCapabilityAuditLogs,
    getTenantPosMetadata,
    listTenantPosMetadataAuditLogs,
    updateTenantPosMetadata,
    getTenantAffiliateSlots,
    listTenantAffiliateSlotsAuditLogs,
    updateTenantAffiliateSlots,
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
    assignTenantOwnerByAdmin,
    createAdminProvisionedAccountAndTenant,
    createAdminProvisionedTenant
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
    validateApplyTemplateToTenant,
    validateTenantPosMetadataPatch,
    validateTenantAffiliateSlotsPatch
} from '../validators/adminTenantValidator.js';
import {
    auditStorefrontDomainDnsDrift,
    createStorefrontDomain,
    listStorefrontDomains,
    makeCanonicalStorefrontDomain,
    reconcileStorefrontDomainEligibility,
    removeStorefrontDomain,
    retryStorefrontDomain,
    suspendStorefrontDomain,
    verifyStorefrontDomain
} from '../modules/storefrontDomains/controllers/storefrontDomainHandlers.js';

const router = express.Router();

// PUBLIC ENTRY, DGFY ACCOUNT REQUIRED: Submit company registration request.
router.post('/register', tenantRegistrationLimiter, authenticateDgfyAccount, registerCompanyRequest);

// ADMIN: List all tenants (requires admin auth)
router.get('/', authenticateAdmin, listTenants);

// ADMIN: Assisted provisioning and handover
router.post('/admin-provision', authenticateAdmin, createAdminProvisionedTenant);
router.post('/admin-provision-with-account', authenticateAdmin, createAdminProvisionedAccountAndTenant);

// ADMIN: Pricing Settings
router.get('/pricing', authenticateAdmin, getPricingSettings);
router.put('/pricing', authenticateAdmin, updatePricingSettings);

// ADMIN: Approve a pending tenant (triggers provisioning)
router.post('/:id/approve', authenticateAdmin, approveTenant);
router.post('/:id/retry-provisioning', authenticateAdmin, retryTenantProvisioning);

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

// ADMIN: Apply a published Store Template to an already-provisioned tenant
// (issue #178 Phase 17) - non-destructive, audited via the same
// TenantAdminAuditLog trail as /:id/capabilities above.
router.post('/:id/apply-template', authenticateAdmin, validateApplyTemplateToTenant, applyTemplateToTenant);
router.post('/:id/owner', authenticateAdmin, assignTenantOwnerByAdmin);

// ADMIN: Platform-owned DGFY POS software identity and tenant metadata approvals
router.get('/:id/pos-metadata', authenticateAdmin, getTenantPosMetadata);
router.get('/:id/pos-metadata/audit-logs', authenticateAdmin, validateTenantCapabilityAuditLogQuery, listTenantPosMetadataAuditLogs);
router.patch('/:id/pos-metadata', authenticateAdmin, validateTenantPosMetadataPatch, updateTenantPosMetadata);

// #1190 (Phase 213) - landlord-admin-only write path for max_affiliate_slots (#447 D5:
// raising the cap is a manual, out-of-band admin action; no self-serve merchant surface).
// Audited via tenant_admin_audit_logs `action = affiliate_slots_update`.
router.get('/:id/affiliate-slots', authenticateAdmin, getTenantAffiliateSlots);
router.get('/:id/affiliate-slots/audit-logs', authenticateAdmin, validateTenantCapabilityAuditLogQuery, listTenantAffiliateSlotsAuditLogs);
router.patch('/:id/affiliate-slots', authenticateAdmin, validateTenantAffiliateSlotsPatch, updateTenantAffiliateSlots);

// ADMIN: Premium storefront custom-domain lifecycle
router.get('/:id/storefront-domains', authenticateAdmin, listStorefrontDomains);
router.post('/:id/storefront-domains', authenticateAdmin, createStorefrontDomain);
router.post('/:id/storefront-domains/:domainId/verify', authenticateAdmin, verifyStorefrontDomain);
router.post('/:id/storefront-domains/:domainId/make-canonical', authenticateAdmin, makeCanonicalStorefrontDomain);
router.post('/:id/storefront-domains/:domainId/retry', authenticateAdmin, retryStorefrontDomain);
router.post('/:id/storefront-domains/:domainId/check-dns', authenticateAdmin, auditStorefrontDomainDnsDrift);
router.post('/:id/storefront-domains/:domainId/suspend', authenticateAdmin, suspendStorefrontDomain);
router.delete('/:id/storefront-domains/:domainId', authenticateAdmin, removeStorefrontDomain);
router.post('/:id/storefront-domains/reconcile-eligibility', authenticateAdmin, reconcileStorefrontDomainEligibility);

// ADMIN: Permanently delete tenant
router.delete('/:id', authenticateAdmin, deleteTenant);

// ADMIN: Direct provisioning (legacy, kept for backward compatibility)
router.post('/provision', authenticateAdmin, provisionNewTenant);

export default router;
