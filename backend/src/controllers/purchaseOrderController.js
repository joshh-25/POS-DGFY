import * as purchaseOrderService from '../services/purchaseOrderService.js';

export const getPurchaseOrders = async (req, res, next) => {
  try {
    const result = await purchaseOrderService.getPurchaseOrders(req.query);
    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getPurchaseOrderById = async (req, res, next) => {
  try {
    const po = await purchaseOrderService.getPurchaseOrderById(req.params.po_id);
    res.status(200).json({
      success: true,
      data: po,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const createPurchaseOrder = async (req, res, next) => {
  try {
    const po = await purchaseOrderService.createPurchaseOrder(req.body, req.user.user_id);
    res.status(201).json({
      success: true,
      data: po,
      message: 'Purchase order created successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const receivePurchaseOrder = async (req, res, next) => {
  try {
    const po = await purchaseOrderService.receivePurchaseOrder(
      req.params.po_id,
      req.body,
      req.user.user_id
    );
    res.status(200).json({
      success: true,
      data: po,
      message: 'Purchase order received successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

