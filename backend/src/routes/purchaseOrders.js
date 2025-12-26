import express from 'express';
import * as purchaseOrderController from '../controllers/purchaseOrderController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/', purchaseOrderController.getPurchaseOrders);
router.get('/:po_id', purchaseOrderController.getPurchaseOrderById);
router.post('/', purchaseOrderController.createPurchaseOrder);
router.post('/:po_id/receive', purchaseOrderController.receivePurchaseOrder);

export default router;

