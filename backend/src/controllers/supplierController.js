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
    const supplier = await supplierService.createSupplier(req.body);
    res.status(201).json({
      success: true,
      data: {
        supplier_id: supplier.supplier_id,
        name: supplier.name
      },
      message: 'Supplier created successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const updateSupplier = async (req, res, next) => {
  try {
    const supplier = await supplierService.updateSupplier(req.params.supplier_id, req.body);
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

