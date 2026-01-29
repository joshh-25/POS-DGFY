import express from 'express';
import * as supplierController from '../controllers/supplierController.js';
import * as supplierCSVController from '../controllers/supplierCSVController.js';
import { validateCreateSupplier, validateUpdateSupplier, validateCreateSupplierDraft } from '../validators/supplierValidator.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// CSV Import/Export routes - must be before :supplier_id routes
router.get('/export', authorize('admin', 'manager'), supplierCSVController.exportSuppliers);
router.get('/import/template', authorize('admin', 'manager'), supplierCSVController.getTemplate);
router.post('/import/preview', authorize('admin', 'manager'), supplierCSVController.previewImport);
router.post('/import/confirm', authorize('admin', 'manager'), supplierCSVController.confirmImport);

// Read operations - all authenticated users
router.get('/', supplierController.getSuppliers);
router.get('/:supplier_id', supplierController.getSupplierById);

// Create/Update operations - managers and admins only
router.post('/', authorize('admin', 'manager'), (req, res, next) => {
  const isDraft = req.query.save_as_draft === 'true' || req.body.status === 'draft';
  if (isDraft) {
    validateCreateSupplierDraft(req, res, next);
  } else {
    validateCreateSupplier(req, res, next);
  }
}, supplierController.createSupplier);
router.put('/:supplier_id', authorize('admin', 'manager'), validateUpdateSupplier, supplierController.updateSupplier);
router.post('/:supplier_id/items', authorize('admin', 'manager'), supplierController.addSupplierItem);

// Finalize draft - managers and admins only
router.patch('/:supplier_id/finalize', authorize('admin', 'manager'), supplierController.finalizeSupplier);

// Delete supplier - admins only
router.delete('/:supplier_id', authorize('admin'), supplierController.deleteSupplier);

export default router;

