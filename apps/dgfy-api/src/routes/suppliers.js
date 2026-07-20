import express from 'express';
import * as supplierController from '../controllers/supplierController.js';
import * as supplierCSVController from '../controllers/supplierCSVController.js';
import { validateCreateSupplier, validateUpdateSupplier, validateCreateSupplierDraft } from '../validators/supplierValidator.js';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();
router.use(authenticate);

// CSV Import/Export routes - must be before :supplier_id routes
router.get('/export', checkPermission(PERMISSIONS.SUPPLIERS.actions.EXPORT_SUPPLIERS), supplierCSVController.exportSuppliers);
router.get('/import/template', checkPermission(PERMISSIONS.SUPPLIERS.actions.IMPORT_SUPPLIERS), supplierCSVController.getTemplate);
router.post('/import/preview', checkPermission(PERMISSIONS.SUPPLIERS.actions.IMPORT_SUPPLIERS), supplierCSVController.previewImport);
router.post('/import/confirm', checkPermission(PERMISSIONS.SUPPLIERS.actions.IMPORT_SUPPLIERS), supplierCSVController.confirmImport);

// Read operations - all authenticated users
router.get('/', supplierController.getSuppliers);
router.get('/:supplier_id', supplierController.getSupplierById);

// Create/Update operations - managers and admins only
router.post('/', checkPermission(PERMISSIONS.SUPPLIERS.actions.CREATE_SUPPLIERS), (req, res, next) => {
  const isDraft = req.query.save_as_draft === 'true' || req.body.status === 'draft';
  if (isDraft) {
    validateCreateSupplierDraft(req, res, next);
  } else {
    validateCreateSupplier(req, res, next);
  }
}, supplierController.createSupplier);
router.put('/:supplier_id', checkPermission(PERMISSIONS.SUPPLIERS.actions.EDIT_SUPPLIERS), validateUpdateSupplier, supplierController.updateSupplier);
router.post('/:supplier_id/items', checkPermission(PERMISSIONS.SUPPLIERS.actions.EDIT_SUPPLIERS), supplierController.addSupplierItem);

// Finalize draft - managers and admins only
router.patch('/:supplier_id/finalize', checkPermission(PERMISSIONS.SUPPLIERS.actions.CREATE_SUPPLIERS), supplierController.finalizeSupplier);

// Delete supplier - admins only
router.delete('/:supplier_id', checkPermission(PERMISSIONS.SUPPLIERS.actions.DELETE_SUPPLIERS), supplierController.deleteSupplier);

export default router;

