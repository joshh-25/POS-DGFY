import express from 'express';
import * as itemController from '../controllers/itemController.js';
import { validateCreateItem, validateUpdateItem } from '../validators/itemValidator.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/', itemController.getItems);
router.get('/:item_id', itemController.getItemById);
router.post('/', validateCreateItem, itemController.createItem);
router.put('/:item_id', validateUpdateItem, itemController.updateItem);
router.delete('/:item_id', itemController.deleteItem);
router.get('/:item_id/stock-history', itemController.getItemStockHistory);
router.get('/:item_id/batches', itemController.getItemBatches);
router.get('/:item_id/movements', itemController.getItemMovements);

export default router;

