import * as jobOrderService from '../services/jobOrderService.js';

export const getJobOrders = async (req, res, next) => {
  try {
    const result = await jobOrderService.getJobOrders(req.query);
    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getJobOrderById = async (req, res, next) => {
  try {
    const jo = await jobOrderService.getJobOrderById(req.params.jo_id);
    res.status(200).json({
      success: true,
      data: jo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const createJobOrder = async (req, res, next) => {
  try {
    const jo = await jobOrderService.createJobOrder(req.body, req.user.user_id);
    res.status(201).json({
      success: true,
      data: jo,
      message: 'Job order created successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const completeJobOrder = async (req, res, next) => {
  try {
    const jo = await jobOrderService.completeJobOrder(req.params.jo_id, req.user.user_id);
    res.status(200).json({
      success: true,
      data: jo,
      message: 'Job order completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

