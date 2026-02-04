import express from 'express';
import * as jobOrderController from '../controllers/jobOrderController.js';
import { validateCreateJobOrder, validateUpdateJobOrder, validateCreateJobOrderDraft } from '../validators/jobOrderValidator.js';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();
router.use(authenticate);

// Read operations - all authenticated users
router.get('/', jobOrderController.getJobOrders);
router.get('/:jo_id', jobOrderController.getJobOrderById);

// Create and complete operations - managers and admins only
router.post('/', checkPermission(PERMISSIONS.ORDERS.actions.CREATE_JO), (req, res, next) => {
  const isDraft = req.query.save_as_draft === 'true' || req.body.status === 'draft';
  if (isDraft) {
    validateCreateJobOrderDraft(req, res, next);
  } else {
    validateCreateJobOrder(req, res, next);
  }
}, jobOrderController.createJobOrder);
router.post('/:jo_id/complete', checkPermission(PERMISSIONS.ORDERS.actions.COMPLETE_JO), jobOrderController.completeJobOrder);

// Finalize draft - managers and admins only
router.patch('/:jo_id/finalize', checkPermission(PERMISSIONS.ORDERS.actions.APPROVE_JO), jobOrderController.finalizeJobOrder);

// Archive/restore - managers and admins only
router.post('/:jo_id/archive', checkPermission(PERMISSIONS.ORDERS.actions.DELETE_JO), jobOrderController.archiveJobOrder);
router.post('/:jo_id/restore', checkPermission(PERMISSIONS.ORDERS.actions.DELETE_JO), jobOrderController.restoreJobOrder);

export default router;

