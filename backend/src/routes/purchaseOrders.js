import express from 'express';
import * as purchaseOrderController from '../controllers/purchaseOrderController.js';
import {
  validateCreatePurchaseOrder,
  validateCreatePurchaseOrderDraft,
  validateReceivePurchaseOrder
} from '../validators/purchaseOrderValidator.js';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireLocalInventoryLedgerOwnership } from '../middleware/inventoryAuthorityGate.js';

const router = express.Router();
router.use(authenticate);

// Read operations - all authenticated users
router.get('/', purchaseOrderController.getPurchaseOrders);
router.get('/:po_id', purchaseOrderController.getPurchaseOrderById);

// Create and receive operations - managers and admins only
router.post('/', checkPermission(PERMISSIONS.ORDERS.actions.CREATE_PO), (req, res, next) => {
  const isDraft = req.query.save_as_draft === 'true' || req.body.status === 'draft';
  if (isDraft) {
    validateCreatePurchaseOrderDraft(req, res, next);
  } else {
    validateCreatePurchaseOrder(req, res, next);
  }
}, purchaseOrderController.createPurchaseOrder);
// Phase 9: receiving stock is squarely "this platform's inventory module
// records the stock effect" (ADR 0029) - once a tenant has delegated
// inventory_authority to an external system, that receiving should happen
// there (with DGFY's local mirror updated by reconciliation), not be
// duplicated here. See inventoryAuthorityGate.js for why this is a sibling
// to requireWorkflowCapability rather than reusing it.
router.post(
  '/:po_id/receive',
  checkPermission(PERMISSIONS.ORDERS.actions.RECEIVE_PO),
  requireLocalInventoryLedgerOwnership('Purchase order receiving'),
  validateReceivePurchaseOrder,
  purchaseOrderController.receivePurchaseOrder
);

// Finalize draft - managers and admins only
router.patch('/:po_id/finalize', checkPermission(PERMISSIONS.ORDERS.actions.APPROVE_PO), purchaseOrderController.finalizePurchaseOrder);

// Archive/restore - managers and admins only
router.post('/:po_id/archive', checkPermission(PERMISSIONS.ORDERS.actions.DELETE_PO), purchaseOrderController.archivePurchaseOrder);
router.post('/:po_id/restore', checkPermission(PERMISSIONS.ORDERS.actions.DELETE_PO), purchaseOrderController.restorePurchaseOrder);

export default router;

