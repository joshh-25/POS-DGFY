import express from 'express';
import * as jobOrderController from '../controllers/jobOrderController.js';
import { validateCreateJobOrder, validateUpdateJobOrder, validateCreateJobOrderDraft } from '../validators/jobOrderValidator.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// Read operations - all authenticated users
router.get('/', jobOrderController.getJobOrders);
router.get('/:jo_id', jobOrderController.getJobOrderById);

// Create and complete operations - managers and admins only
router.post('/', authorize('admin', 'manager'), (req, res, next) => {
  const isDraft = req.query.save_as_draft === 'true' || req.body.status === 'draft';
  if (isDraft) {
    validateCreateJobOrderDraft(req, res, next);
  } else {
    validateCreateJobOrder(req, res, next);
  }
}, jobOrderController.createJobOrder);
router.post('/:jo_id/complete', authorize('admin', 'manager'), jobOrderController.completeJobOrder);

// Finalize draft - managers and admins only
router.patch('/:jo_id/finalize', authorize('admin', 'manager'), jobOrderController.finalizeJobOrder);

export default router;

