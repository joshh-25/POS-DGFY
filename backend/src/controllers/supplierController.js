import * as supplierService from '../services/supplierService.js';

export const getSuppliers = async (req, res, next) => {
  try {
    const result = await supplierService.getSuppliers(req.query);
    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getSupplierById = async (req, res, next) => {
  try {
    const supplier = await supplierService.getSupplierById(req.params.supplier_id);
    res.status(200).json({
      success: true,
      data: supplier,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const createSupplier = async (req, res, next) => {
  try {
    const supplierData = req.validatedData;
    const userId = req.user.user_id;
    const supplier = await supplierService.createSupplier(supplierData, userId);

    const message = supplier.status === 'draft' ? 'Supplier draft saved successfully' : 'Supplier created successfully';

    res.status(201).json({
      success: true,
      data: {
        supplier_id: supplier.supplier_id,
        name: supplier.name,
        status: supplier.status
      },
      message,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const updateSupplier = async (req, res, next) => {
  try {
    const { supplier_id } = req.params;
    const supplierData = req.validatedData;
    const userId = req.user.user_id;
    const supplier = await supplierService.updateSupplier(supplier_id, supplierData, userId);

    res.status(200).json({
      success: true,
      data: supplier,
      message: 'Supplier updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const finalizeSupplier = async (req, res, next) => {
  try {
    const { supplier_id } = req.params;
    const userId = req.user.user_id;
    const supplier = await supplierService.finalizeSupplier(supplier_id, userId);

    res.status(200).json({
      success: true,
      data: supplier,
      message: 'Supplier finalized successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const addSupplierItem = async (req, res, next) => {
  try {
    const supplierItem = await supplierService.addSupplierItem(req.params.supplier_id, req.body);
    res.status(201).json({
      success: true,
      data: supplierItem,
      message: 'Item added to supplier successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSupplier = async (req, res, next) => {
  try {
    const { supplier_id } = req.params;
    const userId = req.user.user_id;

    await supplierService.deleteSupplier(supplier_id, userId);

    res.status(200).json({
      success: true,
      data: null,
      message: 'Supplier deleted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // If error has details array (from validation), include it in response
    if (error.details) {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        details: error.details,
        timestamp: new Date().toISOString()
      });
    }
    next(error);
  }
};

