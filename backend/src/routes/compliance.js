import express from 'express';
import * as complianceController from '../controllers/complianceController.js';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    validateComplianceModeChoice,
    validateComplianceProfilePatch,
    validateComplianceArtifactCreate,
    validateComplianceArtifactUpdate,
    validateCompliancePeripheralCreate,
    validateCompliancePeripheralUpdate,
    validateComplianceArtifactIdParam,
    validateCompliancePeripheralIdParam,
    validateComplianceVerificationAction,
    validateComplianceChecklistQuery,
    validateComplianceAuditLogQuery,
    validateCompliancePreflight,
    validateComplianceActivateMode
} from '../validators/complianceValidator.js';

const router = express.Router();

router.use(authenticate);

router.get('/profile', checkPermission(PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS), complianceController.getComplianceProfile);
router.post('/mode/select', checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS), validateComplianceModeChoice, complianceController.selectComplianceMode);
router.post('/mode/upgrade', checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS), complianceController.upgradeToCompliant);
router.get('/checklist', checkPermission(PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS), validateComplianceChecklistQuery, complianceController.getComplianceChecklist);
router.post('/activate', checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS), validateComplianceActivateMode, complianceController.activateCompliantMode);

router.put('/profile', checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS), validateComplianceProfilePatch, complianceController.updateComplianceProfile);

router.get('/artifacts', checkPermission(PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS), complianceController.listComplianceArtifacts);
router.post('/artifacts', checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS), validateComplianceArtifactCreate, complianceController.createComplianceArtifact);
router.patch('/artifacts/:artifact_id', checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS), validateComplianceArtifactIdParam, validateComplianceArtifactUpdate, complianceController.updateComplianceArtifact);
router.post('/artifacts/:artifact_id/verification', checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS), validateComplianceArtifactIdParam, validateComplianceVerificationAction, complianceController.updateComplianceArtifactVerification);

router.get('/peripherals', checkPermission(PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS), complianceController.listCompliancePeripherals);
router.post('/peripherals', checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS), validateCompliancePeripheralCreate, complianceController.createCompliancePeripheral);
router.patch('/peripherals/:peripheral_id', checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS), validateCompliancePeripheralIdParam, validateCompliancePeripheralUpdate, complianceController.updateCompliancePeripheral);
router.post('/peripherals/:peripheral_id/verification', checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS), validateCompliancePeripheralIdParam, validateComplianceVerificationAction, complianceController.updateCompliancePeripheralVerification);

router.get('/audit-logs', checkPermission(PERMISSIONS.SYSTEM.actions.VIEW_AUDIT), validateComplianceAuditLogQuery, complianceController.listComplianceAuditLogs);
router.post('/preflight', checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS), validateCompliancePreflight, complianceController.runCompliancePreflight);

export default router;
