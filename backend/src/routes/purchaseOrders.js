import express from 'express';
import * as purchaseOrderController from '../controllers/purchaseOrderController.js';
import { validateCreatePurchaseOrder, validateUpdatePurchaseOrder, validateCreatePurchaseOrderDraft } from '../validators/purchaseOrderValidator.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// Read operations - all authenticated users
router.get('/', purchaseOrderController.getPurchaseOrders);
router.get('/:po_id', purchaseOrderController.getPurchaseOrderById);

// Create and receive operations - managers and admins only
router.post('/', authorize('admin', 'manager'), (req, res, next) => {
  const isDraft = req.query.save_as_draft === 'true' || req.body.status === 'draft';
  if (isDraft) {
    validateCreatePurchaseOrderDraft(req, res, next);
  } else {
    validateCreatePurchaseOrder(req, res, next);
  }
}, purchaseOrderController.createPurchaseOrder);
router.post('/:po_id/receive', authorize('admin', 'manager'), purchaseOrderController.receivePurchaseOrder);

// Finalize draft - managers and admins only
router.patch('/:po_id/finalize', authorize('admin', 'manager'), purchaseOrderController.finalizePurchaseOrder);

export default router;

