import express from 'express';
import * as supplierController from '../controllers/supplierController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/', supplierController.getSuppliers);
router.get('/:supplier_id', supplierController.getSupplierById);
router.post('/', supplierController.createSupplier);
router.put('/:supplier_id', supplierController.updateSupplier);
router.post('/:supplier_id/items', supplierController.addSupplierItem);

export default router;

