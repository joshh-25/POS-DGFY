import express from 'express';
import * as itemController from '../controllers/itemController.js';
import { validateCreateItem, validateUpdateItem, validateCreateItemDraft } from '../validators/itemValidator.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Read-only operations - all authenticated users
router.get('/', itemController.getItems);
router.get('/:item_id', itemController.getItemById);
router.get('/:item_id/stock-history', itemController.getItemStockHistory);
router.get('/:item_id/batches', itemController.getItemBatches);
router.get('/:item_id/movements', itemController.getItemMovements);

// Create/Update operations - managers and admins only
router.post('/', authorize('admin', 'manager'), (req, res, next) => {
  // Use draft validator if save_as_draft query param is true
  const isDraft = req.query.save_as_draft === 'true' || req.body.status === 'draft';
  if (isDraft) {
    validateCreateItemDraft(req, res, next);
  } else {
    validateCreateItem(req, res, next);
  }
}, itemController.createItem);
router.put('/:item_id', authorize('admin', 'manager'), validateUpdateItem, itemController.updateItem);

// Finalize draft - managers and admins only
router.patch('/:item_id/finalize', authorize('admin', 'manager'), itemController.finalizeItem);

// Delete operations - admins only
router.delete('/:item_id', authorize('admin'), itemController.deleteItem);

export default router;

